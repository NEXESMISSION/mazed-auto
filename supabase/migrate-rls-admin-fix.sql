-- ============================================================
-- Mazed Auto — RLS admin-check fix
--
-- Earlier migrations (kyc_submissions, user_activity_log) gated
-- admin-only access by querying `auth.users.raw_user_meta_data`. The
-- `authenticated` role doesn't have SELECT on `auth.users`, so any
-- INSERT/UPDATE that triggered the admin policy raised
--
--   permission denied for table users (42501)
--
-- aborting the whole statement even when a *different* policy on the
-- same row (e.g. kyc_self_insert) would have allowed it.
--
-- Fix: read the role from the JWT itself via `auth.jwt()`. The JWT
-- already includes user_metadata, so we don't need to touch auth.users
-- from inside an end-user policy.
--
-- Safe to run repeatedly.
-- ============================================================

-- 1) Shared helper. STABLE so the planner caches the result per query.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  )
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- 2) kyc_submissions admin policy --------------------------------------------
drop policy if exists "kyc_admin_all" on public.kyc_submissions;
create policy "kyc_admin_all" on public.kyc_submissions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3) user_activity_log admin policy ------------------------------------------
drop policy if exists "activity_admin_read" on public.user_activity_log;
create policy "activity_admin_read" on public.user_activity_log
  for select to authenticated using (public.is_admin());

-- 4) RPCs — switch their inline admin checks to the same helper so the
--    behaviour stays identical and we have one place to maintain it.

create or replace function public.review_kyc(
  p_submission_id uuid,
  p_decision      text,
  p_reason        text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'INVALID_DECISION';
  end if;

  update public.kyc_submissions
     set status = p_decision,
         rejection_reason = case when p_decision = 'rejected'
                                 then coalesce(p_reason, 'Documents insuffisants')
                                 else null end,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_submission_id
   returning user_id into v_user;

  if v_user is null then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
       || jsonb_build_object(
            'kycStatus',
            case when p_decision = 'approved' then 'verified' else 'rejected' end
          )
   where id = v_user;

  if p_decision = 'approved' then
    update public.sellers
       set verified_kyc = true
     where id = v_user;
  end if;
end; $$;

create or replace function public.set_user_active(
  p_user_id uuid,
  p_active  boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  update public.sellers set is_active = p_active where id = p_user_id;
end; $$;

revoke all on function public.review_kyc(uuid, text, text)  from public;
revoke all on function public.set_user_active(uuid, boolean) from public;
grant execute on function public.review_kyc(uuid, text, text)  to authenticated;
grant execute on function public.set_user_active(uuid, boolean) to authenticated;
