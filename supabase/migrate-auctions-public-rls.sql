-- ============================================================
-- Mazed Auto — hide pre-approval auctions from the public
--
-- The original SELECT policy on public.auctions used `using (true)`,
-- which let anyone (including anon) read pending_review / scheduled /
-- cancelled rows. That defeats the entire moderation queue — sellers
-- could share their pending-listing URL and buyers would see it.
--
-- New policy:
--   - Auctions in PUBLIC_STATUSES are readable by everyone (anon + auth).
--   - The owning seller can always read their own row in any status.
--   - Bidders can read any auction they've placed a bid on (so a
--     cancelled-after-bids auction still appears in /buyer/bids).
--   - Admins (public.is_admin()) can read any row.
--
-- Public statuses = anything that has passed admin moderation + the
-- "cancelled" status (so a buyer who bid on a now-cancelled auction
-- can still see it). Hidden statuses = pending_review (awaiting first
-- admin review), scheduled (admin-only pre-launch).
--
-- Safe to run repeatedly.
-- ============================================================

drop policy if exists "auctions_public_read" on public.auctions;

create policy "auctions_public_read" on public.auctions
  for select
  using (
    status in (
      'active',
      'ending',
      'ended',
      'reserve_not_met',
      'pending_seller_decision',
      're_offered',
      'cancelled'
    )
    or seller_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.bids b
      where b.auction_id = id
        and b.user_id = auth.uid()
    )
  );
