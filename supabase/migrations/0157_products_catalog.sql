-- ============================================================================
-- v3 PHASE 2 (1/2) — everything a seller can buy, in one table.
--
-- Today a price is a jsonb blob in app_settings, read by hand-written code:
-- `fee_listing_auction`, `fee_listing_direct`, `promo_home`, `promo_top`,
-- `promo_banner`, `deposit`. Adding "5 annonces pour 120 TND" means a schema
-- decision, a parser, a form field and a deploy. That is the wrong shape for
-- the part of the business that should move fastest.
--
-- So: one row per purchasable thing, one admin screen over it, no deploy.
--
--   listing_single   one publication, priced per category (D4)
--   listing_pack     N publications, prepaid — the "many cars" case
--   subscription     a period of publishing, for agencies
--   promo            home feature / top of search / banner
--   badge_verified   the paid "Vendeur vérifié" badge (granted by hand — 0158)
--   renewal          re-publish an expired listing
--
-- app_settings keeps the NON-price settings (payee details, anti-snipe, final
-- payment days). Prices leave it for good, and 0157 seeds today's numbers as
-- rows so nothing changes commercially the day this ships.
-- ============================================================================

create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique
                  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind          text not null check (kind in (
                  'listing_single', 'listing_pack', 'subscription',
                  'promo', 'badge_verified', 'renewal')),
  name_fr       text not null,
  name_ar       text,
  description   text,

  price         numeric(10,2) not null check (price >= 0),

  -- null = applies to every category. Set it to price a car differently from
  -- a brake pad (D4).
  category_id   uuid references public.categories(id) on delete restrict,

  -- packs / subscriptions: how many publications this grants. null elsewhere.
  listing_quota int check (listing_quota is null or listing_quota > 0),

  -- what the purchase BUYS in days: a listing's lifetime, a badge's validity,
  -- a promo's run, a subscription's period.
  duration_days int check (duration_days is null or duration_days > 0),

  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A pack without a quota is a pack that grants nothing.
  constraint products_pack_has_quota
    check (kind not in ('listing_pack', 'subscription') or listing_quota is not null),
  -- A badge with no validity never expires, which is not a product we sell (D10).
  constraint products_badge_has_duration
    check (kind <> 'badge_verified' or duration_days is not null)
);

create index if not exists products_kind_idx on public.products(kind, is_active, sort_order);
create index if not exists products_category_idx on public.products(category_id) where category_id is not null;

-- One active single-listing price per category (including the global one), so
-- "what does it cost to post a car?" always has exactly one answer.
create unique index if not exists products_one_active_single_per_category
  on public.products (kind, coalesce(category_id::text, 'global'))
  where is_active and kind = 'listing_single';

drop trigger if exists _touch_products on public.products;
create trigger _touch_products before update on public.products
  for each row execute function public._touch_updated_at();

alter table public.products enable row level security;

-- The price list is public: a seller must see what publishing costs before
-- they start. Only admins write it.
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products
  for select using (is_active or public.is_admin());

drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.products to anon, authenticated;
grant all    on public.products to service_role;

-- ── Seed: today's prices, as rows ───────────────────────────────────────────
-- Read straight out of app_settings so the migration cannot invent a number.
-- `fee_listing_direct` is the fixed-price fee, which is what every v3 listing
-- is; the auction fee has nothing left to price.
insert into public.products (slug, kind, name_fr, description, price, duration_days, sort_order)
select
  'annonce-standard',
  'listing_single',
  'Annonce standard',
  'Publication d''une annonce à prix fixe pendant 30 jours.',
  coalesce((select (value->>'value')::numeric from public.app_settings where key = 'fee_listing_direct'), 15),
  30,
  10
on conflict (slug) do nothing;

insert into public.products (slug, kind, name_fr, description, price, duration_days, sort_order)
select 'renouvellement', 'renewal', 'Renouvellement',
       'Remet une annonce expirée en ligne pour 30 jours.',
       coalesce((select (value->>'value')::numeric from public.app_settings where key = 'fee_listing_direct'), 15),
       30, 20
on conflict (slug) do nothing;

-- Packs ship INACTIVE at a price of 0: the admin sets the price and switches
-- them on. A pack sold at a number this migration invented would be worse than
-- no pack at all. (The quota goes in on the INSERT — products_pack_has_quota
-- rejects a pack that grants nothing, which is exactly right.)
insert into public.products
  (slug, kind, name_fr, description, price, listing_quota, duration_days, is_active, sort_order)
values
  ('pack-5-annonces',  'listing_pack', 'Pack 5 annonces',
   'Cinq publications à utiliser quand vous voulez, valables 12 mois.', 0, 5, 30, false, 30),
  ('pack-20-annonces', 'listing_pack', 'Pack 20 annonces',
   'Vingt publications pour les professionnels, valables 12 mois.', 0, 20, 30, false, 40)
on conflict (slug) do nothing;

insert into public.products (slug, kind, name_fr, description, price, duration_days, is_active, sort_order)
values ('badge-verifie', 'badge_verified', 'Badge Vendeur vérifié',
        'Contrôle de votre identité et de vos documents par notre équipe. '
        || 'Le badge apparaît sur toutes vos annonces pendant 12 mois.',
        0, 365, false, 50)
on conflict (slug) do nothing;

-- Promos carry over at their current prices and stay active — they are already
-- being sold in the sell flow.
insert into public.products (slug, kind, name_fr, description, price, duration_days, sort_order)
select 'promo-accueil', 'promo', 'Mise en avant · accueil',
       'Votre annonce dans le carrousel de la page d''accueil.',
       coalesce((select (value->>'value')::numeric from public.app_settings where key = 'promo_home'), 15),
       coalesce((select (value->>'duration_days')::int from public.app_settings where key = 'promo_home'), 30),
       60
on conflict (slug) do nothing;

insert into public.products (slug, kind, name_fr, description, price, duration_days, sort_order)
select 'promo-top-recherche', 'promo', 'Top de la recherche',
       'Votre annonce en tête des résultats de sa catégorie.',
       coalesce((select (value->>'value')::numeric from public.app_settings where key = 'promo_top'), 10),
       coalesce((select (value->>'duration_days')::int from public.app_settings where key = 'promo_top'), 30),
       70
on conflict (slug) do nothing;

insert into public.products (slug, kind, name_fr, description, price, duration_days, sort_order)
select 'promo-banniere', 'promo', 'Bannière d''accueil',
       'Votre annonce en bannière sur la page d''accueil.',
       coalesce((select (value->>'value')::numeric from public.app_settings where key = 'promo_banner'), 30),
       coalesce((select (value->>'duration_days')::int from public.app_settings where key = 'promo_banner'), 30),
       80
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
