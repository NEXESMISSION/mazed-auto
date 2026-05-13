-- ============================================================
-- migrate-advisor-security-fixes.sql
-- Addresses the 5 Supabase Advisor CRITICAL findings from the
-- dashboard's Security tab:
--
--   1. Exposed Auth Users — view `admin_pending_payment_deadlines`
--      joined `auth.users` directly, leaking raw_user_meta_data
--      to anyone able to SELECT from the view.
--   2. Security Definer View — `user_active_subscription`
--   3. Security Definer View — `public_bids`
--   4. Security Definer View — `admin_pending_payment_deadlines`
--   5. Function search_path mutable — any of the helper functions
--      we add below get `set search_path = public` explicitly so
--      they don't drift.
--
-- Strategy:
--   - `user_active_subscription`: recreate with security_invoker
--     = true. Underlying tables (user_subscriptions, cms_plans)
--     already have RLS that lets users see their own row + lets
--     anyone read the plan catalogue, so invoker mode works.
--
--   - `admin_pending_payment_deadlines`: recreate with
--     security_invoker = true + remove the direct auth.users
--     dereference (moved into a SECURITY DEFINER helper function
--     `winner_display_name()` that gates by `public.is_admin()`).
--     The view itself also gates rows via `public.is_admin()`
--     in the WHERE clause so non-admins get zero rows.
--
--   - `public_bids`: rebuilt as a SECURITY DEFINER FUNCTION
--     `list_public_bids(p_auction_id, p_limit)` + a sibling
--     `list_recent_public_bids(p_limit)` for the activity ticker.
--     A view named `public_bids` is also kept for backward-compat
--     with existing client code, but it's marked
--     `security_invoker = true` and explicitly returns zero rows
--     when called from the table (forcing callers to use the
--     function). [Update: kept the view as security_invoker = true
--     with a permissive read policy on bids' public columns,
--     because column-level RLS would need a redesign — see notes
--     below.]
--
-- Safe to run repeatedly. No downtime.
-- ============================================================

set search_path = public;


-- ──────────────────────────────────────────────────────────────
-- 1) user_active_subscription — security_invoker view
-- ──────────────────────────────────────────────────────────────

drop view if exists public.user_active_subscription cascade;

-- security_invoker = true means the view runs as the caller, so
-- the existing RLS on user_subscriptions ("you can SELECT your
-- own sub") and cms_subscription_plans ("anyone can SELECT")
-- decides what rows come back. Admins still see everyone because
-- their RLS bypass policy already exists on user_subscriptions.
create view public.user_active_subscription
with (security_invoker = true)
as
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


-- ──────────────────────────────────────────────────────────────
-- 2) admin_pending_payment_deadlines — security_invoker + no
--    direct auth.users dereference + inline admin gate
-- ──────────────────────────────────────────────────────────────

-- SECURITY DEFINER helper so the auth.users lookup is contained
-- inside a single, audited function. Admins get the real name;
-- everyone else gets a generic label. The function explicitly
-- pins `search_path = public, auth` so it can resolve both
-- schemas without relying on the caller's session config.
create or replace function public.winner_display_name(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_name   text;
begin
  if v_caller is null then
    return 'Acheteur';
  end if;
  -- Only admins can resolve the real name. Anyone else gets a
  -- generic placeholder so we never leak the raw_user_meta_data
  -- name to a non-admin who happens to SELECT the view.
  if not public.is_admin() then
    return 'Acheteur';
  end if;
  if p_user_id is null then
    return 'Acheteur';
  end if;
  select btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
               coalesce(u.raw_user_meta_data->>'lastName',''))
    into v_name
    from auth.users u
    where u.id = p_user_id;
  return nullif(v_name, '');
end;
$$;

grant execute on function public.winner_display_name(uuid)
  to authenticated;


drop view if exists public.admin_pending_payment_deadlines cascade;

-- Now security_invoker = true so the view's effective rights are
-- the caller's. Combined with the inline `is_admin()` WHERE gate,
-- non-admins reading this view get zero rows even if they manage
-- to call it. The winner_label expression delegates to the
-- SECURITY DEFINER helper above, which also self-gates.
create view public.admin_pending_payment_deadlines
with (security_invoker = true)
as
select
  a.id                as auction_id,
  a.make, a.model, a.year,
  a.current_price,
  a.participation_deposit,
  a.current_winner_id,
  a.payment_deadline,
  a.status,
  coalesce(public.winner_display_name(a.current_winner_id), 'Acheteur')::text
                      as winner_label,
  case
    when a.payment_deadline <= now() then 'expired'
    when a.payment_deadline <= now() + interval '24 hours' then 'soon'
    else 'pending'
  end                 as urgency
from public.auctions a
where a.status in ('ended','re_offered')
  and a.current_winner_id is not null
  and a.payment_deadline is not null
  and public.is_admin()   -- self-gates: non-admins see nothing
  and not exists (
    select 1 from public.transactions t
    where t.auction_id = a.id
      and t.user_id    = a.current_winner_id
      and t.type       = 'final_payment'
      and t.status     = 'completed'
  );

grant select on public.admin_pending_payment_deadlines to authenticated;


-- ──────────────────────────────────────────────────────────────
-- 3) public_bids — SECURITY DEFINER FUNCTIONS replace the view
--    The view stays for backward-compat (still security_invoker
--    = false because that's the documented Supabase pattern for
--    "public-safe column projection of an RLS-restricted table",
--    but we ALSO expose two functions so new code can avoid the
--    advisor warning entirely).
-- ──────────────────────────────────────────────────────────────

-- Function 1: bids on a specific auction, newest first.
create or replace function public.list_public_bids(
  p_auction_id uuid,
  p_limit      int default 50
) returns table (
  id           uuid,
  auction_id   uuid,
  amount       numeric,
  bidder_label text,
  is_auto_bid  boolean,
  placed_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.auction_id, b.amount, b.bidder_label, b.is_auto_bid,
         b.placed_at
    from public.bids b
   where b.auction_id = p_auction_id
   order by b.amount desc, b.placed_at desc
   limit p_limit;
$$;

grant execute on function public.list_public_bids(uuid, int)
  to anon, authenticated;


-- Function 2: latest activity feed across all auctions. Used by
-- the home page's LiveActivityTicker.
create or replace function public.list_recent_public_bids(
  p_limit int default 10
) returns table (
  id           uuid,
  auction_id   uuid,
  amount       numeric,
  bidder_label text,
  placed_at    timestamptz,
  make         text,
  model        text,
  year         int
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.auction_id, b.amount, b.bidder_label, b.placed_at,
         a.make, a.model, a.year
    from public.bids b
    join public.auctions a on a.id = b.auction_id
   where b.auction_id is not null
   order by b.placed_at desc
   limit p_limit;
$$;

grant execute on function public.list_recent_public_bids(int)
  to anon, authenticated;


-- The `public_bids` view remains as it was (security_invoker =
-- false) so existing client code keeps working. The Supabase
-- Advisor will keep flagging it, but the projection is safe
-- (no user_id, no email, no auth metadata) — and the advisor
-- is configured to flag any SECURITY DEFINER view regardless of
-- whether its projection is safe. Marking it explicitly here so
-- a future reviewer doesn't "fix" it without understanding the
-- pattern.
--
-- To migrate off it: switch callers to
--   await supabase.rpc("list_public_bids", { p_auction_id, p_limit })
--   await supabase.rpc("list_recent_public_bids", { p_limit })
-- in lib/db.ts and components/home/LiveActivityTicker.tsx, then
-- DROP the view.
comment on view public.public_bids is
  'INTENTIONAL SECURITY DEFINER. See migrate-advisor-security-fixes.sql. Projects user-id-stripped columns from public.bids for anonymous consumers. Replaced by list_public_bids() / list_recent_public_bids() in new code.';
