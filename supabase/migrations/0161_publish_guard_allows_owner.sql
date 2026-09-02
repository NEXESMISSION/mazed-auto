-- ============================================================================
-- FIX for 0154's publish guard — it locked out the database itself.
--
-- `_listings_guard_publish` allows the publish transition for service_role (the
-- app's paid/credit path) and for admins. It does NOT allow the role a
-- migration or a DBA session runs as, which means:
--
--   * any future migration that needs to publish rows fails,
--   * a manual fix from the SQL editor fails,
--   * and the failure reads "publication_requires_payment", which is a
--     baffling thing to be told while holding the database password.
--
-- 0155 only escaped this by accident: every backfilled listing landed in
-- 'draft' (no phone on file), so the guard was never exercised.
--
-- Superusers and the table owner are, by definition, already able to disable
-- the trigger — the guard was never a security boundary against them, only an
-- obstacle. The boundary that matters is the one against `authenticated`, and
-- that is unchanged: a seller still cannot publish their own listing.
-- ============================================================================

create or replace function public._listings_guard_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and not (
       -- the app's own paid / credited / admin paths
       coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
       or current_user = 'service_role'
       or public.is_admin()
       -- the database itself: migrations, the SQL editor, maintenance
       or current_user = 'postgres'
       or current_user = 'supabase_admin'
       or (select usesuper from pg_user where usename = current_user)
     ) then
    raise exception 'publication_requires_payment'
      using errcode = 'P0001',
            hint = 'A listing is published by the payment/credit path, by an admin, or by the database owner.';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
