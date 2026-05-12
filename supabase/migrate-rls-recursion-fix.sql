-- ============================================================
-- Mazed Auto — fix infinite recursion between auctions ↔ bids RLS
--
-- Both SELECT policies referenced each other across tables:
--   public.auctions  : exists(select 1 from public.bids   where user_id=auth.uid())
--   public.bids      : exists(select 1 from public.auctions where seller_id=auth.uid())
--
-- Postgres detected the cycle and raised:
--   "infinite recursion detected in policy for relation \"auctions\""
--
-- Fix: wrap each cross-table check in a SECURITY DEFINER helper. The
-- helpers run as the function owner, bypassing RLS on the inner table,
-- which breaks the cycle while preserving the same visibility rules.
-- ============================================================

create or replace function public.user_bid_on_auction(p_auction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bids
    where auction_id = p_auction_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.user_is_auction_seller(p_auction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.auctions
    where id = p_auction_id
      and seller_id = auth.uid()
  );
$$;

revoke all on function public.user_bid_on_auction(uuid)    from public;
revoke all on function public.user_is_auction_seller(uuid) from public;
grant execute on function public.user_bid_on_auction(uuid)    to authenticated, anon;
grant execute on function public.user_is_auction_seller(uuid) to authenticated, anon;

-- Rebuild auctions SELECT policy — no direct reference to bids.
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
    or public.user_bid_on_auction(id)
  );

-- Rebuild bids SELECT policy — no direct reference to auctions.
drop policy if exists "bids_owner_or_seller_or_admin_read" on public.bids;
create policy "bids_owner_or_seller_or_admin_read" on public.bids
  for select
  using (
    user_id = auth.uid()
    or public.is_admin()
    or public.user_is_auction_seller(auction_id)
  );
