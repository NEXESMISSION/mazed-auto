-- ============================================================================
-- Saving a diagnostic on an annonce always failed with 500
-- `diagnostic_save_failed`.
--
-- The route upserts with ON CONFLICT (listing_id). The unique index backing
-- that column was PARTIAL:
--
--   create unique index vehicle_diagnostics_listing_uniq
--     on vehicle_diagnostics (listing_id) where listing_id is not null;
--
-- Postgres only matches a partial index to an ON CONFLICT clause when the
-- statement repeats the same predicate (`... on conflict (listing_id)
-- where listing_id is not null`). PostgREST emits a bare inference clause, so
-- the planner found nothing to match and raised
--
--   42P10 · there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- `property_id` carries a FULL unique index, which is why the v2 half of the
-- same route always worked and only annonces broke.
--
-- The predicate buys nothing here: in a unique index Postgres treats NULLs as
-- distinct, so a plain UNIQUE (listing_id) still allows every property-era row
-- to leave it null. Full index, and the upsert can infer it.
-- ============================================================================

drop index if exists public.vehicle_diagnostics_listing_uniq;

create unique index if not exists vehicle_diagnostics_listing_uniq
  on public.vehicle_diagnostics (listing_id);

-- The plain lookup index is now redundant — the unique one serves the same
-- lookups — and a second copy of the column only costs writes.
drop index if exists public.vehicle_diagnostics_listing_idx;
