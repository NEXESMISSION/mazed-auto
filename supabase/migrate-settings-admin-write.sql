-- ============================================================
-- Admin write access to platform_settings.
--
-- The original migration commented "Writes go through service role
-- (server actions / admin API). No direct policy." But the actual
-- updateSettingAction (web/src/app/[locale]/admin/settings/actions.ts)
-- uses the regular cookie-bound client, NOT a service-role client.
-- With RLS enabled and no UPDATE policy, every save was silently
-- rejected — which is why the admin settings panel "doesn't work".
--
-- The simplest fix: add admin-only UPDATE/INSERT/DELETE policies that
-- defer to the existing public.is_admin() helper (already used across
-- the codebase for admin gating). Reads stay split as before.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- Platform settings — admin can update, insert, delete.
drop policy if exists "settings_admin_write" on public.platform_settings;
create policy "settings_admin_write" on public.platform_settings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Settings audit log — admin can insert (the audit trigger fires as
-- the connected user, so the connected user needs INSERT). Without
-- this, the audit trigger that mirrors every settings change would
-- error and rollback the parent update.
drop policy if exists "audit_admin_insert" on public.settings_audit_log;
create policy "audit_admin_insert" on public.settings_audit_log
  for insert
  to authenticated
  with check (public.is_admin());
