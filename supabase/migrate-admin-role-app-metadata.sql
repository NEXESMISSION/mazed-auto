-- ============================================================
-- Mazed Auto — Move admin role into app_metadata (audit fix M-1)
-- Idempotent — safe to re-run.
--
-- Background:
--   Supabase splits user JSON metadata into two fields:
--     - user_metadata  → CLIENT-WRITABLE (any signed-in user can call
--       supabase.auth.updateUser({ data: {...} }) and change their own).
--     - app_metadata   → SERVICE-ROLE-ONLY. Cannot be written from the
--       browser. Both end up in the JWT.
--
--   The Next.js admin gate (src/proxy.ts + src/lib/admin.ts) was
--   reading `user_metadata.adminRole` to decide whether to render the
--   /admin/* UI. Any signed-in user could spoof that and reach the
--   admin shell. The DB layer was still safe (RLS uses is_admin() →
--   admin_users table), but the UI bypass leaks structure and is a
--   trust violation.
--
-- Fix:
--   - admin_set_role() now mirrors the role into raw_app_meta_data
--     (in addition to the legacy user_metadata mirror, which we keep
--     for backwards-compat with anything still reading it).
--   - One-shot backfill: every existing row in public.admin_users
--     gets its role copied into raw_app_meta_data.adminRole.
--
-- After this migration the proxy & getAdminRole() can switch to read
-- from app_metadata, which is impossible to forge.
-- ============================================================


-- 1) Re-create admin_set_role() to mirror into raw_app_meta_data ----------
create or replace function public.admin_set_role(
  p_user_id uuid,
  p_role    text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
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
    -- Revoke: remove from table + strip both metadata fields.
    delete from public.admin_users where user_id = p_user_id;
    update auth.users
       set raw_user_meta_data =
             (coalesce(raw_user_meta_data, '{}'::jsonb) - 'adminRole') - 'role',
           raw_app_meta_data =
             (coalesce(raw_app_meta_data, '{}'::jsonb) - 'adminRole')
     where id = p_user_id;
  else
    -- Grant / update.
    insert into public.admin_users (user_id, admin_role, granted_by, granted_at)
    values (p_user_id, p_role, auth.uid(), now())
    on conflict (user_id) do update
       set admin_role = excluded.admin_role,
           granted_by = excluded.granted_by,
           granted_at = excluded.granted_at;
    -- Mirror into BOTH metadata fields:
    --   - app_metadata.adminRole  → trustworthy (service-role only writes)
    --   - user_metadata.adminRole → legacy UI hint, kept for backcompat.
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
            || jsonb_build_object('adminRole', p_role, 'role', 'admin'),
           raw_app_meta_data  = coalesce(raw_app_meta_data, '{}'::jsonb)
            || jsonb_build_object('adminRole', p_role)
     where id = p_user_id;
  end if;

  perform public.log_admin_action(
    'admin.role.assign',
    p_target_user_id => p_user_id,
    p_detail         => coalesce(v_old, 'none') || ' → ' || coalesce(p_role, 'none')
  );
end; $$;

grant execute on function public.admin_set_role(uuid, text) to authenticated;


-- 2) Re-create admin_grant_role() (round-12 hardening variant) -------------
-- Same fix for the second entry-point that some admin UIs call.
create or replace function public.admin_grant_role(
  p_user_id    uuid,
  p_admin_role text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
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

  -- Mirror into BOTH metadata fields (see admin_set_role for rationale).
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('adminRole', p_admin_role, 'role', 'admin'),
         raw_app_meta_data  = coalesce(raw_app_meta_data, '{}'::jsonb)
          || jsonb_build_object('adminRole', p_admin_role)
   where id = p_user_id;

  perform public.log_admin_action(
    'admin.role.grant',
    p_target_user_id => p_user_id,
    p_detail         => 'role=' || p_admin_role
  );
end; $$;

grant execute on function public.admin_grant_role(uuid, text) to authenticated;


-- 3) Re-create admin_revoke_role() to also strip app_metadata --------------
create or replace function public.admin_revoke_role(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old text;
begin
  if public.admin_role() <> 'super_admin' then
    raise exception 'NOT_SUPER_ADMIN';
  end if;

  select admin_role into v_old
    from public.admin_users where user_id = p_user_id;

  delete from public.admin_users where user_id = p_user_id;

  update auth.users
     set raw_user_meta_data =
           (coalesce(raw_user_meta_data, '{}'::jsonb) - 'adminRole') - 'role',
         raw_app_meta_data =
           (coalesce(raw_app_meta_data, '{}'::jsonb) - 'adminRole')
   where id = p_user_id;

  perform public.log_admin_action(
    'admin.role.revoke',
    p_target_user_id => p_user_id,
    p_detail         => 'previous_role=' || coalesce(v_old, 'none')
  );
end; $$;

revoke all on function public.admin_revoke_role(uuid) from public;
grant execute on function public.admin_revoke_role(uuid) to authenticated;


-- 4) One-shot backfill: copy admin_users.admin_role → app_metadata --------
-- Without this, existing admins would lose their UI access until they
-- get re-granted. Idempotent — overwrites the same value if re-run.
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('adminRole', a.admin_role)
  from public.admin_users a
 where a.user_id = u.id
   and (
     u.raw_app_meta_data is null
     or u.raw_app_meta_data ->> 'adminRole' is distinct from a.admin_role
   );


-- 5) M-2: lock down platform-side transactions (user_id IS NULL) ----------
-- The legacy `tx_demo_public_read` policy on public.transactions used to
-- expose every row with user_id IS NULL — those are platform commission
-- entries (forfeit_fee, payouts, etc.) labelled "Mazed Auto". Anyone
-- could read aggregate platform revenue. Drop the policy. Admins still
-- read everything via `tx_admin_read` (already exists or created here).
drop policy if exists "tx_demo_public_read" on public.transactions;

drop policy if exists "tx_admin_read" on public.transactions;
create policy "tx_admin_read" on public.transactions
  for select
  to authenticated
  using (public.is_admin());


-- Diagnostic ----------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from auth.users u
    join public.admin_users a on a.user_id = u.id
   where u.raw_app_meta_data ->> 'adminRole' = a.admin_role;
  raise notice 'app_metadata.adminRole synced for % admin user(s)', v_count;
  raise notice 'tx_demo_public_read dropped; admin-only reads via tx_admin_read';
end $$;
