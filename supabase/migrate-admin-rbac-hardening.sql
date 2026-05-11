-- ============================================================
-- Mazed Auto — Admin RBAC hardening (critical security fix)
--
-- Problem (audit finding #1):
--   `is_admin()` reads from `auth.jwt() -> 'user_metadata' ->> 'role'`.
--   `getAdminRole()` in lib/admin.ts reads from `user_metadata.adminRole`.
--   Both feed off `raw_user_meta_data`, which is client-writable via
--   `supabase.auth.updateUser({ data: { role: 'admin' } })`. A malicious
--   user can self-promote in their browser console and the JWT refresh
--   makes them admin everywhere.
--
-- Fix:
--   Introduce `admin_users` table as the single source of truth.
--   Rewrite `is_admin()`, `admin_role()`, `has_admin_capability()` to
--   read from this table. Backfill existing admins from user_metadata
--   so nothing breaks on rollout. Privileged fields stay in
--   `user_metadata` only as a UI hint (no longer security-load-bearing).
--
--   New RPCs `admin_grant_role()` and `admin_revoke_role()` are the
--   ONLY way to mutate the table — both are super_admin gated and
--   audit-logged.
--
-- Depends on: _apply-all.sql (admin_audit_log, admin_role, is_admin)
-- Safe to run repeatedly.
-- ============================================================

-- 1) The source-of-truth table -----------------------------------------------
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  admin_role text not null
    check (admin_role in ('super_admin','admin','moderator','support','finance')),
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Only admins can SELECT — UI uses admin_list_admins() RPC for the listing
drop policy if exists "admin_users_admin_read" on public.admin_users;
create policy "admin_users_admin_read" on public.admin_users
  for select to authenticated using (public.is_admin());

-- No client-side INSERT/UPDATE/DELETE — everything goes through the RPCs
drop policy if exists "admin_users_no_write" on public.admin_users;
create policy "admin_users_no_write" on public.admin_users
  for all to authenticated using (false) with check (false);


-- 2) Backfill from raw_user_meta_data ----------------------------------------
-- Pull anyone currently marked admin via the legacy `role`/`adminRole`
-- metadata fields into the new table. Idempotent — `on conflict do nothing`.
insert into public.admin_users (user_id, admin_role, granted_at)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'adminRole', ''),
    case when u.raw_user_meta_data ->> 'role' = 'admin' then 'admin' end
  )::text as admin_role,
  coalesce(u.created_at, now())
from auth.users u
where (
        u.raw_user_meta_data ->> 'role' = 'admin'
     or u.raw_user_meta_data ->> 'adminRole' is not null
      )
  and coalesce(
        nullif(u.raw_user_meta_data ->> 'adminRole', ''),
        case when u.raw_user_meta_data ->> 'role' = 'admin' then 'admin' end
      ) in ('super_admin','admin','moderator','support','finance')
on conflict (user_id) do update
   set admin_role = excluded.admin_role
   where public.admin_users.admin_role <> excluded.admin_role;


-- 3) Rewrite is_admin() / admin_role() to read from the table ---------------
-- STABLE so the planner caches the per-query result.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.admin_users
    where user_id = auth.uid()
  )
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

create or replace function public.admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select admin_role from public.admin_users where user_id = auth.uid()
$$;

revoke all on function public.admin_role() from public;
grant execute on function public.admin_role() to authenticated, anon;


-- 4) Update admin_list_admins() to use the new table ------------------------
-- super_admin sees every admin row joined with the auth/profile data.
create or replace function public.admin_list_admins()
returns table (
  id           uuid,
  email        text,
  first_name   text,
  last_name    text,
  display_name text,
  admin_role   text,
  created_at   timestamptz,
  last_seen    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_role() is null then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select
    u.id,
    u.email::text,
    (u.raw_user_meta_data ->> 'firstName')::text as first_name,
    (u.raw_user_meta_data ->> 'lastName')::text  as last_name,
    coalesce(s.display_name,
             nullif(btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                          coalesce(u.raw_user_meta_data->>'lastName','')),''),
             split_part(u.email,'@',1))::text   as display_name,
    a.admin_role::text,
    a.granted_at,
    (select max(sess.last_seen)
       from public.admin_sessions sess
      where sess.user_id = u.id)                as last_seen
  from public.admin_users a
  join auth.users u on u.id = a.user_id
  left join public.sellers s on s.id = u.id
  order by a.granted_at desc;
end; $$;

grant execute on function public.admin_list_admins() to authenticated;


-- 5) admin_grant_role() — the only way to promote a user --------------------
-- super_admin only. Audit-logged.
create or replace function public.admin_grant_role(
  p_user_id    uuid,
  p_admin_role text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_role() <> 'super_admin' then
    raise exception 'NOT_SUPER_ADMIN';
  end if;
  if p_admin_role not in ('super_admin','admin','moderator','support','finance') then
    raise exception 'INVALID_ROLE';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.admin_users (user_id, admin_role, granted_by, granted_at)
  values (p_user_id, p_admin_role, auth.uid(), now())
  on conflict (user_id) do update
     set admin_role = excluded.admin_role,
         granted_by = excluded.granted_by,
         granted_at = excluded.granted_at;

  -- Mirror into user_metadata so legacy UI bits (the gold admin chip in
  -- ProfileMenu) keep showing the right role even before the next JWT
  -- refresh. Security no longer depends on this — is_admin() reads the
  -- table directly — but the metadata stays a useful display hint.
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('adminRole', p_admin_role, 'role', 'admin')
   where id = p_user_id;

  insert into public.admin_audit_log (
    actor_id, actor_role, action, target_user_id, detail, metadata
  ) values (
    auth.uid(),
    public.admin_role(),
    'admin.role.grant',
    p_user_id,
    p_admin_role,
    jsonb_build_object('role', p_admin_role)
  );
end; $$;

revoke all on function public.admin_grant_role(uuid, text) from public;
grant execute on function public.admin_grant_role(uuid, text) to authenticated;


-- 6) admin_revoke_role() — the only way to demote --------------------------
create or replace function public.admin_revoke_role(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_role text;
begin
  if public.admin_role() <> 'super_admin' then
    raise exception 'NOT_SUPER_ADMIN';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'CANNOT_REVOKE_SELF';
  end if;

  select admin_role into v_old_role
    from public.admin_users where user_id = p_user_id;
  if v_old_role is null then
    raise exception 'NOT_AN_ADMIN';
  end if;

  delete from public.admin_users where user_id = p_user_id;

  -- Strip the legacy fields from user_metadata too so the UI stops
  -- showing the admin chip on the next JWT refresh.
  update auth.users
     set raw_user_meta_data = (raw_user_meta_data - 'role' - 'adminRole')
   where id = p_user_id;

  insert into public.admin_audit_log (
    actor_id, actor_role, action, target_user_id, detail, metadata
  ) values (
    auth.uid(),
    public.admin_role(),
    'admin.role.revoke',
    p_user_id,
    v_old_role,
    jsonb_build_object('previous_role', v_old_role)
  );
end; $$;

revoke all on function public.admin_revoke_role(uuid) from public;
grant execute on function public.admin_revoke_role(uuid) to authenticated;


-- 7) Update the existing admin_set_role() to also write to admin_users -----
-- The TS server action `adminSetRoleAction` calls this RPC. Without
-- updating it, the AddAdminForm UI would write only to user_metadata
-- (which is_admin() no longer trusts) and the new admin would still
-- be locked out. Mirror the write into admin_users so both paths work.
create or replace function public.admin_set_role(
  p_user_id uuid,
  p_role    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not public.has_admin_capability('admin.role.assign') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if p_role is not null and p_role not in
     ('super_admin','admin','moderator','support','finance') then
    raise exception 'INVALID_ROLE';
  end if;

  select admin_role into v_old
    from public.admin_users where user_id = p_user_id;

  if p_role is null then
    -- Revoke
    delete from public.admin_users where user_id = p_user_id;
    update auth.users
       set raw_user_meta_data =
             (coalesce(raw_user_meta_data, '{}'::jsonb) - 'adminRole') - 'role'
     where id = p_user_id;
  else
    -- Grant / update
    insert into public.admin_users (user_id, admin_role, granted_by, granted_at)
    values (p_user_id, p_role, auth.uid(), now())
    on conflict (user_id) do update
       set admin_role = excluded.admin_role,
           granted_by = excluded.granted_by,
           granted_at = excluded.granted_at;
    -- Mirror into user_metadata as a UI hint (no longer security-critical)
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('adminRole', p_role, 'role', 'admin')
     where id = p_user_id;
  end if;

  perform public.log_admin_action(
    'admin.role.assign',
    p_target_user_id => p_user_id,
    p_detail         => coalesce(v_old, 'none') || ' → ' || coalesce(p_role, 'none')
  );
end; $$;

grant execute on function public.admin_set_role(uuid, text) to authenticated;


-- 8) Diagnostic ------------------------------------------------------------
do $$
declare
  v_admins int;
begin
  select count(*) into v_admins from public.admin_users;
  raise notice 'admin_users now contains % rows', v_admins;
end $$;
