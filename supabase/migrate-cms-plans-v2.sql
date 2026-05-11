-- ============================================================
-- Mazed Auto — Plans schema v2
--
-- Round 2 of plan configuration. Adds every per-plan limit /
-- perk found in the docs (Mazed_Auto_Project_v3 §8.2.x and the
-- workflows.html plans table) so the admin can build any tier
-- mix without code changes. Drops the API-access flag which has
-- no consumer in our product.
--
-- New fields (all admin-editable from /admin/cms/plans):
--   featured_listing_discount_pct   — % off the per-auction
--                                     "featured" / "VIP" / "top
--                                     of search" fees
--   has_trusted_seller_badge        — shows the gold badge on
--                                     every listing
--   has_homepage_placement          — pins each new listing on
--                                     the home page rail
--   has_custom_reports              — monthly PDF/CSV report
--   max_listing_duration_days       — cap on the duration knob
--                                     (default 14)
--   max_photos                      — > 12 if the plan allows
--                                     extra photo slots
--   max_video_seconds               — > 120 for premium walk-
--                                     arounds
--   max_concurrent_active_listings  — -1 for unlimited
--   auto_renew_listings             — automatic re-listing
--   direct_phone_visible            — show contact phone on
--                                     public listing
--   bulk_import_enabled             — CSV/Excel import tool
--   analytics_level (enum)          — basic / advanced /
--                                     advanced_export
--   showroom_level (enum)           — none / standard /
--                                     custom / branded
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1) Drop the API field (no real consumer).
--
-- The `user_active_subscription` view from migrate-cms-plans.sql v1
-- selects this column. Dropping it directly hits a dependency error,
-- so we drop the view first, drop the column, then recreate the view
-- below (in step 6) without it — and with a couple of the new fields
-- exposed so /admin/users/[id] can show them.
drop view if exists public.user_active_subscription;

alter table public.cms_subscription_plans
  drop column if exists has_api_access;

-- 2) Add the new flag / limit columns.
alter table public.cms_subscription_plans
  add column if not exists featured_listing_discount_pct  int  not null default 0,
  add column if not exists has_trusted_seller_badge       boolean not null default false,
  add column if not exists has_homepage_placement         boolean not null default false,
  add column if not exists has_custom_reports             boolean not null default false,
  add column if not exists max_listing_duration_days      int  not null default 14,
  add column if not exists max_photos                     int  not null default 12,
  add column if not exists max_video_seconds              int  not null default 120,
  add column if not exists max_concurrent_active_listings int  not null default -1,
  add column if not exists auto_renew_listings            boolean not null default false,
  add column if not exists direct_phone_visible           boolean not null default false,
  add column if not exists bulk_import_enabled            boolean not null default false,
  add column if not exists analytics_level                text not null default 'basic',
  add column if not exists showroom_level                 text not null default 'standard';

-- Replace any prior CHECK that might block the enum widening, then re-add.
do $$
begin
  alter table public.cms_subscription_plans
    drop constraint if exists cms_plans_analytics_level_check;
  alter table public.cms_subscription_plans
    add  constraint cms_plans_analytics_level_check
    check (analytics_level in ('basic','advanced','advanced_export'));

  alter table public.cms_subscription_plans
    drop constraint if exists cms_plans_showroom_level_check;
  alter table public.cms_subscription_plans
    add  constraint cms_plans_showroom_level_check
    check (showroom_level in ('none','standard','custom','branded'));
end $$;

-- 3) Backfill enum levels from the legacy boolean columns so
--    existing seeds carry over to the new fields without manual
--    intervention. Booleans stay (they're harmless) but the
--    editor/UI reads from the enums going forward.
update public.cms_subscription_plans
   set analytics_level = case
       when has_analytics_export    then 'advanced_export'
       when has_advanced_analytics  then 'advanced'
       else 'basic'
     end
 where analytics_level = 'basic'
   and (has_advanced_analytics or has_analytics_export);

update public.cms_subscription_plans
   set showroom_level = case
       when has_branded_showroom then 'branded'
       when has_custom_showroom  then 'custom'
       else 'standard'
     end
 where showroom_level = 'standard'
   and (has_branded_showroom or has_custom_showroom);

-- 4) Bring the seeded Silver/Gold/Diamond rows in line with the
--    v3 doc + workflows table. Only touches the v2 columns —
--    doesn't overwrite admin edits on the v1 columns.
update public.cms_subscription_plans
   set featured_listing_discount_pct = 0,
       has_trusted_seller_badge      = false,
       max_listing_duration_days     = 14,
       max_photos                    = 12,
       max_video_seconds             = 120,
       max_concurrent_active_listings= 5,
       auto_renew_listings           = false,
       direct_phone_visible          = false,
       bulk_import_enabled           = false,
       analytics_level               = 'basic',
       showroom_level                = 'standard'
 where slug = 'silver';

update public.cms_subscription_plans
   set featured_listing_discount_pct = 10,
       has_trusted_seller_badge      = true,
       max_listing_duration_days     = 21,
       max_photos                    = 16,
       max_video_seconds             = 150,
       max_concurrent_active_listings= 25,
       auto_renew_listings           = true,
       direct_phone_visible          = true,
       bulk_import_enabled           = false,
       analytics_level               = 'advanced',
       showroom_level                = 'custom'
 where slug = 'gold';

update public.cms_subscription_plans
   set featured_listing_discount_pct = 25,
       has_trusted_seller_badge      = true,
       has_homepage_placement        = true,
       has_custom_reports            = true,
       max_listing_duration_days     = 30,
       max_photos                    = 20,
       max_video_seconds             = 180,
       max_concurrent_active_listings= -1,
       auto_renew_listings           = true,
       direct_phone_visible          = true,
       bulk_import_enabled           = true,
       analytics_level               = 'advanced_export',
       showroom_level                = 'branded'
 where slug = 'diamond';

-- 4b) Defensive seed — re-asserts Silver / Gold / Diamond in case the
--     v1 INSERT was rolled back due to an earlier failed run of this
--     bundle. Idempotent (`on conflict do nothing`).
insert into public.cms_subscription_plans (
  slug, name_fr, name_ar, tagline_fr, tagline_ar,
  monthly_price, listings_per_month, search_priority_pct,
  has_custom_showroom, has_branded_showroom,
  has_advanced_analytics, has_analytics_export,
  support_level, features, badge_tone, position
) values
  ('silver',  'Silver',  'فضي',  'Pour démarrer',           'للبدء',           29,  5,  0,
   false, false, false, false,
   'email',
   '["5 mises en ligne / mois","Page boutique standard","Analytiques de base","Support par email"]'::jsonb,
   'silver', 10),
  ('gold',    'Gold',    'ذهبي', 'Le meilleur rapport',     'الأفضل قيمةً',    89,  25, 10,
   true,  false, true,  false,
   'chat',
   '["25 mises en ligne / mois","Page boutique personnalisée","Analytiques avancées","Priorité de recherche +10%","Support email + chat"]'::jsonb,
   'gold',   20),
  ('diamond', 'Diamond', 'ماسي', 'Pour les acteurs majeurs','للوكالات الكبرى', 249, -1, 25,
   true,  true,  true,  true,
   'dedicated',
   '["Mises en ligne illimitées","Page boutique brandée","Analytiques avancées + export","Priorité de recherche +25%","Chargé de compte dédié"]'::jsonb,
   'diamond', 30)
on conflict (slug) do nothing;

-- 5) New per-auction extra-fee settings (project doc §8.2.1 / §8.2.2 / §8.2.8).
insert into public.platform_settings (key, value, type, category, description, sensitive, requires_approval) values
  ('auction.featured_listing_fee',  '50'::jsonb,  'number', 'auction',
   'Frais pour faire apparaître une enchère sur la page d''accueil (par défaut 50 DT).',
   false, true),

  ('auction.top_of_search_fee',     '30'::jsonb,  'number', 'auction',
   'Frais pour bloquer une enchère en tête des résultats pendant 24h (par défaut 30 DT).',
   false, true),

  ('inspection.basic_fee',          '30'::jsonb,  'number', 'inspection',
   'Tarif du fournisseur pour une inspection technique basique (le client paie ce montant).',
   false, true),

  ('inspection.full_fee',           '80'::jsonb,  'number', 'inspection',
   'Tarif du fournisseur pour une inspection technique complète.',
   false, true),

  ('inspection.platform_share_pct', '0.5'::jsonb, 'number', 'inspection',
   'Part de Mazed sur le tarif d''inspection (0.5 = 50%).',
   true,  true),

  ('ownership_transfer.fee',        '100'::jsonb, 'number', 'auction',
   'Forfait pour le service de transfert de carte grise (Mazed le perçoit en entier).',
   false, true)
on conflict (key) do nothing;

-- 6) Recreate the user_active_subscription view without has_api_access.
--    Adds a few v2 columns so admin / profile UIs can read them directly.
--
--    "Active" here means "still entitled to the plan perks". A user who
--    cancels keeps the perks until current_period_end, so we include
--    cancelled rows whose expiry is still in the future. The status
--    field is exposed so callers can show "Annulé — expire le X" when
--    relevant.
drop view if exists public.user_active_subscription;
create view public.user_active_subscription as
select distinct on (us.user_id)
  us.user_id,
  us.id          as subscription_id,
  us.plan_slug,
  p.name_fr      as plan_name,
  p.listings_per_month,
  p.search_priority_pct,
  p.featured_listing_discount_pct,
  p.has_trusted_seller_badge,
  p.has_homepage_placement,
  p.has_branded_showroom,
  p.max_listing_duration_days,
  p.max_photos,
  p.max_video_seconds,
  p.max_concurrent_active_listings,
  p.analytics_level,
  p.showroom_level,
  p.support_level,
  us.status,
  us.current_period_start,
  us.current_period_end,
  us.listings_used_this_period,
  case
    when p.listings_per_month = -1 then 999999
    else greatest(0, p.listings_per_month - us.listings_used_this_period)
  end as listings_remaining,
  us.expires_at
from public.user_subscriptions us
join public.cms_subscription_plans p on p.slug = us.plan_slug
where us.status in ('active','cancelled')
  and (us.expires_at is null or us.expires_at > now())
order by us.user_id, us.started_at desc;

grant select on public.user_active_subscription to authenticated;
