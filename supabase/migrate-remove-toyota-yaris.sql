-- ============================================================
-- One-off cleanup: remove the seeded Toyota Yaris 2020.
-- Requested by the product owner; the listing was confusing on the
-- live home page (new-seller alert popping on a clearly seeded row).
-- Idempotent — safe to run multiple times.
-- ============================================================

-- Wipe child rows first so the FK constraints don't reject the
-- delete on the auctions row. Each table is keyed by auction_id.
delete from public.bids
  where auction_id = 'aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa';

delete from public.auto_bids
  where auction_id = 'aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa';

delete from public.watchlist
  where auction_id = 'aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa';

delete from public.transactions
  where auction_id = 'aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa';

delete from public.notifications
  where auction_id = 'aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa';

delete from public.messages
  where conversation_id in (
    select id from public.conversations
    where auction_id = 'aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa'
  );

delete from public.conversations
  where auction_id = 'aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa';

-- Finally drop the auction itself.
delete from public.auctions
  where id = 'aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa';
