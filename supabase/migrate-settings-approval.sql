-- ============================================================
-- Mazed Auto — 2-admin approval workflow for sensitive settings
--
-- platform_settings already has pending_value / pending_proposed_by /
-- pending_proposed_at columns reserved for this. This migration adds
-- the RPCs that propose, approve and reject pending changes.
--
-- Rules:
--   * settings flagged requires_approval=true must go through
--     propose_setting_value() — direct UPDATE bypasses the workflow
--     and is reserved for non-sensitive settings.
--   * Same admin cannot propose AND approve. The approving admin
--     must be a different user.
--   * propose / approve / reject all flow through admin_audit_log.
--
-- Depends on: migrate-platform-settings.sql, migrate-admin-foundations.sql
-- Safe to run repeatedly.
-- ============================================================

create or replace function public.propose_setting_value(
  p_key       text,
  p_new_value jsonb,
  p_reason    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_row from public.platform_settings where key = p_key;
  if v_row.key is null then
    raise exception 'SETTING_NOT_FOUND';
  end if;

  update public.platform_settings
     set pending_value       = p_new_value,
         pending_proposed_by = auth.uid(),
         pending_proposed_at = now()
   where key = p_key;

  insert into public.settings_audit_log
    (setting_key, old_value, new_value, action, changed_by, reason)
  values
    (p_key, v_row.value, p_new_value, 'create', auth.uid(),
     coalesce(p_reason, 'proposed'));

  perform public.log_admin_action(
    'setting.propose',
    p_target_type => 'platform_setting',
    p_detail      => p_key,
    p_metadata    => jsonb_build_object('new_value', p_new_value, 'reason', p_reason)
  );
end; $$;
grant execute on function public.propose_setting_value(text, jsonb, text) to authenticated;

create or replace function public.approve_pending_setting(
  p_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_row from public.platform_settings where key = p_key;
  if v_row.key is null then raise exception 'SETTING_NOT_FOUND'; end if;
  if v_row.pending_value is null then raise exception 'NO_PENDING_CHANGE'; end if;

  -- Same admin cannot propose AND approve.
  if v_row.pending_proposed_by = auth.uid() then
    raise exception 'NEEDS_DIFFERENT_APPROVER';
  end if;

  update public.platform_settings
     set value               = pending_value,
         pending_value       = null,
         pending_proposed_by = null,
         pending_proposed_at = null,
         updated_by          = auth.uid(),
         updated_at          = now()
   where key = p_key;

  insert into public.settings_audit_log
    (setting_key, old_value, new_value, action, changed_by)
  values
    (p_key, v_row.value, v_row.pending_value, 'approve', auth.uid());

  perform public.log_admin_action(
    'setting.approve',
    p_target_type => 'platform_setting',
    p_detail      => p_key
  );
end; $$;
grant execute on function public.approve_pending_setting(text) to authenticated;

create or replace function public.reject_pending_setting(
  p_key    text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  select * into v_row from public.platform_settings where key = p_key;
  if v_row.pending_value is null then raise exception 'NO_PENDING_CHANGE'; end if;

  insert into public.settings_audit_log
    (setting_key, old_value, new_value, action, changed_by, reason)
  values
    (p_key, v_row.value, v_row.pending_value, 'reject', auth.uid(), p_reason);

  update public.platform_settings
     set pending_value       = null,
         pending_proposed_by = null,
         pending_proposed_at = null
   where key = p_key;

  perform public.log_admin_action(
    'setting.reject',
    p_target_type => 'platform_setting',
    p_detail      => p_key,
    p_metadata    => jsonb_build_object('reason', p_reason)
  );
end; $$;
grant execute on function public.reject_pending_setting(text, text) to authenticated;
