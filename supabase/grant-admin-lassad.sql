-- ============================================================
-- Mazed Auto — Promote Lassad Elleuch to super_admin
--
-- After the round-12 RBAC hardening, the source of truth for admin
-- access is the `admin_users` table (read by is_admin() / admin_role()).
-- `user_metadata.role` / `adminRole` are kept as UI hints only.
--
-- This script:
--   1. Resolves the user by seller username @lassad.mazed.
--   2. Upserts a row into public.admin_users with role 'super_admin'.
--   3. Mirrors `role='admin'` + `adminRole='super_admin'` into
--      auth.users.raw_user_meta_data so the admin chip in ProfileMenu
--      shows up without waiting for the next JWT refresh.
--   4. Emits a diagnostic so you can confirm the grant landed.
--
-- Idempotent — re-running just keeps the role set.
-- ============================================================

do $$
declare
  v_user_id uuid;
begin
  select s.id into v_user_id
    from public.sellers s
   where s.username = 'lassad.mazed'
   limit 1;

  if v_user_id is null then
    raise exception 'USER_NOT_FOUND: no seller with username @lassad.mazed';
  end if;

  -- 1) admin_users (the real gate)
  insert into public.admin_users (user_id, admin_role, granted_by, granted_at)
  values (v_user_id, 'super_admin', v_user_id, now())
  on conflict (user_id) do update
    set admin_role = excluded.admin_role,
        granted_at = excluded.granted_at;

  -- 2) user_metadata (display only)
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('adminRole', 'super_admin', 'role', 'admin')
   where id = v_user_id;

  raise notice 'Granted super_admin to user %', v_user_id;
end $$;

-- Diagnostic — should return one row with admin_role=super_admin
select
  u.id,
  u.email,
  s.username,
  s.display_name,
  a.admin_role,
  u.raw_user_meta_data->>'adminRole' as meta_admin_role,
  u.raw_user_meta_data->>'role'      as meta_role,
  a.granted_at
from auth.users u
left join public.sellers s    on s.id = u.id
left join public.admin_users a on a.user_id = u.id
where s.username = 'lassad.mazed';
