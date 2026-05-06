-- ============================================================
-- Mazed Auto — RESET SCRIPT
-- Wipes all user data, auctions, transactions, and uploaded media
-- but keeps the schema (tables, triggers, RLS policies, functions).
--
-- ⚠ DESTRUCTIVE — there is no undo. Run only when you genuinely want
-- to start fresh.
--
-- After running this:
--   • every user has to register again
--   • every seller has to redo KYC
--   • every auction is gone
--
-- Apply by pasting into the Supabase SQL editor or:
--   psql "$DATABASE_URL" -f reset.sql
-- ============================================================

begin;

-- 1) Public-schema data — order matters because of FK chains.
--    Delete leaves first, then trunks.
delete from public.bids;
delete from public.auto_bids;
delete from public.watchlist;
delete from public.notifications;
delete from public.reports;
delete from public.seller_ratings;
delete from public.transactions;
delete from public.auctions;
delete from public.sellers;

-- 2) Reset platform stats counters
update public.platform_stats
   set active_auctions  = 0,
       completed_deals  = 0,
       verified_sellers = 0,
       satisfaction     = 0
 where id = 1;

-- 3) Storage cleanup is handled separately — Supabase blocks direct DELETE
--    from storage.objects ("Direct deletion from storage tables is not
--    allowed. Use the Storage API instead."). Empty the bucket via the
--    Dashboard:
--
--    Storage → auction-media → ⋯ → Empty bucket
--
--    Or via the JS client (run once in a Node script with the service-role key):
--
--      const { data: files } = await supabase.storage
--        .from('auction-media')
--        .list('', { limit: 1000 });
--      await supabase.storage.from('auction-media')
--        .remove(files.map(f => f.name));
--
--    Orphaned files don't break anything — uploads use unique paths — but
--    cleaning up reclaims storage quota.

-- 4) Authentication — wipe every user account.
--    Cascade automatically removes related auth.identities, sessions,
--    refresh_tokens, and mfa_factors.
delete from auth.users;

commit;

-- 5) Sanity check — counts should all be zero.
select
  (select count(*) from public.sellers)        as sellers,
  (select count(*) from public.auctions)       as auctions,
  (select count(*) from public.bids)           as bids,
  (select count(*) from public.transactions)   as transactions,
  (select count(*) from public.notifications)  as notifications,
  (select count(*) from public.watchlist)      as watchlist,
  (select count(*) from public.seller_ratings) as ratings,
  (select count(*) from public.reports)        as reports,
  (select count(*) from public.auto_bids)      as auto_bids,
  (select count(*) from auth.users)            as auth_users;
-- (storage objects must be emptied via the Dashboard — see step 3 above)
