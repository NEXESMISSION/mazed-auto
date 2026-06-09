-- ============================================================================
-- Mazed Auto — car re-skin, step 1: extend the listing-type enum.
--
-- The platform was built for real-estate (property_type = apartment, villa,
-- land, …). For the car marketplace we reuse the same generic auction engine
-- but the listing item is a vehicle, categorised by body type. We ADD the
-- vehicle categories to the existing `property_type` enum rather than
-- recreating it, so none of the 120 prior migrations / RPCs / RLS policies
-- that reference the enum need to change.
--
-- NOTE: `alter type ... add value` commits with this migration's transaction;
-- the new values can't be USED in the same transaction. Seeding + UI that use
-- them run separately (the car seeder + later migrations), so that's fine.
-- The legacy real-estate values stay in the enum (Postgres can't drop enum
-- values); they're simply never used by the car product.
-- ============================================================================

alter type property_type add value if not exists 'sedan';
alter type property_type add value if not exists 'suv';
alter type property_type add value if not exists 'hatchback';
alter type property_type add value if not exists 'pickup';
alter type property_type add value if not exists 'van';
alter type property_type add value if not exists 'coupe';
alter type property_type add value if not exists 'convertible';
alter type property_type add value if not exists 'wagon';
