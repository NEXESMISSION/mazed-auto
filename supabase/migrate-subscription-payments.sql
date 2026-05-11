-- ============================================================
-- Mazed Auto — Subscription payments (Konnect / Clictopay-ready)
--
-- Adds the "pending_payment" subscription state plus three RPCs
-- that bracket the real payment-provider round-trip:
--
--   1. initiate_pending_subscription(plan, provider, ref)
--      → creates the row in pending_payment status, returns id.
--      Does NOT expire other entitlements yet (in case payment fails).
--
--   2. complete_subscription_from_payment(sub_id, ref)
--      → activates the row, expires any other entitled subs, writes
--      the ledger entry, sets is_pro on the seller. Called by the
--      webhook (or by the simulation path) once payment is confirmed.
--
--   3. fail_pending_subscription(sub_id, reason)
--      → marks the row 'expired' so it stops blocking re-attempts.
--
-- Depends on: migrate-cms-plans.sql, migrate-cms-plans-v2.sql,
--             migrate-subscription-extras.sql
-- Safe to run repeatedly.
-- ============================================================

-- 1) Widen the status check to include 'pending_payment'.
do $$
begin
  alter table public.user_subscriptions
    drop constraint if exists user_subscriptions_status_check;
  alter table public.user_subscriptions
    add constraint user_subscriptions_status_check
    check (status in ('pending_payment','active','past_due','cancelled','expired'));
end $$;

-- 2) Audit columns for the payment round-trip.
alter table public.user_subscriptions
  add column if not exists payment_amount  numeric,
  add column if not exists failed_at       timestamptz,
  add column if not exists failed_reason   text,
  add column if not exists activated_at    timestamptz;

-- 3) initiate_pending_subscription — called by the server action right
--    before redirecting the user to the payment provider. Returns the
--    sub id which we pass as the orderId / metadata to Konnect.

create or replace function public.initiate_pending_subscription(
  p_plan_slug text,
  p_provider  text default 'simulation',
  p_amount    numeric default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan record;
  v_sub_id uuid;
  v_amount numeric;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_plan
    from public.cms_subscription_plans
   where slug = p_plan_slug and is_visible = true;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;

  v_amount := coalesce(p_amount, v_plan.monthly_price);

  -- Mark any *prior* pending row for this user+plan as expired so we
  -- don't accumulate dead intents. Other plans / active subs are
  -- intentionally left alone — we only switch on successful payment.
  update public.user_subscriptions
     set status = 'expired',
         failed_at = now(),
         failed_reason = 'superseded_by_new_intent',
         updated_at = now()
   where user_id = v_user
     and plan_slug = p_plan_slug
     and status = 'pending_payment';

  insert into public.user_subscriptions (
    user_id, plan_slug, status, started_at,
    current_period_start, current_period_end, expires_at,
    payment_provider, payment_amount, created_by
  ) values (
    v_user, p_plan_slug, 'pending_payment', now(),
    now(), now() + interval '30 days', now() + interval '30 days',
    p_provider, v_amount, v_user
  ) returning id into v_sub_id;

  return v_sub_id;
end; $$;

grant execute on function public.initiate_pending_subscription(text, text, numeric) to authenticated;

-- 4) complete_subscription_from_payment — webhook calls this once the
--    provider confirms payment. SECURITY DEFINER so the service-role
--    webhook handler can call it without a user session, but it
--    requires either the caller to own the row OR to be super_admin.
--
--    The webhook handler in /api/payments/* must use the service-role
--    Supabase client; user-side calls to complete a payment they own
--    (e.g. simulation mode) also work since auth.uid() = sub.user_id.

create or replace function public.complete_subscription_from_payment(
  p_subscription_id uuid,
  p_provider_ref    text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_sub    record;
  v_plan   record;
begin
  select * into v_sub
    from public.user_subscriptions
   where id = p_subscription_id
   for update;

  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;
  if v_sub.status <> 'pending_payment' then
    -- Idempotency: if the webhook fires twice we just return the row
    -- instead of double-charging.
    return v_sub.id;
  end if;

  -- Authorization: caller must own the row OR be super_admin OR have
  -- no session at all (service-role webhook).
  if v_caller is not null
     and v_caller <> v_sub.user_id
     and coalesce(public.admin_role(), '') <> 'super_admin' then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_plan
    from public.cms_subscription_plans
   where slug = v_sub.plan_slug;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;

  -- Expire every other entitled subscription this user holds, so we
  -- never end up with two plans active at once. Deferred from the
  -- initiate step on purpose: if payment fails we don't want to have
  -- already killed the user's previous plan.
  update public.user_subscriptions
     set status = 'expired',
         expires_at = now(),
         updated_at = now()
   where user_id = v_sub.user_id
     and id <> v_sub.id
     and status in ('active','cancelled')
     and (expires_at is null or expires_at > now());

  -- Activate this row.
  update public.user_subscriptions
     set status               = 'active',
         current_period_start = now(),
         current_period_end   = now() + interval '30 days',
         expires_at           = now() + interval '30 days',
         payment_provider_ref = coalesce(p_provider_ref, payment_provider_ref),
         activated_at         = now(),
         updated_at           = now()
   where id = v_sub.id;

  -- Reflect on seller profile.
  update public.sellers set is_pro = true where id = v_sub.user_id;

  -- Ledger.
  insert into public.transactions (ref, user_id, auction_id, type, direction, amount, label, status)
  values (
    'TX-SUB-' || substring(gen_random_uuid()::text from 1 for 8),
    v_sub.user_id, null, 'commission', 'in',
    coalesce(v_sub.payment_amount, v_plan.monthly_price),
    'Abonnement ' || v_plan.name_fr || ' (30 jours)',
    'completed'
  );

  -- Notify.
  insert into public.notifications (user_id, kind, title, body)
  values (v_sub.user_id, 'system',
    'Abonnement activé',
    'Votre plan ' || v_plan.name_fr || ' est actif pour les 30 prochains jours.');

  return v_sub.id;
end; $$;

grant execute on function public.complete_subscription_from_payment(uuid, text) to authenticated, anon;

-- 5) fail_pending_subscription — marks the row expired so the user
--    can re-try. Does NOT touch any active subscription they may
--    still hold (they keep what they paid for).

create or replace function public.fail_pending_subscription(
  p_subscription_id uuid,
  p_reason text default 'payment_failed'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_sub    record;
begin
  select * into v_sub
    from public.user_subscriptions
   where id = p_subscription_id
   for update;

  if not found then return; end if;
  if v_sub.status <> 'pending_payment' then return; end if;

  if v_caller is not null
     and v_caller <> v_sub.user_id
     and coalesce(public.admin_role(), '') <> 'super_admin' then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.user_subscriptions
     set status        = 'expired',
         failed_at     = now(),
         failed_reason = p_reason,
         updated_at    = now()
   where id = p_subscription_id;
end; $$;

grant execute on function public.fail_pending_subscription(uuid, text) to authenticated, anon;

-- 6) Public-status read endpoint for polling on the return page.
--    Returns just status + plan_name for the user's own pending /
--    recently activated rows.

create or replace function public.get_my_subscription_status(p_subscription_id uuid)
returns table (
  status      text,
  plan_name   text,
  activated_at timestamptz,
  failed_at    timestamptz,
  failed_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then return; end if;
  return query
  select us.status, p.name_fr, us.activated_at, us.failed_at, us.failed_reason
    from public.user_subscriptions us
    join public.cms_subscription_plans p on p.slug = us.plan_slug
   where us.id = p_subscription_id and us.user_id = v_user;
end; $$;

grant execute on function public.get_my_subscription_status(uuid) to authenticated;
