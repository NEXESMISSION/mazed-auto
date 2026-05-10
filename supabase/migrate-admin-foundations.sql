-- ============================================================
-- Mazed Auto — Admin foundations
--
-- Per PLAN §22.2: 5 admin roles (super_admin, admin, moderator,
-- support, finance). Per §22.3: every admin action is auditable.
--
-- This migration introduces:
--  1. Per-user admin role lives in `user_metadata.adminRole` (mirrored
--     in JWT) so the existing `is_admin()` helper keeps working as a
--     coarse gate while we add fine-grained checks.
--  2. `public.admin_role()` reads the role from the JWT.
--  3. `public.has_admin_capability(cap)` returns true when the caller's
--     role can perform a given capability — single source of truth so
--     UI and RPCs agree on what each role can do.
--  4. `admin_audit_log` table — every admin action across the platform
--     writes one row here. RPCs use `log_admin_action()` to insert.
--  5. `admin_sessions` table — last-activity timestamp for the 30-min
--     idle timeout (PLAN §22.3).
--
-- Safe to run repeatedly.
-- ============================================================

-- 1) Role helper -------------------------------------------------------------
-- Returns the caller's adminRole, or null if not an admin user.
-- We check the legacy `role = 'admin'` first (back-compat: anyone marked
-- admin before this migration is treated as 'admin') and fall back to
-- the explicit `adminRole` field.
create or replace function public.admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  with j as (select auth.jwt() -> 'user_metadata' as m)
  select case
    when (select m ->> 'adminRole' from j) in
         ('super_admin','admin','moderator','support','finance')
      then (select m ->> 'adminRole' from j)
    when (select m ->> 'role' from j) = 'admin'
      then 'admin'
    else null
  end
$$;

revoke all on function public.admin_role() from public;
grant execute on function public.admin_role() to authenticated, anon;

-- 2) Capability helper ------------------------------------------------------
-- Given a capability name (e.g. 'kyc.review'), returns true when the
-- caller's adminRole is allowed to perform it. Used by RPCs that need
-- finer gating than the binary `is_admin()`.
create or replace function public.has_admin_capability(p_cap text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r text := public.admin_role();
begin
  if r is null then return false; end if;
  if r = 'super_admin' then return true; end if;

  -- Capability matrix (PLAN §22.2):
  --   super_admin  → everything
  --   admin        → everything EXCEPT user.delete and admin.manage
  --   moderator    → auction/kyc/report moderation
  --   support      → read-only + reply to messages/contact
  --   finance      → read-only + financial actions (payouts, refunds)
  return case
    when r = 'admin' then
      p_cap not in ('user.delete', 'admin.manage', 'admin.role.assign')

    when r = 'moderator' then p_cap in (
      'kyc.review', 'auction.moderate', 'auction.edit_request',
      'report.moderate', 'user.warn', 'user.suspend', 'user.view',
      'auction.view', 'broadcast.create')

    when r = 'support' then p_cap in (
      'user.view', 'user.warn', 'auction.view', 'report.view',
      'message.read_for_moderation', 'contact.reply', 'broadcast.create')

    when r = 'finance' then p_cap in (
      'transaction.view', 'transaction.refund', 'transaction.void',
      'transaction.adjust', 'payout.create', 'payout.mark_paid',
      'report.financial.export', 'user.view', 'auction.view')

    else false
  end;
end; $$;

revoke all on function public.has_admin_capability(text) from public;
grant execute on function public.has_admin_capability(text) to authenticated, anon;

-- 3) admin_audit_log --------------------------------------------------------
-- Append-only journal of every admin action. RPCs that mutate state
-- on behalf of an admin MUST call public.log_admin_action() before
-- returning so the action is reviewable.
create table if not exists public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_role   text,
  action       text not null,
  -- Free-form target fields. action determines which are populated.
  target_user_id    uuid,
  target_auction_id uuid,
  target_id         uuid,
  target_type       text,
  detail       text,
  metadata     jsonb,
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists admin_audit_actor_idx
  on public.admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_action_idx
  on public.admin_audit_log (action, created_at desc);
create index if not exists admin_audit_target_user_idx
  on public.admin_audit_log (target_user_id, created_at desc)
  where target_user_id is not null;
create index if not exists admin_audit_target_auction_idx
  on public.admin_audit_log (target_auction_id, created_at desc)
  where target_auction_id is not null;

alter table public.admin_audit_log enable row level security;
drop policy if exists "admin_audit_admin_read" on public.admin_audit_log;
create policy "admin_audit_admin_read" on public.admin_audit_log
  for select to authenticated using (public.is_admin());
-- No insert/update/delete policy — writes are SECURITY DEFINER only.

-- Helper RPC: lets server-side code (next.js server actions, other
-- RPCs) record an admin action without granting them direct INSERT.
create or replace function public.log_admin_action(
  p_action            text,
  p_target_user_id    uuid default null,
  p_target_auction_id uuid default null,
  p_target_id         uuid default null,
  p_target_type       text default null,
  p_detail            text default null,
  p_metadata          jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Allow SECURITY DEFINER callers (other RPCs running as the
  -- current admin) to log on the admin's behalf. We require that
  -- the caller be an admin in some form — this prevents a non-admin
  -- end-user from spamming the log via a malformed RPC call.
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  insert into public.admin_audit_log (
    actor_id, actor_role, action,
    target_user_id, target_auction_id, target_id, target_type,
    detail, metadata
  ) values (
    auth.uid(), public.admin_role(), p_action,
    p_target_user_id, p_target_auction_id, p_target_id, p_target_type,
    p_detail, p_metadata
  ) returning id into v_id;
  return v_id;
end; $$;

grant execute on function public.log_admin_action(text, uuid, uuid, uuid, text, text, jsonb)
  to authenticated;

-- 4) admin_sessions ---------------------------------------------------------
-- One row per (admin_user_id, session_id). Updated on each admin
-- request via `touch_admin_session()`. The Next.js admin layout reads
-- last_seen and forces re-auth if it's older than 30 minutes.
create table if not exists public.admin_sessions (
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  text not null,
  last_seen   timestamptz not null default now(),
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now(),
  primary key (user_id, session_id)
);

create index if not exists admin_sessions_last_seen_idx
  on public.admin_sessions (last_seen desc);

alter table public.admin_sessions enable row level security;
drop policy if exists "admin_sessions_self_read" on public.admin_sessions;
create policy "admin_sessions_self_read" on public.admin_sessions
  for select to authenticated using (
    user_id = auth.uid() or public.is_admin()
  );

create or replace function public.touch_admin_session(p_session_id text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  insert into public.admin_sessions (user_id, session_id, last_seen)
  values (auth.uid(), p_session_id, v_now)
  on conflict (user_id, session_id)
    do update set last_seen = excluded.last_seen;
  return v_now;
end; $$;

grant execute on function public.touch_admin_session(text) to authenticated;

-- 5) RPC: assign / change an admin's role (super_admin only) ----------------
create or replace function public.admin_set_role(
  p_user_id uuid,
  p_role    text  -- one of super_admin, admin, moderator, support, finance, or null to revoke
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

  select raw_user_meta_data ->> 'adminRole' into v_old
    from auth.users where id = p_user_id;

  update auth.users
     set raw_user_meta_data = case
       when p_role is null then
         (coalesce(raw_user_meta_data, '{}'::jsonb) - 'adminRole') - 'role'
       else
         coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('adminRole', p_role, 'role', 'admin')
     end
   where id = p_user_id;

  perform public.log_admin_action(
    'admin.role.assign',
    p_target_user_id => p_user_id,
    p_detail         => coalesce(v_old, 'none') || ' → ' || coalesce(p_role, 'none')
  );
end; $$;

grant execute on function public.admin_set_role(uuid, text) to authenticated;
