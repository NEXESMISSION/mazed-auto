-- ============================================================================
-- ROLLBACK for v3 Phase 1 (migrations 0153-0156).
--
-- Safe to run at any point during Phase 1-2: the new model is additive, and
-- `properties` / `auctions` were never modified, so undoing this returns the
-- database to exactly the shape the current app reads.
--
-- ⚠ AFTER Phase 3 ships this is destructive: by then `listings` holds rows that
-- exist nowhere else (everything published through the new sell flow). From
-- that point on, roll forward with a fix instead — or dump `listings`,
-- `listing_photos`, `listing_fitments` and `contact_reveals` first.
--
--   node scripts/apply-migrations.mjs --commit ../rollback/0153_0156_listings_down
--   (or paste into the SQL editor)
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'expire_listings') then
    perform cron.unschedule('expire_listings');
  end if;
end $$;

drop function if exists public.expire_listings();

drop trigger if exists _listings_guard_publish on public.listings;
drop function if exists public._listings_guard_publish();

-- Children first (they carry the FKs).
drop table if exists public.contact_reveals;
drop table if exists public.listing_fitments;
drop table if exists public.listing_photos;
drop table if exists public.listings;

drop table if exists public.category_attributes;
drop table if exists public.categories;

drop type if exists public.listing_status;

notify pgrst, 'reload schema';
