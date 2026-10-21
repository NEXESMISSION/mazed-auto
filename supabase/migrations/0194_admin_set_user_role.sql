-- ============================================================================
-- Admins can change a user's role again — and only admins can.
--
-- The console rebuild moved "changer le rôle" into /api/admin/vendeurs/[id],
-- which writes `profiles.role` straight through the service-role client. The
-- service role carries no admin JWT, so _guard_profile_self_update (0015)
-- refuses every change with "forbidden: cannot change protected column without
-- admin" and the route answers `role_update_failed`. The route it replaced
-- called admin_set_user_role (0144), which opened the guard's bypass window for
-- anyone holding the service key and checked nothing itself.
--
-- admin_set_user_role is now the one door, and it checks its caller:
--
--   * it raises `forbidden` unless public.is_admin() — the caller's own JWT
--     claim or profiles.role, the same test the guard applies;
--   * only individual | agency | admin (the enum still carries the retired
--     bank / bailiff / inspector);
--   * an admin cannot take away their own admin role (`cannot_demote_self`),
--     which would lock them out of the console;
--   * it keeps auth.users.raw_app_meta_data.role in step with the profile, as
--     the pre-rebuild route did through auth.admin.updateUserById. is_admin()
--     trusts that claim before profiles.role, so an admin demoted without it
--     would still pass every RLS policy and guard. A token already issued keeps
--     its claim until it expires (jwt_expiry, one hour).
--
-- It no longer opens app.bypass_profile_guard. The caller has just passed
-- is_admin(), so the guard lets the update through on its own — and stays a
-- second, independent check on it.
--
-- Executable by `authenticated` only. The route calls it with the admin's own
-- session; the service role cannot change a role at all any more, through this
-- function or the table.
--
-- The argument keeps its 0144 name, p_user_id: create or replace cannot rename
-- an argument, and the signature is otherwise unchanged.
-- ============================================================================

create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('individual', 'agency', 'admin') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'cannot_demote_self';
  end if;

  update public.profiles
     set role = p_role, updated_at = now()
   where id = p_user_id;
  if not found then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('role', p_role::text)
   where id = p_user_id;
end;
$$;

revoke execute on function public.admin_set_user_role(uuid, public.user_role) from public, anon, service_role;
grant execute on function public.admin_set_user_role(uuid, public.user_role) to authenticated;

comment on function public.admin_set_user_role(uuid, public.user_role) is
  'Admin only: set a user''s role (individual | agency | admin) and mirror it into the auth app_metadata claim. Raises forbidden | invalid_role | cannot_demote_self | user_not_found.';

notify pgrst, 'reload schema';
