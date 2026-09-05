-- ============================================================================
-- A dial, not a switch.
--
-- Placement today is `featured_rank`: either a listing is pinned to the cover
-- at position N, or it is ordered by `published_at` like everything else. There
-- is nothing in between — no way to say "push this one, but let it compete"
-- — and nothing decays, so a page curated once looks the same for ever.
--
--   boost        -100..100. Added to the ranking score (see lib/home/ranking).
--                0 is neutral. Positive lifts a listing across every surface —
--                cover, rails, catalogue — without pinning it anywhere.
--                Negative buries without unpublishing, which is what you want
--                for a listing that is technically fine but shows the product
--                badly.
--   boost_until  when it lapses on its own, so a promotion someone was paid
--                for cannot outlive the payment by forgetting about it.
--                NULL = no expiry.
-- ============================================================================

alter table public.listings
  add column if not exists boost       smallint not null default 0,
  add column if not exists boost_until timestamptz;

alter table public.listings
  drop constraint if exists listings_boost_range;
alter table public.listings
  add constraint listings_boost_range check (boost between -100 and 100);

-- Ranking reads the boosted rows first; the rest score without it.
create index if not exists listings_boost_idx
  on public.listings (boost desc)
  where status = 'published' and boost <> 0;

comment on column public.listings.boost is
  'Editorial weight, -100..100, added to the home/catalogue ranking score. Not a pin — see featured_rank for that.';
comment on column public.listings.boost_until is
  'When the boost stops counting. NULL never expires.';
