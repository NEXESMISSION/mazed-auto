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
--   - Admins (public.is_admin()) can read any row.
--
-- Public statuses = anything that has passed admin moderation, i.e.
--   active, ending, ended, reserve_not_met, pending_seller_decision,
--   re_offered.
-- Hidden statuses = pending_review (awaiting admin), scheduled (not
-- live yet — admin grants this state manually), cancelled (rejected).
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
      're_offered'
    )
    or seller_id = auth.uid()
    or public.is_admin()
  );
