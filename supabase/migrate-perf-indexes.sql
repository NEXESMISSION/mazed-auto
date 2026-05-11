-- ============================================================
-- Mazed Auto — Performance indexes for hot read paths
--
-- Audit finding #18 — several query patterns scan tables instead of
-- using indexes. Each `create index if not exists` is idempotent so
-- this migration is safe to re-run.
--
-- The pre-existing indexes cover most surfaces; this file fills the
-- gaps identified by the deep audit. Specifically:
--   - bids.user_id          → /buyer/bids
--   - bids(auction_id, placed_at desc) → bid history per auction
--   - watchlist.user_id     → /buyer/bids watchlist tab
--   - auctions.seller_id    → /seller/auctions
--   - auctions(status, end_time) → catalog filter + sweep job
--   - auctions.category     → browse filtering
--   - auctions(created_at desc) → "newest" sort
-- ============================================================

-- bids ----------------------------------------------------------------------
create index if not exists bids_user_idx
  on public.bids (user_id, placed_at desc);

create index if not exists bids_auction_placed_idx
  on public.bids (auction_id, placed_at desc);


-- watchlist -----------------------------------------------------------------
create index if not exists watchlist_user_idx
  on public.watchlist (user_id);


-- auctions ------------------------------------------------------------------
create index if not exists auctions_seller_idx
  on public.auctions (seller_id, created_at desc);

-- Composite for the catalog filter (status='active' / 'ending' ordered
-- by end_time) and for the end_expired_auctions() sweep
-- (`status in ('active','ending') and end_time < now()`).
create index if not exists auctions_status_end_idx
  on public.auctions (status, end_time);

create index if not exists auctions_category_idx
  on public.auctions (category)
  where status in ('active', 'ending');

-- Newest-first sort on the home / catalog rails.
create index if not exists auctions_created_idx
  on public.auctions (created_at desc);


-- transactions --------------------------------------------------------------
-- Existing tx_user_idx covers (user_id, created_at). Add a composite for
-- the failed-transactions admin queue which filters status THEN user.
create index if not exists tx_status_user_idx
  on public.transactions (status, user_id);


-- Diagnostic ----------------------------------------------------------------
do $$
declare
  n int;
begin
  select count(*) into n from pg_indexes
   where schemaname = 'public'
     and indexname in (
       'bids_user_idx',
       'bids_auction_placed_idx',
       'watchlist_user_idx',
       'auctions_seller_idx',
       'auctions_status_end_idx',
       'auctions_category_idx',
       'auctions_created_idx',
       'tx_status_user_idx'
     );
  raise notice 'perf indexes present: % / 8', n;
end $$;
