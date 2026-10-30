-- ============================================================================
-- 0199 — Security lockdown before launch (audit 2026-10-30).
--
-- 1. SERVER-ONLY FUNCTIONS, CALLABLE BY ANYONE. These SECURITY DEFINER
--    functions were revoked from PUBLIC only — but Supabase grants EXECUTE on
--    every new function to `anon` and `authenticated` directly, so revoking
--    from PUBLIC left both grants in place. Anyone holding the site's public
--    key could, among others: read and drain every user's pending e-mail / SMS
--    notifications (claim_*), send all admins a notification with any text and
--    link (_notify_admins), lock a phone out of login or reset by burning its
--    rate-limit key, or reset a limit by passing a 1-second window
--    (check_rate_limit, check_auth_ratelimit), inflate an annonce's views, fake
--    a cron heartbeat, and read any shop's subscription or quota. The app calls
--    every one of them with the service role (cron routes, API routes); the
--    only exception, /api/optimize-image, now does too. pg_cron runs them as
--    their owner. No RLS policy calls them. So: service role only.
--
-- 2. PROFILES ARE WRITTEN BY THE SERVER ONLY. A signed-in user could PATCH
--    their own row through the API: clear `banned_at` (lifting their own ban),
--    claim a `phone` without an SMS code, set `deleted_at`. The guard trigger
--    only covered role / kyc / trust. Every profile update the app makes goes
--    through the service role, and SECURITY DEFINER functions (signup trigger,
--    account deletion, admin RPCs) run with their owner's privileges — so
--    taking INSERT / UPDATE / DELETE away from anon and authenticated changes
--    nothing for the app and closes the hole for every column at once.
--
-- 3. SIGN-IN CODES. Checking a code read the attempt counter, then wrote it:
--    parallel guesses all read the same count, so far more than five fit in a
--    code's lifetime. And a verified code left a « verified » stamp on the
--    phone that ANY later request could use to set the password or open the
--    account — not only the person who typed the code. Now:
--      phone_otp_try()      one locked step: expiry, attempts, comparison;
--                           on success stores the hash of a one-time proof
--                           that only the verifying browser receives;
--      phone_otp_consume()  signup / reset must present that proof, within the
--                           window; it is deleted as it is used.
-- ============================================================================

-- ── 1. Server-only functions ───────────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any (array[
         'claim_emailable_notifications', 'claim_smsable_notifications', '_notify_admins',
         'check_rate_limit', 'check_auth_ratelimit',
         'record_listing_view', 'shop_current_subscription', 'listing_quota_status',
         'free_listing_status', '_is_banned', 'final_payment_interval',
         'stamp_cron_heartbeat', 'backfill_agency_shops',
         'cleanup_old_notifications', 'cleanup_phone_otps', 'prune_activity_log',
         'prune_read_notifications', 'expire_listing_promotions', 'notify_unscheduled_listings',
         'notify_auctions_ending_soon', 'notify_auctions_ending_soon_cron',
         'notify_final_payment_due', 'notify_final_payment_due_cron',
         'process_bid_events', 'tick_auctions', 'tick_auctions_cron'
       ])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end;
$$;

-- ── 2. Profiles: server writes only ────────────────────────────────────────

revoke insert, update, delete on public.profiles from anon, authenticated;

-- ── 3. Sign-in codes ───────────────────────────────────────────────────────

alter table public.phone_otps add column if not exists proof_hash text;

create or replace function public.phone_otp_try(
  p_phone      text,
  p_code_hash  text,
  p_proof_hash text,
  p_max        int default 5
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.phone_otps;
begin
  -- The row lock makes concurrent guesses for one phone wait for each other:
  -- each one sees the attempts the previous one counted.
  select * into v from public.phone_otps where phone = p_phone for update;
  if v.phone is null then
    return 'no_code';
  end if;
  if v.expires_at < now() then
    delete from public.phone_otps where phone = p_phone;
    return 'expired';
  end if;
  if v.attempts >= p_max then
    return 'too_many_attempts';
  end if;
  if coalesce(v.code_hash, '') = '' or v.code_hash <> p_code_hash then
    update public.phone_otps set attempts = attempts + 1 where phone = p_phone;
    return 'wrong_code';
  end if;
  update public.phone_otps
     set verified_at = now(), code_hash = '', attempts = 0, proof_hash = p_proof_hash
   where phone = p_phone;
  return 'ok';
end;
$$;

create or replace function public.phone_otp_consume(
  p_phone       text,
  p_proof_hash  text,
  p_window_secs int default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.phone_otps;
begin
  select * into v from public.phone_otps where phone = p_phone for update;
  if v.phone is null
     or v.verified_at is null
     or v.verified_at < now() - make_interval(secs => p_window_secs)
     or coalesce(v.proof_hash, '') = ''
     or v.proof_hash <> coalesce(p_proof_hash, '') then
    return false;
  end if;
  delete from public.phone_otps where phone = p_phone;
  return true;
end;
$$;

revoke all on function public.phone_otp_try(text, text, text, int) from public, anon, authenticated;
grant execute on function public.phone_otp_try(text, text, text, int) to service_role;
revoke all on function public.phone_otp_consume(text, text, int) from public, anon, authenticated;
grant execute on function public.phone_otp_consume(text, text, int) to service_role;

notify pgrst, 'reload schema';
