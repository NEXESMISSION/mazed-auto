-- ============================================================
-- Mazed Auto — close all the silent-RLS-write gaps
-- Safe to run repeatedly.
-- ============================================================

-- 1) Helper: am I an admin? Reads role from JWT user_metadata.
create or replace function public.is_admin() returns boolean
language sql stable security definer as $$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- 2) seller_ratings: was missing INSERT policy → RateSellerButton failed
--    silently. The require_purchase_before_rating trigger is the actual gate.
drop policy if exists "ratings_insert_authed" on public.seller_ratings;
create policy "ratings_insert_authed" on public.seller_ratings
  for insert to authenticated
  with check (auth.uid() is not null);

-- 3) transactions: add an INSERT policy for the user's own row, so the
--    /api/payment/record route is no longer the only way in. (The API is
--    still preferred for buy-now-style atomic actions, but this lets
--    realtime UI show pending transactions immediately if needed.)
drop policy if exists "tx_owner_insert" on public.transactions;
create policy "tx_owner_insert" on public.transactions
  for insert to authenticated
  with check (auth.uid() = user_id);

-- 4) reports: admins must be able to UPDATE the status (resolve/dismiss).
--    The previous policy only covered INSERT.
drop policy if exists "reports_admin_update" on public.reports;
create policy "reports_admin_update" on public.reports
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 5) sellers: admin needs UPDATE access (KYC approve, trust-score bumps, etc.).
--    The owner policy stays for users editing their own profile.
drop policy if exists "sellers_admin_update" on public.sellers;
create policy "sellers_admin_update" on public.sellers
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 6) auctions: admin needs to be able to cancel / change status from the
--    admin-queue. The owner policy stays for sellers editing their own.
drop policy if exists "auctions_admin_update" on public.auctions;
create policy "auctions_admin_update" on public.auctions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 7) bids: defensive — admins shouldn't post bids, but they may need to
--    delete a fraudulent bid. (Read-only is already covered.)
drop policy if exists "bids_admin_delete" on public.bids;
create policy "bids_admin_delete" on public.bids
  for delete to authenticated
  using (public.is_admin());
