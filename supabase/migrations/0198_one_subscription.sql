-- ============================================================================
-- 0198 — One subscription per shop: renew it, upgrade it, downgrade it,
-- cancel it. Never a second one bought beside it.
--
-- WHAT WENT WRONG. Any plan could be paid for at any time, and a captured
-- payment always added a period after the last one (0191). A shop paying Pro
-- and then Business ended with two « active » rows — Business queued behind
-- Pro — when it wanted one subscription. Two captures at the same instant
-- could even compute the same start and overlap. One open shop per owner
-- (0185) makes « per shop » the same as « per user ».
--
-- THE RULES, enforced here and not only in the routes:
--   * no two periods of a shop overlap (`subscriptions_no_overlap`), and
--     every write that adds or changes a period locks the shop row first;
--   * at most one open subscription order per shop (`pending` or
--     `pending_review`): a double click, two tabs or two devices find the
--     same order instead of creating another (`payments_one_open_subscription_order`);
--   * an order says what it is for, in `metadata.intent`, and is priced by
--     `create_subscription_order()`, never by the client:
--       subscribe  the shop has no live subscription: a period from now;
--       renew      the next period of the live subscription, same plan — or
--                  the lower plan scheduled for it — from the end of the
--                  last one; open in the last 7 days, or during grace (when
--                  any plan may be chosen, the renewal date being past);
--       upgrade    a higher plan from the moment the payment is captured,
--                  for the price difference prorated to the time left; the
--                  SAME period row changes plan and limits, its end — the
--                  renewal date — stays, and the next renewal is at the new
--                  plan's full price;
--   * a downgrade is not paid now: it is scheduled on the last period and the
--     renewal takes it (the lower plan, at its price). A cancellation is
--     scheduled the same way and stops the renewal; the plan runs to the end
--     of what was paid. Nothing is refunded, no credit is given;
--   * ONE scheduled change at a time, by construction: `scheduled_change` is
--     a single column — scheduling a cancellation withdraws a downgrade and
--     the other way round; a captured upgrade withdraws a downgrade;
--   * a captured payment is checked again against all of this — the order
--     may have been placed before something changed — and refused rather
--     than turned into a second subscription. Orders placed before this
--     migration (no intent) follow the same checks.
--
-- Konnect has no recurring billing, saved cards or scheduled changes (its API
-- is one-time payment links), so « renewal » stays a payment the shop makes —
-- reminded at J-7 and J-1 (0192) — and scheduled changes live here.
--
-- `subscription_changes` keeps every change with who made it, when it takes
-- effect and the payment that paid for it: the period rows plus this table
-- tell what a shop had on any day.
-- ============================================================================

create extension if not exists btree_gist with schema extensions;

-- ── Scheduled changes, on the shop's last period ───────────────────────────

alter table public.subscriptions
  add column if not exists scheduled_change     text,
  add column if not exists scheduled_product_id uuid references public.products(id),
  add column if not exists scheduled_at         timestamptz,
  add column if not exists scheduled_by         uuid references public.profiles(id) on delete set null;

alter table public.subscriptions drop constraint if exists subscriptions_scheduled_shape;
alter table public.subscriptions add constraint subscriptions_scheduled_shape check (
  (scheduled_change is null and scheduled_product_id is null)
  or (scheduled_change = 'cancel' and scheduled_product_id is null)
  or (scheduled_change = 'downgrade' and scheduled_product_id is not null)
);

-- ── No two periods at once ─────────────────────────────────────────────────

alter table public.subscriptions drop constraint if exists subscriptions_no_overlap;
alter table public.subscriptions add constraint subscriptions_no_overlap
  exclude using gist (shop_id with =, tstzrange(starts_at, ends_at) with &&)
  where (status <> 'cancelled');

-- ── One open order per shop ────────────────────────────────────────────────

create unique index if not exists payments_one_open_subscription_order
  on public.payments (shop_id)
  where kind = 'subscription' and status in ('pending', 'pending_review') and shop_id is not null;

-- ── The history of changes ─────────────────────────────────────────────────

create table if not exists public.subscription_changes (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  shop_id         uuid not null references public.shops(id) on delete cascade,
  kind            text not null check (kind in (
                    'upgraded', 'downgrade_scheduled', 'downgrade_withdrawn', 'downgrade_applied',
                    'cancel_scheduled', 'cancel_withdrawn')),
  from_product_id uuid references public.products(id),
  to_product_id   uuid references public.products(id),
  -- The payment that paid for it (an upgrade, a renewal taking a downgrade).
  payment_id      uuid unique references public.payments(id),
  amount          numeric(14, 2),
  effective_at    timestamptz not null default now(),
  actor_id        uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists subscription_changes_shop_idx on public.subscription_changes (shop_id, created_at desc);

alter table public.subscription_changes enable row level security;
revoke all on public.subscription_changes from public, anon, authenticated;
grant select on public.subscription_changes to authenticated;
grant all on public.subscription_changes to service_role;
drop policy if exists subscription_changes_read on public.subscription_changes;
create policy subscription_changes_read on public.subscription_changes for select to authenticated
  using (public.is_admin() or public.is_shop_member(shop_id));

-- ── What an order would cost, and whether it may be placed ─────────────────
-- The checkout shows it before the click and `create_subscription_order()`
-- charges it, so what is shown is what is charged. `{error: …}` when the
-- order is not allowed.

create or replace function public.subscription_quote(p_shop uuid, p_product uuid, p_intent text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_new    public.products;
  v_from   public.products;
  v_last   public.subscriptions;
  v_cur    public.subscriptions;
  v_next   boolean;
  v_start  timestamptz;
  v_amount numeric;
  v_window constant interval := interval '7 days';
begin
  select * into v_new from public.products
   where id = p_product and kind = 'subscription' and plan_code is not null and is_active;
  if v_new.id is null then
    return jsonb_build_object('error', 'not_for_sale');
  end if;

  -- The live subscription: its last period (whose end is the renewal date),
  -- the one running now, and whether the next one is already paid.
  select * into v_last from public.subscriptions
   where shop_id = p_shop and status in ('active', 'grace') and grace_ends_at > now()
   order by ends_at desc limit 1;
  select * into v_cur from public.subscriptions
   where shop_id = p_shop and status in ('active', 'grace') and starts_at <= now() and now() < ends_at
   order by ends_at desc limit 1;
  v_next := exists (select 1 from public.subscriptions
                     where shop_id = p_shop and status in ('active', 'grace') and starts_at > now());

  if p_intent = 'subscribe' then
    if v_last.id is not null then
      return jsonb_build_object('error', 'subscription_exists');
    end if;
    return jsonb_build_object(
      'intent', 'subscribe', 'product_id', v_new.id, 'plan_code', v_new.plan_code,
      'amount', v_new.price, 'price', v_new.price,
      'effective_at', now(), 'ends_at', now() + make_interval(days => v_new.duration_days));
  end if;

  if p_intent = 'renew' then
    if v_last.id is null then
      return jsonb_build_object('error', 'no_subscription');
    end if;
    if v_last.scheduled_change = 'cancel' then
      return jsonb_build_object('error', 'subscription_cancelled');
    end if;
    if v_next then
      return jsonb_build_object('error', 'renewal_already_paid');
    end if;
    if v_last.ends_at > now() then
      if v_last.ends_at > now() + v_window then
        return jsonb_build_object('error', 'renewal_not_open', 'opens_at', v_last.ends_at - v_window);
      end if;
      if p_product <> coalesce(v_last.scheduled_product_id, v_last.product_id) then
        return jsonb_build_object('error', 'renewal_plan_mismatch',
                                  'product_id', coalesce(v_last.scheduled_product_id, v_last.product_id));
      end if;
    end if;
    v_start := greatest(now(), v_last.ends_at);
    return jsonb_build_object(
      'intent', 'renew', 'product_id', v_new.id, 'plan_code', v_new.plan_code,
      'amount', v_new.price, 'price', v_new.price, 'subscription_id', v_last.id,
      'effective_at', v_start, 'ends_at', v_start + make_interval(days => v_new.duration_days),
      'takes_downgrade', v_last.scheduled_change = 'downgrade' and v_last.scheduled_product_id = v_new.id);
  end if;

  if p_intent = 'upgrade' then
    if v_cur.id is null then
      return jsonb_build_object('error', 'no_current_period');
    end if;
    if v_next or v_cur.id <> v_last.id then
      return jsonb_build_object('error', 'next_period_paid');
    end if;
    select * into v_from from public.products where id = v_cur.product_id;
    if v_new.price <= v_from.price then
      return jsonb_build_object('error', 'not_an_upgrade');
    end if;
    -- The difference, for the share of the period still to run — rounded up
    -- to the cent (payments are stored in cents), never below one.
    v_amount := greatest(0.01, ceil(
      (v_new.price - v_from.price)
      * extract(epoch from (v_cur.ends_at - now()))
      / extract(epoch from (v_cur.ends_at - v_cur.starts_at)) * 100) / 100);
    return jsonb_build_object(
      'intent', 'upgrade', 'product_id', v_new.id, 'plan_code', v_new.plan_code,
      'amount', v_amount, 'price', v_new.price, 'from_price', v_from.price,
      'subscription_id', v_cur.id, 'from_product_id', v_from.id, 'from_plan_code', v_from.plan_code,
      'effective_at', now(), 'renews_at', v_cur.ends_at,
      'withdraws_downgrade', v_cur.scheduled_change = 'downgrade',
      'keeps_cancel', v_cur.scheduled_change = 'cancel');
  end if;

  return jsonb_build_object('error', 'bad_intent');
end;
$$;

-- ── Placing an order ───────────────────────────────────────────────────────
-- Locks the shop, so two clicks, two tabs or two devices are served one after
-- the other: the second finds the first's order — the same one when it asks
-- for the same thing (reused), `order_open` otherwise.

create or replace function public.create_subscription_order(
  p_shop     uuid,
  p_user     uuid,
  p_product  uuid,
  p_intent   text,
  p_provider text,
  p_request  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open    public.payments;
  v_q       jsonb;
  v_product public.products;
  v_id      uuid;
begin
  perform 1 from public.shops where id = p_shop for update;
  if not found then
    raise exception 'shop_not_found' using errcode = 'P0002';
  end if;

  select * into v_open from public.payments
   where shop_id = p_shop and kind = 'subscription' and status in ('pending', 'pending_review')
   limit 1;
  if v_open.id is not null then
    if v_open.status = 'pending'
       and v_open.metadata ->> 'intent' = p_intent
       and v_open.metadata ->> 'product_id' = p_product::text
       and v_open.provider::text = p_provider then
      return jsonb_build_object('payment_id', v_open.id, 'amount', v_open.amount, 'intent', p_intent,
                                'reused', true, 'pay_url', v_open.metadata ->> 'pay_url');
    end if;
    raise exception 'order_open' using errcode = 'P0001', detail = v_open.id::text;
  end if;

  v_q := public.subscription_quote(p_shop, p_product, p_intent);
  if v_q ? 'error' then
    raise exception '%', v_q ->> 'error' using errcode = 'P0001';
  end if;

  select * into v_product from public.products where id = p_product;
  insert into public.payments (user_id, kind, provider, amount, status, shop_id, metadata)
  values (p_user, 'subscription', p_provider::public.payment_provider, (v_q ->> 'amount')::numeric, 'pending', p_shop,
          jsonb_strip_nulls(jsonb_build_object(
            'product_id', p_product,
            'product_slug', v_product.slug,
            'plan_code', v_product.plan_code,
            'expected_amount', (v_q ->> 'amount')::numeric,
            'intent', p_intent,
            'subscription_id', v_q ->> 'subscription_id',
            'from_product_id', v_q ->> 'from_product_id',
            'request_id', p_request,
            'initiated_at', now())))
  returning id into v_id;

  return jsonb_build_object('payment_id', v_id, 'amount', (v_q ->> 'amount')::numeric, 'intent', p_intent,
                            'reused', false, 'quote', v_q);
end;
$$;

-- ── Scheduling: cancel / resume, downgrade / keep the plan ─────────────────

create or replace function public.shop_subscription_change(
  p_shop    uuid,
  p_actor   uuid,
  p_action  text,
  p_product uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last public.subscriptions;
  v_from public.products;
  v_new  public.products;
begin
  perform 1 from public.shops where id = p_shop for update;
  select * into v_last from public.subscriptions
   where shop_id = p_shop and status in ('active', 'grace') and grace_ends_at > now()
   order by ends_at desc limit 1
   for update;
  if v_last.id is null then
    raise exception 'no_subscription' using errcode = 'P0001';
  end if;
  -- A payment under way was priced on the subscription as it is: settle or
  -- cancel it first, so nothing is paid for a plan that has since changed.
  if exists (select 1 from public.payments
              where shop_id = p_shop and kind = 'subscription' and status in ('pending', 'pending_review')) then
    raise exception 'order_open' using errcode = 'P0001';
  end if;

  if p_action = 'cancel' then
    if v_last.scheduled_change = 'cancel' then
      return jsonb_build_object('unchanged', true, 'scheduled_change', 'cancel', 'effective_at', v_last.ends_at);
    end if;
    if v_last.scheduled_change = 'downgrade' then
      insert into public.subscription_changes (subscription_id, shop_id, kind, from_product_id, to_product_id, effective_at, actor_id)
      values (v_last.id, p_shop, 'downgrade_withdrawn', v_last.product_id, v_last.scheduled_product_id, v_last.ends_at, p_actor);
    end if;
    update public.subscriptions
       set scheduled_change = 'cancel', scheduled_product_id = null, scheduled_at = now(), scheduled_by = p_actor
     where id = v_last.id;
    insert into public.subscription_changes (subscription_id, shop_id, kind, from_product_id, effective_at, actor_id)
    values (v_last.id, p_shop, 'cancel_scheduled', v_last.product_id, v_last.ends_at, p_actor);
    return jsonb_build_object('scheduled_change', 'cancel', 'effective_at', v_last.ends_at);
  end if;

  if p_action = 'resume' then
    if v_last.scheduled_change is distinct from 'cancel' then
      return jsonb_build_object('unchanged', true, 'scheduled_change', v_last.scheduled_change);
    end if;
    update public.subscriptions
       set scheduled_change = null, scheduled_product_id = null, scheduled_at = now(), scheduled_by = p_actor
     where id = v_last.id;
    insert into public.subscription_changes (subscription_id, shop_id, kind, from_product_id, effective_at, actor_id)
    values (v_last.id, p_shop, 'cancel_withdrawn', v_last.product_id, now(), p_actor);
    return jsonb_build_object('scheduled_change', null, 'renews_at', v_last.ends_at);
  end if;

  if p_action = 'downgrade' then
    if v_last.ends_at <= now() then
      -- Past the renewal date: renewing with the lower plan is the way.
      raise exception 'renew_instead' using errcode = 'P0001';
    end if;
    select * into v_new from public.products
     where id = p_product and kind = 'subscription' and plan_code is not null and is_active;
    if v_new.id is null then
      raise exception 'not_for_sale' using errcode = 'P0001';
    end if;
    select * into v_from from public.products where id = v_last.product_id;
    if v_new.price >= v_from.price then
      raise exception 'not_a_downgrade' using errcode = 'P0001';
    end if;
    if v_last.scheduled_change = 'downgrade' and v_last.scheduled_product_id = v_new.id then
      return jsonb_build_object('unchanged', true, 'scheduled_change', 'downgrade', 'effective_at', v_last.ends_at);
    end if;
    if v_last.scheduled_change = 'cancel' then
      insert into public.subscription_changes (subscription_id, shop_id, kind, from_product_id, effective_at, actor_id)
      values (v_last.id, p_shop, 'cancel_withdrawn', v_last.product_id, now(), p_actor);
    elsif v_last.scheduled_change = 'downgrade' then
      insert into public.subscription_changes (subscription_id, shop_id, kind, from_product_id, to_product_id, effective_at, actor_id)
      values (v_last.id, p_shop, 'downgrade_withdrawn', v_last.product_id, v_last.scheduled_product_id, v_last.ends_at, p_actor);
    end if;
    update public.subscriptions
       set scheduled_change = 'downgrade', scheduled_product_id = v_new.id, scheduled_at = now(), scheduled_by = p_actor
     where id = v_last.id;
    insert into public.subscription_changes (subscription_id, shop_id, kind, from_product_id, to_product_id, effective_at, actor_id)
    values (v_last.id, p_shop, 'downgrade_scheduled', v_last.product_id, v_new.id, v_last.ends_at, p_actor);
    return jsonb_build_object('scheduled_change', 'downgrade', 'product_id', v_new.id,
                              'plan_code', v_new.plan_code, 'price', v_new.price, 'effective_at', v_last.ends_at);
  end if;

  if p_action = 'undo_downgrade' then
    if v_last.scheduled_change is distinct from 'downgrade' then
      return jsonb_build_object('unchanged', true, 'scheduled_change', v_last.scheduled_change);
    end if;
    update public.subscriptions
       set scheduled_change = null, scheduled_product_id = null, scheduled_at = now(), scheduled_by = p_actor
     where id = v_last.id;
    insert into public.subscription_changes (subscription_id, shop_id, kind, from_product_id, to_product_id, effective_at, actor_id)
    values (v_last.id, p_shop, 'downgrade_withdrawn', v_last.product_id, v_last.scheduled_product_id, now(), p_actor);
    return jsonb_build_object('scheduled_change', null, 'renews_at', v_last.ends_at);
  end if;

  raise exception 'bad_action' using errcode = '22023';
end;
$$;

-- ── What a captured payment does (0191, rewritten for subscriptions) ──────

create or replace function public._shop_payment_captured()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product  public.products;
  v_expected numeric;
  v_start    timestamptz;
  v_grace    int;
  v_listing  public.listings;
  v_owner    uuid;
  v_intent   text;
  v_sub      public.subscriptions;
  v_last     public.subscriptions;
  v_period   uuid;
begin
  if new.status <> 'captured'
     or (tg_op = 'UPDATE' and old.status = 'captured')
     or new.kind not in ('subscription', 'promo') then
    return new;
  end if;

  begin
    select * into v_product from public.products where id = (new.metadata ->> 'product_id')::uuid;
  exception when others then
    v_product := null;
  end;
  if v_product.id is null then
    if new.kind = 'subscription' or new.metadata ? 'listing_id' then
      raise exception 'payment_product_missing' using errcode = 'P0001';
    end if;
    return new;   -- an old promo payment from before boosts: nothing to grant
  end if;

  v_expected := coalesce((new.metadata ->> 'expected_amount')::numeric, v_product.price);
  if new.amount < v_expected then
    raise exception 'amount_mismatch'
      using errcode = 'P0001',
            detail = format('captured %s, order was %s', new.amount, v_expected),
            hint = 'The captured amount does not cover the price of what was ordered.';
  end if;

  if new.kind = 'subscription' then
    if v_product.kind <> 'subscription' or new.shop_id is null then
      raise exception 'subscription_order_invalid' using errcode = 'P0001';
    end if;
    -- One change at a time per shop: two captures (a webhook and an admin,
    -- two payments) are applied one after the other, each seeing the other.
    perform 1 from public.shops where id = new.shop_id for update;
    v_intent := new.metadata ->> 'intent';
    select owner_id into v_owner from public.shops where id = new.shop_id;

    -- ── An upgrade: the same period changes plan, its end stays ──
    if v_intent = 'upgrade' then
      begin
        select * into v_sub from public.subscriptions
         where id = (new.metadata ->> 'subscription_id')::uuid and shop_id = new.shop_id
         for update;
      exception when others then
        v_sub := null;
      end;
      if v_sub.id is null or v_sub.status not in ('active', 'grace')
         or not (v_sub.starts_at <= now() and now() < v_sub.ends_at) then
        raise exception 'upgrade_period_over' using errcode = 'P0001',
          hint = 'The period this upgrade was priced on is no longer running.';
      end if;
      if v_sub.product_id::text is distinct from new.metadata ->> 'from_product_id' then
        raise exception 'upgrade_stale' using errcode = 'P0001',
          hint = 'The plan changed after this upgrade was ordered.';
      end if;

      update public.subscriptions
         set product_id           = v_product.id,
             limits               = v_product.limits,
             scheduled_change     = case when scheduled_change = 'downgrade' then null else scheduled_change end,
             scheduled_product_id = case when scheduled_change = 'downgrade' then null else scheduled_product_id end
       where id = v_sub.id;
      if v_sub.scheduled_change = 'downgrade' then
        insert into public.subscription_changes (subscription_id, shop_id, kind, from_product_id, to_product_id, effective_at, actor_id)
        values (v_sub.id, new.shop_id, 'downgrade_withdrawn', v_sub.product_id, v_sub.scheduled_product_id, now(), new.user_id);
      end if;
      insert into public.subscription_changes
        (subscription_id, shop_id, kind, from_product_id, to_product_id, payment_id, amount, effective_at, actor_id)
      values (v_sub.id, new.shop_id, 'upgraded', v_sub.product_id, v_product.id, new.id, new.amount, now(), new.user_id)
      on conflict (payment_id) do nothing;

      perform public._resume_shop_listings(new.shop_id);
      begin
        perform public.enqueue_notification(
          v_owner, 'subscription_active', 'Formule mise à niveau',
          format('Votre formule %s est active dès maintenant, jusqu''au %s.', v_product.name_fr,
                 to_char(v_sub.ends_at, 'DD/MM/YYYY')),
          '/pro/dashboard/abonnement');
      exception when others then null;
      end;
      return new;
    end if;

    -- ── A period: the shop's first, or the renewal of the last one ──
    select * into v_last from public.subscriptions
     where shop_id = new.shop_id and status in ('active', 'grace') and grace_ends_at > now()
     order by ends_at desc limit 1
     for update;
    if v_last.id is not null then
      if v_intent = 'subscribe' then
        raise exception 'subscription_exists' using errcode = 'P0001',
          hint = 'The shop already has a subscription: renew, upgrade or downgrade it.';
      end if;
      if v_last.scheduled_change = 'cancel' then
        raise exception 'subscription_cancelled' using errcode = 'P0001';
      end if;
      if exists (select 1 from public.subscriptions
                  where shop_id = new.shop_id and status in ('active', 'grace') and starts_at > now()) then
        raise exception 'renewal_already_paid' using errcode = 'P0001';
      end if;
      -- Before the renewal date the next period is the same plan, or the
      -- lower one scheduled; past it (grace) any plan may be chosen.
      if v_last.ends_at > now() and v_product.id <> coalesce(v_last.scheduled_product_id, v_last.product_id) then
        raise exception 'plan_change_not_allowed' using errcode = 'P0001',
          hint = 'A different plan is an upgrade (now) or a downgrade (at renewal), never a second subscription.';
      end if;
      v_start := greatest(now(), v_last.ends_at);
    else
      v_start := now();
    end if;

    select coalesce((value #>> '{}')::int, 7) into v_grace from public.app_settings where key = 'pro_grace_days';
    v_grace := coalesce(v_grace, 7);

    insert into public.subscriptions
      (shop_id, product_id, limits, status, starts_at, ends_at, grace_ends_at, payment_id)
    values
      (new.shop_id, v_product.id, v_product.limits, 'active', v_start,
       v_start + make_interval(days => v_product.duration_days),
       v_start + make_interval(days => v_product.duration_days + v_grace),
       new.id)
    on conflict (payment_id) do nothing
    returning id into v_period;

    -- The renewal takes the scheduled downgrade (or, in grace, replaces it).
    if v_period is not null and v_last.scheduled_change = 'downgrade' then
      update public.subscriptions set scheduled_change = null, scheduled_product_id = null where id = v_last.id;
      insert into public.subscription_changes
        (subscription_id, shop_id, kind, from_product_id, to_product_id, payment_id, amount, effective_at, actor_id)
      values (v_period, new.shop_id,
              case when v_product.id = v_last.scheduled_product_id then 'downgrade_applied' else 'downgrade_withdrawn' end,
              v_last.product_id, v_product.id, new.id, new.amount, v_start, new.user_id)
      on conflict (payment_id) do nothing;
    end if;

    -- The first paid period opens a new shop. The badge stays an admin's call.
    perform set_config('mazed.shop_admin', 'on', true);
    update public.shops set status = 'active'
     where id = new.shop_id and status in ('draft', 'pending_review');
    perform set_config('mazed.shop_admin', 'off', true);

    perform public._resume_shop_listings(new.shop_id);

    begin
      perform public.enqueue_notification(
        v_owner, 'subscription_active', 'Abonnement activé',
        format('Votre formule %s est active jusqu''au %s.', v_product.name_fr,
               to_char(v_start + make_interval(days => v_product.duration_days), 'DD/MM/YYYY')),
        '/pro/dashboard/abonnement');
    exception when others then null;
    end;
    return new;
  end if;

  -- ── A boost ──
  if v_product.slug = 'boost-7j' then
    select * into v_listing from public.listings where id = (new.metadata ->> 'listing_id')::uuid for update;
    if v_listing.id is null then
      raise exception 'boost_listing_missing' using errcode = 'P0001';
    end if;
    v_start := greatest(now(), coalesce(v_listing.sponsored_until, now()));
    insert into public.boosts (listing_id, shop_id, payment_id, starts_at, ends_at, status)
    values (v_listing.id, v_listing.shop_id, new.id, v_start,
            v_start + make_interval(days => v_product.duration_days), 'active')
    on conflict (payment_id) do nothing;
    if found then
      update public.listings
         set sponsored_until = v_start + make_interval(days => v_product.duration_days)
       where id = v_listing.id;
    end if;
  end if;

  return new;
end;
$$;

-- ── Reminders that know what was scheduled (0192, warnings only) ──────────
-- A cancelled subscription is told when it ends — not asked to renew; one
-- with a downgrade is told the renewal will be the lower plan.

create or replace function public.expire_subscriptions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_owner    uuid;
  v_warned   int := 0;
  v_grace    int := 0;
  v_expired  int := 0;
  v_paused   int := 0;
  v_live     int;
  v_limit    int;
  v_bucket   text;
  v_title    text;
  v_body     text;
  v_next     text;
begin
  for r in
    select s.*
      from public.subscriptions s
     where s.status = 'active'
       and s.ends_at > now()
       and s.ends_at <= now() + interval '7 days'
       and not exists (
         select 1 from public.subscriptions n
          where n.shop_id = s.shop_id and n.id <> s.id
            and n.status in ('active', 'grace') and n.ends_at > s.ends_at
       )
     for update of s skip locked
  loop
    select owner_id into v_owner from public.shops where id = r.shop_id;
    select name_fr into v_next from public.products where id = r.scheduled_product_id;
    if r.ends_at <= now() + interval '1 day' and r.warned_1d_at is null then
      if r.scheduled_change = 'cancel' then
        v_title := 'Votre abonnement prend fin demain';
        v_body := 'Comme vous l''avez demandé, il n''est pas renouvelé. Vous pouvez encore le reprendre depuis votre espace pro.';
      elsif r.scheduled_change = 'downgrade' then
        v_title := 'Votre abonnement se renouvelle demain';
        v_body := format('Renouvelez-le avec la formule %s, comme prévu, pour que vos annonces restent en ligne.', v_next);
      else
        v_title := 'Votre abonnement se termine demain';
        v_body := 'Renouvelez-le pour que vos annonces restent en ligne et que vous puissiez en publier de nouvelles.';
      end if;
      perform public.enqueue_notification(v_owner, 'subscription_ending', v_title, v_body, '/pro/dashboard/abonnement');
      update public.subscriptions set warned_1d_at = now(), warned_7d_at = coalesce(warned_7d_at, now()) where id = r.id;
      v_warned := v_warned + 1;
    elsif r.warned_7d_at is null then
      if r.scheduled_change = 'cancel' then
        v_title := 'Votre abonnement prend fin dans 7 jours';
        v_body := format('Il prend fin le %s, sans renouvellement, comme vous l''avez demandé.', to_char(r.ends_at, 'DD/MM/YYYY'));
      elsif r.scheduled_change = 'downgrade' then
        v_title := 'Votre abonnement se renouvelle dans 7 jours';
        v_body := format('Le %s, il passe à la formule %s. Renouvelez-le depuis votre espace pro.', to_char(r.ends_at, 'DD/MM/YYYY'), v_next);
      else
        v_title := 'Votre abonnement se termine dans 7 jours';
        v_body := format('Il prend fin le %s. Renouvelez-le depuis votre espace pro.', to_char(r.ends_at, 'DD/MM/YYYY'));
      end if;
      perform public.enqueue_notification(v_owner, 'subscription_ending', v_title, v_body, '/pro/dashboard/abonnement');
      update public.subscriptions set warned_7d_at = now() where id = r.id;
      v_warned := v_warned + 1;
    end if;
  end loop;

  update public.subscriptions set status = 'grace'
   where status = 'active' and ends_at <= now();
  get diagnostics v_grace = row_count;

  for r in
    select s.*
      from public.subscriptions s
     where s.status = 'grace' and s.grace_ends_at <= now()
     for update skip locked
  loop
    update public.subscriptions set status = 'expired' where id = r.id;
    v_expired := v_expired + 1;

    if not exists (
      select 1 from public.subscriptions n
       where n.shop_id = r.shop_id and n.status in ('active', 'grace') and n.grace_ends_at > now()
    ) then
      with paused as (
        update public.listings
           set paused_from   = status::text,
               status        = 'paused',
               paused_reason = 'subscription_expired',
               paused_at     = now()
         where shop_id = r.shop_id
           and status in ('published', 'pending_review')
        returning 1
      )
      select count(*) into v_live from paused;
      v_paused := v_paused + v_live;

      select owner_id into v_owner from public.shops where id = r.shop_id;
      perform public.enqueue_notification(v_owner, 'subscription_expired', 'Abonnement expiré',
        format('%s annonce(s) de votre boutique sont en pause. Rien n''est supprimé : elles reviennent dès le renouvellement.', v_live),
        '/pro/dashboard/abonnement');
    end if;
  end loop;

  for r in
    select sh.id as shop_id, sh.activity_type, sub.limits
      from public.shops sh
      join lateral (
        select s.limits from public.subscriptions s
         where s.shop_id = sh.id and s.status in ('active', 'grace')
           and s.starts_at <= now() and now() < s.ends_at
         order by (s.limits ->> 'vehicles')::int desc limit 1
      ) sub on true
     where sh.status = 'active'
  loop
    v_bucket := case when r.activity_type = 'pieces_auto' then 'parts' else 'vehicles' end;
    v_limit := coalesce((r.limits ->> v_bucket)::int, 0);
    select count(*) into v_live
      from public.listings
     where shop_id = r.shop_id and status in ('published', 'pending_review');
    if v_live > v_limit then
      with surplus as (
        select id from public.listings
         where shop_id = r.shop_id and status in ('published', 'pending_review')
         order by coalesce(published_at, created_at) asc
         limit v_live - v_limit
      )
      update public.listings l
         set paused_from = l.status::text, status = 'paused',
             paused_reason = 'over_limit', paused_at = now()
        from surplus where l.id = surplus.id;
      v_paused := v_paused + (v_live - v_limit);
    end if;
  end loop;

  return jsonb_build_object('warned', v_warned, 'grace', v_grace, 'expired', v_expired, 'paused', v_paused);
end;
$$;

-- ── Grants ─────────────────────────────────────────────────────────────────
-- The routes check membership, then call these with the service role.

revoke all on function public.subscription_quote(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.subscription_quote(uuid, uuid, text) to service_role;
revoke all on function public.create_subscription_order(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_subscription_order(uuid, uuid, uuid, text, text, uuid) to service_role;
revoke all on function public.shop_subscription_change(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.shop_subscription_change(uuid, uuid, text, uuid) to service_role;
revoke all on function public.expire_subscriptions() from public, anon, authenticated;
grant execute on function public.expire_subscriptions() to service_role;

notify pgrst, 'reload schema';
