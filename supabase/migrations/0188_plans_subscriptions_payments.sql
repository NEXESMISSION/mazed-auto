-- ============================================================================
-- Plans and subscription periods.
--
-- PLANS ARE PRODUCTS. `products` already carries every price on the site and
-- `/admin/offres` already edits it; a second price table is how two prices for
-- the same thing happen (PIVOT-PLAN §2.2). A plan is a `products` row of kind
-- 'subscription' with two new columns:
--
--   plan_code   stable handle the code refers to (starter / pro / business)
--   limits      {"vehicles": n, "parts": m} — active annonces allowed, per
--               bucket. A shop is held to the bucket of its own activity,
--               never to the sum (« l'activité principale »).
--
-- The brief's three plans and the 7-day boost are seeded INACTIVE: they are
-- for sale only once an admin switches them on, after the TTC/HT and invoicing
-- questions are settled (D-P6). `listing_quota` mirrors the vehicle limit
-- because 0157 requires it on every subscription row; `limits` is what counts.
--
-- A SUBSCRIPTION IS A PERIOD. One row per paid (or granted) period, never
-- extended in place, so "what did this shop have on 3 March" is a query and not
-- an archaeology. `limits` is copied from the plan at purchase: an admin
-- lowering a plan's limits must not shrink what someone already paid for.
-- `payment_id` is UNIQUE — one confirmed payment can open one period, however
-- many times its confirmation is replayed (lot 4).
--
-- PAYMENTS. `shop_id`, and the index the brief asks for: a provider reference
-- can only ever be attached to one payment.
-- ============================================================================

alter table public.products
  add column if not exists plan_code text,
  add column if not exists limits    jsonb;

create unique index if not exists products_plan_code_uniq
  on public.products (plan_code) where plan_code is not null;

alter table public.products drop constraint if exists products_limits_shape;
alter table public.products add constraint products_limits_shape
  check (
    limits is null
    or (jsonb_typeof(limits -> 'vehicles') = 'number'
        and jsonb_typeof(limits -> 'parts') = 'number'
        and (limits ->> 'vehicles')::int >= 0
        and (limits ->> 'parts')::int >= 0)
  );

alter table public.products drop constraint if exists products_plan_is_subscription;
alter table public.products add constraint products_plan_is_subscription
  check (plan_code is null or (kind = 'subscription' and limits is not null and duration_days is not null));

insert into public.products
  (slug, kind, name_fr, description, price, listing_quota, duration_days, plan_code, limits, is_active, sort_order)
values
  ('plan-starter', 'subscription', 'Starter',
   'Boutique professionnelle : 10 véhicules (vente ou location) ou 50 pièces en ligne.',
   29, 10, 30, 'starter', '{"vehicles": 10, "parts": 50}', false, 110),
  ('plan-pro', 'subscription', 'Pro',
   'Boutique professionnelle : 40 véhicules (vente ou location) ou 250 pièces en ligne.',
   79, 40, 30, 'pro', '{"vehicles": 40, "parts": 250}', false, 120),
  ('plan-business', 'subscription', 'Business',
   'Boutique professionnelle : 120 véhicules (vente ou location) ou 1 000 pièces en ligne.',
   149, 120, 30, 'business', '{"vehicles": 120, "parts": 1000}', false, 130),
  ('boost-7j', 'promo', 'Boost 7 jours',
   'Annonce mise en avant pendant 7 jours, signalée « Sponsorisé ».',
   9, null, 7, null, null, false, 140)
on conflict (slug) do nothing;

-- ── Subscription periods ────────────────────────────────────────────────────

create table if not exists public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete restrict,
  product_id    uuid not null references public.products(id),
  limits        jsonb not null,
  status        text not null default 'active'
                  check (status in ('active', 'grace', 'expired', 'cancelled')),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  grace_ends_at timestamptz not null,
  payment_id    uuid unique references public.payments(id),
  granted_by    uuid references public.profiles(id),
  reason        text,
  created_at    timestamptz not null default now(),
  constraint subscriptions_period check (ends_at > starts_at and grace_ends_at >= ends_at),
  -- Every period is either paid for or deliberately given, with a reason.
  constraint subscriptions_has_origin check (payment_id is not null or reason is not null),
  constraint subscriptions_limits_shape check (
    jsonb_typeof(limits -> 'vehicles') = 'number' and jsonb_typeof(limits -> 'parts') = 'number'
  )
);

create index if not exists subscriptions_shop_idx on public.subscriptions (shop_id, ends_at desc);

alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

drop policy if exists subscriptions_member_read on public.subscriptions;
create policy subscriptions_member_read on public.subscriptions
  for select to authenticated
  using (public.is_shop_member(shop_id) or public.is_admin());

-- The period a shop may publish under right now. Grace (after ends_at) is not
-- one: during grace the annonces stay up but nothing new goes out.
create or replace function public.shop_current_subscription(p_shop uuid)
returns public.subscriptions
language sql
stable
security definer
set search_path = public
as $$
  select s.*
    from public.subscriptions s
   where s.shop_id = p_shop
     and s.status in ('active', 'grace')
     and s.starts_at <= now()
     and now() < s.ends_at
   order by (s.limits ->> 'vehicles')::int desc, s.ends_at desc
   limit 1;
$$;

revoke all on function public.shop_current_subscription(uuid) from public;
grant execute on function public.shop_current_subscription(uuid) to service_role;

create or replace function public._audit_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, entity, entity_id, action, after, reason)
    values (coalesce(auth.uid(), new.granted_by), 'subscription', new.id, 'created',
            jsonb_build_object('shop_id', new.shop_id, 'product_id', new.product_id,
                               'limits', new.limits, 'starts_at', new.starts_at,
                               'ends_at', new.ends_at, 'payment_id', new.payment_id),
            new.reason);
  elsif new.status is distinct from old.status then
    insert into public.audit_logs (actor_id, entity, entity_id, action, before, after)
    values (auth.uid(), 'subscription', new.id, 'status_changed',
            jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists _audit_subscription on public.subscriptions;
create trigger _audit_subscription
  after insert or update on public.subscriptions
  for each row execute function public._audit_subscription();

-- ── Payments ────────────────────────────────────────────────────────────────

alter table public.payments
  add column if not exists shop_id uuid references public.shops(id);

create index if not exists payments_shop_idx on public.payments (shop_id) where shop_id is not null;

-- The brief's « index d'unicité paiement »: a provider reference names one
-- payment, so a replayed webhook can only ever find the row it already found.
create unique index if not exists payments_provider_ref_uniq
  on public.payments (provider, provider_ref) where provider_ref is not null;

-- Every webhook, return and reconciliation check, kept raw (used from lot 4).
create table if not exists public.payment_events (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid,          -- by value: kept even if the payment row is ever removed
  provider     public.payment_provider not null,
  provider_ref text,
  source       text not null check (source in ('webhook', 'return', 'reconcile', 'admin')),
  verified     jsonb,
  outcome      text not null,
  created_at   timestamptz not null default now()
);
create index if not exists payment_events_payment_idx on public.payment_events (payment_id, created_at desc);

alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;
grant select on public.payment_events to authenticated;
drop policy if exists payment_events_admin_read on public.payment_events;
create policy payment_events_admin_read on public.payment_events
  for select to authenticated
  using (public.is_admin());

notify pgrst, 'reload schema';
