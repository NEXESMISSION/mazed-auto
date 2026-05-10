-- ============================================================
-- Mazed Auto — Notifications expansion
--
-- 1. Widen notifications.kind CHECK to include the 9 missing
--    PLAN §23.2 kinds (kyc_*, auction_*, deposit_*, payment_received,
--    rating_request, new_report, account_blocked).
-- 2. Add `user_notification_prefs` for per-kind × per-channel
--    user preferences (PLAN §23.3).
--
-- Safe to run repeatedly.
-- ============================================================

-- 1) Replace the kind CHECK ----------------------------------------
do $$
begin
  alter table public.notifications drop constraint if exists notifications_kind_check;
exception when undefined_table then null;
end $$;

alter table public.notifications
  add constraint notifications_kind_check check (kind in (
    -- legacy kinds (kept for back-compat)
    'outbid','won','lost','new_bid','approved','rejected',
    'payment_due','reminder','system',
    -- PLAN §23.2 new kinds
    'kyc_approved','kyc_rejected','kyc_expires_soon',
    'auction_starting_soon','reserve_not_met','auction_extended',
    'deposit_refunded','deposit_forfeited','payment_received',
    'rating_request','new_report','account_blocked'
  ));

-- 2) user_notification_prefs --------------------------------------
-- Each (user_id, kind) row says which channels are enabled. Absence
-- of a row falls back to the channel defaults from notification_templates.
create table if not exists public.user_notification_prefs (
  user_id   uuid not null references auth.users(id) on delete cascade,
  kind      text not null,
  in_app    boolean not null default true,
  email     boolean not null default false,
  sms       boolean not null default false,
  push      boolean not null default true,
  primary key (user_id, kind)
);

alter table public.user_notification_prefs enable row level security;
drop policy if exists "notif_prefs_self_all" on public.user_notification_prefs;
create policy "notif_prefs_self_all" on public.user_notification_prefs
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Helper: should a user receive a given (kind, channel)?
create or replace function public.should_notify(
  p_user_id uuid, p_kind text, p_channel text
) returns boolean
language sql stable
as $$
  with override as (
    select * from public.user_notification_prefs
     where user_id = p_user_id and kind = p_kind
  ),
  tmpl as (
    select * from public.notification_templates
     where kind = p_kind limit 1
  )
  select case p_channel
    when 'in_app' then coalesce((select in_app from override),
                                 (select in_app from tmpl), true)
    when 'email'  then coalesce((select email  from override),
                                 (select email  from tmpl), false)
    when 'sms'    then coalesce((select sms    from override),
                                 (select sms    from tmpl), false)
    when 'push'   then coalesce((select push   from override),
                                 (select push   from tmpl), true)
    else false
  end;
$$;

grant execute on function public.should_notify(uuid, text, text) to authenticated, anon;
