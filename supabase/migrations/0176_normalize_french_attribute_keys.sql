-- ============================================================================
-- Eight annonces were invisible to every filter.
--
-- `listings.attributes` is keyed by `category_attributes.field_key`, and the
-- catalogue, the card and the detail page all read the canonical English keys:
-- `year`, `mileage`, `fuel`, `transmission`. One seed pass wrote FRENCH keys
-- instead — `annee`, `kilometrage`, `carburant`, `boite` — and nothing ever
-- noticed, because a missing attribute is not an error. It is a blank.
--
-- Measured before writing this:
--
--   published listings with canonical keys ......... 64
--   published listings with French keys ONLY ........ 8
--   published listings with both .................... 0
--
-- Those 8 are real, published, photographed annonces — a Mercedes Actros, a
-- Kangoo, a Fiat Tipo, a Picanto, a SYM scooter and three more. A buyer
-- filtering "Diesel" or "moins de 100 000 km" never saw any of them, and their
-- cards showed no year, no mileage and no fuel. Not a crash; just eight cars
-- quietly excluded from the catalogue they were published into.
--
-- WHY A MIGRATION AND NOT A READ-TIME FALLBACK. A fallback that accepts either
-- spelling would have to live in the card, the catalogue filter, the detail
-- page, the admin queue and the search — five places, forever, and a sixth the
-- next time someone adds a surface. One key per concept is the invariant worth
-- keeping; this restores it.
--
-- The values are translated too, not only the keys: `carburant: "essence"` has
-- to become `fuel: "gasoline"` or the filter still misses it, since the option
-- lists in `lib/vehicles.ts` are English-valued.
-- ============================================================================

update public.listings l
   set attributes =
         -- Drop the French keys, then add the canonical ones back with
         -- translated values. `||` is a shallow merge, so an existing canonical
         -- key would win — but there are none (measured: 0 rows have both), and
         -- if that ever changes the existing value is the right one to keep.
         (attributes - 'annee' - 'kilometrage' - 'carburant' - 'boite')
         || case when attributes ? 'annee'
                 then jsonb_build_object('year', attributes -> 'annee')
                 else '{}'::jsonb end
         || case when attributes ? 'kilometrage'
                 then jsonb_build_object('mileage', attributes -> 'kilometrage')
                 else '{}'::jsonb end
         || case when attributes ? 'carburant'
                 then jsonb_build_object('fuel',
                        case lower(attributes ->> 'carburant')
                          when 'essence'     then 'gasoline'
                          when 'diesel'      then 'diesel'
                          when 'hybride'     then 'hybrid'
                          when 'électrique'  then 'electric'
                          when 'electrique'  then 'electric'
                          when 'gpl'         then 'lpg'
                          -- An unmapped value is carried through rather than
                          -- guessed at. It will show as itself on the card,
                          -- which is visible and fixable; a wrong guess is
                          -- neither.
                          else attributes ->> 'carburant'
                        end)
                 else '{}'::jsonb end
         || case when attributes ? 'boite'
                 then jsonb_build_object('transmission',
                        case lower(attributes ->> 'boite')
                          when 'manuelle'    then 'manual'
                          when 'automatique' then 'automatic'
                          else attributes ->> 'boite'
                        end)
                 else '{}'::jsonb end
 where attributes ?| array['annee', 'kilometrage', 'carburant', 'boite'];

-- ── Guard: stop the next seed from reintroducing them ───────────────────────
-- A comment would not have caught this one. A constraint does, at write time,
-- with the key name in the error.
alter table public.listings
  drop constraint if exists listings_attributes_canonical_keys;
alter table public.listings
  add constraint listings_attributes_canonical_keys
  check (not (attributes ?| array['annee', 'kilometrage', 'carburant', 'boite']))
  not valid;

-- `not valid` then `validate` rather than a plain add: validation reports which
-- rows fail instead of refusing the whole statement with no detail. By this
-- point the update above has fixed them all, so it passes.
alter table public.listings
  validate constraint listings_attributes_canonical_keys;

comment on constraint listings_attributes_canonical_keys on public.listings is
  'attributes is keyed by category_attributes.field_key, which is English. A seed once wrote annee/kilometrage/carburant/boite and hid 8 published listings from every filter.';

notify pgrst, 'reload schema';
