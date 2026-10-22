-- ============================================================================
-- A confirmed payment opens exactly one subscription period, or one 7-day
-- boost — whoever confirmed it.
--
-- Two ways a payment becomes 'captured':
--   * manual — an admin accepts the receipt in /admin/paiements (service role);
--   * Konnect — /api/payments/konnect/webhook, after asking Konnect itself
--     whether the payment is complete (never on the browser's word), calls
--     `confirm_payment()`.
-- Both end in the same UPDATE of `payments.status`, so the effects live in a
-- trigger on that transition, not in either route.
--
-- WHAT A CAPTURED PAYMENT DOES
--   kind 'subscription' → one `subscriptions` row: it starts now, or when the
--     shop's current period ends (an early renewal does not waste days); it
--     lasts the plan's `duration_days`; grace follows (`pro_grace_days`); the
--     plan's limits are copied onto it. A shop's FIRST paid period also opens
--     the shop (draft → active) — the admin decides the badge, not the right to
--     trade. Annonces paused because the previous period ran out come back.
--   kind 'promo', product 'boost-7j' → one `boosts` row of 7 days, and the
--     annonce's `sponsored_until`, which the catalogue ranks and labels
--     « Sponsorisé ».
-- `subscriptions.payment_id` and `boosts.payment_id` are UNIQUE, so a replayed
-- confirmation — a webhook delivered twice, an admin double-click — can only
-- ever find the row it already created (recette 5).
--
-- THE MONEY CHECK. The captured amount must cover the price recorded on the
-- order (`metadata.expected_amount`, written by the server from `products`).
-- And a client can no longer create such an order at all: since 0057 a
-- signed-in user could INSERT any 'pending' payment of any kind and amount, and
-- nothing compared the amount when an admin accepted the receipt — a 1 TND
-- transfer could have bought a Business plan. `payments_self_insert` now
-- refuses the kinds that grant something, and any `shop_id`.
--
-- RECEIPTS. Every payment captured from now on gets a number, R2026-000001, in
-- order. It is a receipt, not an invoice: invoicing waits on the fiscal
-- questions of D-P6.
-- ============================================================================

-- ── Who may create a payment row ───────────────────────────────────────────

drop policy if exists payments_self_insert on public.payments;
create policy payments_self_insert on public.payments
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and kind not in ('subscription', 'promo', 'listing_pack', 'badge')
    and shop_id is null
  );

-- ── Receipt numbers ──────────────────────────────────────────────────────────

create sequence if not exists public.receipt_seq;
alter table public.payments add column if not exists receipt_number text;
create unique index if not exists payments_receipt_number_uniq
  on public.payments (receipt_number) where receipt_number is not null;

create or replace function public._payments_receipt_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'captured'
     and (tg_op = 'INSERT' or old.status is distinct from 'captured')
     and new.receipt_number is null then
    new.receipt_number := 'R' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists _payments_receipt_number on public.payments;
create trigger _payments_receipt_number
  before insert or update on public.payments
  for each row execute function public._payments_receipt_number();

-- ── Boosts ──────────────────────────────────────────────────────────────────

alter table public.listings add column if not exists sponsored_until timestamptz;
create index if not exists listings_sponsored_idx
  on public.listings (sponsored_until desc) where sponsored_until is not null;
grant select (sponsored_until) on public.listings to anon, authenticated;

create table if not exists public.boosts (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  shop_id    uuid references public.shops(id),
  payment_id uuid unique references public.payments(id),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  status     text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint boosts_period check (ends_at > starts_at)
);
create index if not exists boosts_listing_idx on public.boosts (listing_id, ends_at desc);

alter table public.boosts enable row level security;
revoke all on public.boosts from anon, authenticated;
grant select on public.boosts to authenticated;
drop policy if exists boosts_read on public.boosts;
create policy boosts_read on public.boosts
  for select to authenticated
  using (
    public.is_admin()
    or (shop_id is not null and public.is_shop_member(shop_id))
    or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
  );

-- ── Bringing paused annonces back ───────────────────────────────────────────
-- Listings paused when a period ran out (0192) return to the state they were
-- paused from, newest first, until the quota is full. The quota trigger is the
-- referee: the first refusal stops the loop, the rest stay paused for the
-- owner to choose from.

alter table public.listings add column if not exists paused_from text
  check (paused_from is null or paused_from in ('published', 'pending_review'));

create or replace function public._resume_shop_listings(p_shop uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  v_done int := 0;
begin
  for r in
    select id, paused_from, expires_at
      from public.listings
     where shop_id = p_shop
       and status = 'paused'
       and paused_reason in ('subscription_expired', 'over_limit')
     order by coalesce(published_at, created_at) desc
  loop
    begin
      update public.listings
         set status        = case
                               when r.paused_from = 'published' and coalesce(r.expires_at > now(), false)
                                 then 'published'::listing_status
                               when r.paused_from = 'published' then 'expired'::listing_status
                               else 'pending_review'::listing_status
                             end,
             paused_reason = null,
             paused_at     = null,
             paused_from   = null
       where id = r.id;
      v_done := v_done + 1;
    exception when others then
      exit;   -- quota full (or no current period): the rest wait for the owner
    end;
  end loop;
  return v_done;
end;
$$;

revoke all on function public._resume_shop_listings(uuid) from public, anon, authenticated;

-- ── The effects of a captured payment ──────────────────────────────────────

create or replace function public._shop_payment_captured()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product  public.products;
  v_expected numeric;
  v_last     timestamptz;
  v_start    timestamptz;
  v_grace    int;
  v_listing  public.listings;
  v_owner    uuid;
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

  -- ── A subscription period ──
  if new.kind = 'subscription' then
    if v_product.kind <> 'subscription' or new.shop_id is null then
      raise exception 'subscription_order_invalid' using errcode = 'P0001';
    end if;

    select coalesce((value #>> '{}')::int, 7) into v_grace from public.app_settings where key = 'pro_grace_days';
    v_grace := coalesce(v_grace, 7);

    select max(ends_at) into v_last
      from public.subscriptions
     where shop_id = new.shop_id and status in ('active', 'grace') and ends_at > now();
    v_start := greatest(now(), coalesce(v_last, now()));

    insert into public.subscriptions
      (shop_id, product_id, limits, status, starts_at, ends_at, grace_ends_at, payment_id)
    values
      (new.shop_id, v_product.id, v_product.limits, 'active', v_start,
       v_start + make_interval(days => v_product.duration_days),
       v_start + make_interval(days => v_product.duration_days + v_grace),
       new.id)
    on conflict (payment_id) do nothing;

    -- The first paid period opens a new shop. The badge stays an admin's call.
    perform set_config('mazed.shop_admin', 'on', true);
    update public.shops set status = 'active'
     where id = new.shop_id and status in ('draft', 'pending_review');
    perform set_config('mazed.shop_admin', 'off', true);

    perform public._resume_shop_listings(new.shop_id);

    select owner_id into v_owner from public.shops where id = new.shop_id;
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

drop trigger if exists _shop_payment_captured on public.payments;
create trigger _shop_payment_captured
  after insert or update of status on public.payments
  for each row execute function public._shop_payment_captured();

-- ── The one door a payment provider's confirmation goes through ──────────

create or replace function public.confirm_payment(
  p_payment_id uuid,
  p_source     text,
  p_verified   jsonb default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if v_pay.id is null then
    return 'unknown_payment';
  end if;

  if v_pay.status = 'captured' then
    insert into public.payment_events (payment_id, provider, provider_ref, source, verified, outcome)
    values (v_pay.id, v_pay.provider, v_pay.provider_ref, p_source, p_verified, 'already_captured');
    return 'already_captured';
  end if;
  if v_pay.status not in ('pending', 'pending_review') then
    insert into public.payment_events (payment_id, provider, provider_ref, source, verified, outcome)
    values (v_pay.id, v_pay.provider, v_pay.provider_ref, p_source, p_verified, 'not_capturable');
    return 'not_capturable';
  end if;

  update public.payments
     set status      = 'captured',
         reviewed_at = now(),
         metadata    = coalesce(metadata, '{}'::jsonb)
                       || jsonb_build_object('confirmed_by', p_source, 'provider_check', p_verified)
   where id = v_pay.id;

  insert into public.payment_events (payment_id, provider, provider_ref, source, verified, outcome)
  values (v_pay.id, v_pay.provider, v_pay.provider_ref, p_source, p_verified, 'captured');
  return 'captured';
end;
$$;

revoke all on function public.confirm_payment(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_payment(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
