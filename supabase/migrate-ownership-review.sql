-- ============================================================
-- Mazed Auto — Golden-Lock ownership review
--
-- The seller wizard's step-4 has a "Golden Lock": the carte grise
-- owner name must match the KYC name. When it doesn't, the seller
-- picks an exception ("company"/"agent"/"inheritance"/"spouse"/
-- "recent_purchase"/"other"). The "other" branch is supposed to
-- queue for manual admin review, but today the flag never lands
-- on the auction row — admins can't see which auctions need a
-- closer look.
--
-- Two new columns + a partial index make those auctions trivially
-- queryable.
--
-- Safe to run repeatedly.
-- ============================================================

alter table public.auctions
  add column if not exists ownership_exception text,
  add column if not exists carte_grise_owner_name text;

create index if not exists auctions_ownership_review_idx
  on public.auctions (created_at desc)
  where ownership_exception is not null;
