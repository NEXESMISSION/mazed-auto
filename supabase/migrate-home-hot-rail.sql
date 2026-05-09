-- ============================================================
-- Mazed Auto — "Hot right now" rail
--
-- Live auctions ranked by how many bids they collected in the last
-- 60 minutes. The home page reads this view and shows the top N to
-- create the strongest FOMO signal: "people are bidding RIGHT NOW".
--
-- Live = status in (active, ending) AND end_time still in the future.
-- The view is a plain SELECT against existing tables (no materialised
-- caching), so it's always up to date and free to run hundreds of times
-- a minute. The composite index that already covers (auction_id,
-- placed_at desc) on bids keeps the join cheap.
--
-- Safe to run repeatedly.
-- ============================================================

create or replace view public.auction_hot_now as
with recent as (
  select
    auction_id,
    count(*)::int as recent_bids,
    count(distinct coalesce(user_id::text, bidder_label))::int as recent_bidders
  from public.bids
  where placed_at >= now() - interval '1 hour'
  group by auction_id
)
select
  a.id,
  coalesce(r.recent_bids, 0)    as recent_bids,
  coalesce(r.recent_bidders, 0) as recent_bidders
from public.auctions a
left join recent r on r.auction_id = a.id
where a.status in ('active', 'ending')
  and a.end_time > now();

-- Make the view callable by the same roles that read auctions.
grant select on public.auction_hot_now to anon, authenticated;
