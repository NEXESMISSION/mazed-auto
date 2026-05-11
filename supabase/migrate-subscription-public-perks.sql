-- ============================================================
-- Mazed Auto — expose plan perks for *other people's* listings
--
-- The `user_active_subscription` view is RLS-friendly (users only
-- see their own + admin), but the public listing pages need to know
-- whether *the seller* of an auction has e.g. a trusted-seller badge.
-- We add a small SECURITY DEFINER helper that returns just the
-- public-safe perks (no period dates, no payment refs).
--
-- Depends on: migrate-cms-plans-v2.sql
-- Safe to run repeatedly.
-- ============================================================

-- 1) Add direct_phone_visible to the view (it was missed in v2).
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
  p.direct_phone_visible,
  p.auto_renew_listings,
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

-- 2) Public read of a *single* seller's plan perks. Returns only the
--    fields that are safe to expose to anyone visiting the listing:
--    plan name, badge, search priority, phone visibility. No dates,
--    no usage counters, no payment info.

create or replace function public.seller_public_plan_perks(p_user_id uuid)
returns table (
  plan_slug              text,
  plan_name              text,
  badge_tone             text,
  has_trusted_seller_badge boolean,
  has_homepage_placement boolean,
  direct_phone_visible   boolean,
  search_priority_pct    int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    us.plan_slug,
    p.name_fr,
    p.badge_tone,
    coalesce(p.has_trusted_seller_badge, false),
    coalesce(p.has_homepage_placement, false),
    coalesce(p.direct_phone_visible, false),
    coalesce(p.search_priority_pct, 0)
  from public.user_subscriptions us
  join public.cms_subscription_plans p on p.slug = us.plan_slug
  where us.user_id = p_user_id
    and us.status in ('active','cancelled')
    and (us.expires_at is null or us.expires_at > now())
  order by us.started_at desc
  limit 1;
end; $$;

grant execute on function public.seller_public_plan_perks(uuid) to anon, authenticated;

-- 3) Batched version — feeds the /auctions listing ranking. Given an
--    array of seller_ids, returns the search_priority_pct per id
--    (default 0 if no plan). One round-trip instead of N.

create or replace function public.sellers_search_priority(p_user_ids uuid[])
returns table (
  user_id              uuid,
  search_priority_pct  int,
  has_homepage_placement boolean,
  has_trusted_seller_badge boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    sub.user_id,
    coalesce(max(p.search_priority_pct), 0)::int as search_priority_pct,
    bool_or(coalesce(p.has_homepage_placement, false)) as has_homepage_placement,
    bool_or(coalesce(p.has_trusted_seller_badge, false)) as has_trusted_seller_badge
  from unnest(p_user_ids) as sub(user_id)
  left join public.user_subscriptions us
    on us.user_id = sub.user_id
   and us.status in ('active','cancelled')
   and (us.expires_at is null or us.expires_at > now())
  left join public.cms_subscription_plans p on p.slug = us.plan_slug
  group by sub.user_id;
end; $$;

grant execute on function public.sellers_search_priority(uuid[]) to anon, authenticated;

-- 4) Reveal a seller's phone *only* when their plan grants
--    direct_phone_visible. Self-gates so the caller doesn't need to
--    do its own check; returns null otherwise.

create or replace function public.seller_public_phone(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_visible boolean;
  v_phone text;
begin
  select coalesce(p.direct_phone_visible, false)
    into v_visible
    from public.user_subscriptions us
    join public.cms_subscription_plans p on p.slug = us.plan_slug
   where us.user_id = p_user_id
     and us.status in ('active','cancelled')
     and (us.expires_at is null or us.expires_at > now())
   order by us.started_at desc limit 1;

  if not coalesce(v_visible, false) then return null; end if;

  select (raw_user_meta_data ->> 'phone')::text
    into v_phone
    from auth.users where id = p_user_id;

  return v_phone;
end; $$;

grant execute on function public.seller_public_phone(uuid) to anon, authenticated;

-- 5) Home-page placement: list live auctions belonging to sellers whose
--    active plan grants has_homepage_placement (Diamond by default).
--    The home page renders these as a "Vendeurs Pro" rail above the
--    standard newest/recommended rails.

create or replace function public.home_pinned_pro_auctions(p_limit int default 6)
returns table (
  auction_id     uuid,
  seller_id      uuid,
  plan_slug      text,
  plan_name      text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    a.id,
    a.seller_id,
    us.plan_slug,
    p.name_fr
  from public.auctions a
  join public.user_subscriptions us on us.user_id = a.seller_id
  join public.cms_subscription_plans p on p.slug = us.plan_slug
  where a.status in ('active', 'ending')
    and a.end_time > now()
    and us.status in ('active','cancelled')
    and (us.expires_at is null or us.expires_at > now())
    and p.has_homepage_placement = true
  order by a.created_at desc
  limit greatest(0, p_limit);
end; $$;

grant execute on function public.home_pinned_pro_auctions(int) to anon, authenticated;
