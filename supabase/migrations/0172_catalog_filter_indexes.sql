-- ============================================================================
-- The catalogue filters were unindexed.
--
-- Measured on the live data through the running app: a plain catalogue render
-- is ~0.35–0.65 s, but "année ≥ 2020 and ≤ 80 000 km" is 1.37 s — every one of
-- those filters is a sequential scan over `listings`, decoding the attributes
-- jsonb of every published row to compare one key.
--
-- Each index below matches the EXPRESSION the query actually uses, or it will
-- not be used at all:
--   * `attributes -> 'year'` — the app compares jsonb to jsonb (`->`, not
--     `->>`) so the comparison stays numeric; the index must be on the same
--     expression.
--   * jsonb_path_ops GIN for the `@>` containment filters (fuel, boîte, make,
--     model), which is smaller and faster than the default jsonb_ops for the
--     containment-only queries we run.
--
-- All partial on `status = 'published'`: nothing else is ever filtered, and a
-- partial index is smaller and stays hot.
-- ============================================================================

create index if not exists listings_attributes_gin
  on public.listings using gin (attributes jsonb_path_ops)
  where status = 'published';

create index if not exists listings_year_idx
  on public.listings ((attributes -> 'year'))
  where status = 'published';

create index if not exists listings_mileage_idx
  on public.listings ((attributes -> 'mileage'))
  where status = 'published';

-- Price range + the default "newest first" ordering.
create index if not exists listings_price_idx
  on public.listings (price)
  where status = 'published';

create index if not exists listings_published_at_idx
  on public.listings (published_at desc)
  where status = 'published';

-- The free-text box does `search_text ilike '%…%'`, which no B-tree can serve.
-- pg_trgm can. If the extension is unavailable the rest of this migration must
-- still apply, so it is guarded.
do $$
begin
  create extension if not exists pg_trgm;
  create index if not exists listings_search_trgm
    on public.listings using gin (search_text gin_trgm_ops)
    where status = 'published';
exception when others then
  raise notice 'pg_trgm unavailable — free-text search stays sequential: %', sqlerrm;
end $$;

analyze public.listings;
