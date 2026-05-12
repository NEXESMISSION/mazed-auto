-- ============================================================
-- Round 25 — additional foreign-key indexes
-- ============================================================
--
-- migrate-perf-indexes.sql (round 13) covered the highest-traffic FK
-- columns: bids(user_id), bids(auction_id), watchlist(user_id),
-- auctions(seller_id), auctions(status,end_time), auctions(category),
-- auctions(created_at), transactions(status,user_id).
--
-- The round-24 audit caught five more FK columns hit by hot queries
-- that still do full table scans. Each is justified below.
--
-- All `create index if not exists` so re-running is safe.

-- ─── notifications(user_id) ───────────────────────────────────────────
-- Every notifications-page render lists `where user_id = me order by
-- created_at desc limit N`. Without this, postgres seqscans the entire
-- notifications table (which grows linearly with platform activity)
-- and filters. With the index, planner picks an index scan; on a 100k-row
-- table the difference is ~5 ms vs ~250 ms. Sort key included so a
-- single index satisfies the `order by created_at desc` as well.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- ─── notifications(user_id, is_read) ──────────────────────────────────
-- The header bell unread badge runs `select count where user_id = me
-- and is_read = false`. Adding a partial index keyed by user_id only
-- for the unread subset keeps the badge query at constant-time even
-- when a user has 50k+ read notifications archived.
create index if not exists notifications_unread_idx
  on public.notifications (user_id)
  where is_read = false;

-- ─── transactions(user_id) + (auction_id) ─────────────────────────────
-- The buyer dashboard ("my deposits", "my payments") and the admin
-- transaction list both scope by user_id. The auction detail page's
-- "show me transactions for this auction" admin view scopes by
-- auction_id. Both are hot enough to warrant their own index.
create index if not exists transactions_user_idx
  on public.transactions (user_id, created_at desc);

create index if not exists transactions_auction_idx
  on public.transactions (auction_id)
  where auction_id is not null;

-- ─── messages(conversation_id) ────────────────────────────────────────
-- The chat thread renders by `where conversation_id = X order by
-- created_at asc`. With thousands of platform conversations, the
-- seqscan-then-filter is wasted IO on every thread open.
create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at asc);

-- ─── kyc_submissions(user_id) + status ────────────────────────────────
-- The admin KYC queue filters by status = 'pending'; the user-side
-- status page filters by user_id = me. Compound index covers both
-- (status as leading column matters less since the queue typically
-- pulls ~10-100 rows whereas user lookups are exact).
create index if not exists kyc_submissions_user_idx
  on public.kyc_submissions (user_id, submitted_at desc);

create index if not exists kyc_submissions_status_idx
  on public.kyc_submissions (status)
  where status = 'pending';
