-- ============================================================================
-- More to choose from: 5 vehicle categories and 10 part categories.
--
-- The catalogue offered five vehicle types and ten part families. That is
-- narrow enough that a seller with a scooter, a trailer or a tractor had to
-- file it under something it is not — « Motos » for a scooter, « Utilitaires »
-- for a caravan — and a buyer filtering for what they actually want never
-- finds it. Every mis-filed listing is a listing that cannot be searched for.
--
-- WHY THESE. Each one is a thing that is bought and sold separately in
-- Tunisia and that does not fit an existing row:
--
--   * Scooters are not Motos here — different buyers, different prices, and
--     the largest two-wheeler segment in the country.
--   * Bus & minibus and Tracteurs & agricole were both landing in « Engins »,
--     which is construction plant.
--   * Remorques & caravanes have no engine at all, so every vehicle question
--     the form asks about one is wrong.
--   * On the parts side: cooling, exhaust, clutch, glass, security, towing,
--     fluids, tooling, media and two-wheeler parts were all falling into
--     « Accessoires », which had quietly become the miscellaneous drawer.
--
-- FEES NEED NO ROWS. `resolveListingFee` resolves a category, then its parent.
-- Vehicles are covered by the `listing_single` product with a null category
-- (15 TND, applies to anything), and parts by the 0 TND `listing_single` sitting
-- on the « Pièces de rechange » PARENT — so every category added here inherits
-- the right price the moment it exists, and nothing has to be priced by hand.
--
-- Idempotent on `slug`, which is unique: re-running adds nothing.
-- ============================================================================

insert into public.categories (parent_id, slug, label_fr, kind, sort_order, is_active)
select p.id, v.slug, v.label_fr, 'vehicle', v.sort_order, true
  from public.categories p
  cross join (values
    ('scooters',            'Scooters',              60),
    ('bus-minibus',         'Bus & minibus',         70),
    ('remorques-caravanes', 'Remorques & caravanes', 80),
    ('quads-buggys',        'Quads & buggys',        90),
    ('tracteurs-agricole',  'Tracteurs & agricole', 100)
  ) as v(slug, label_fr, sort_order)
 where p.slug = 'vehicules'
   and p.parent_id is null
on conflict (slug) do nothing;

insert into public.categories (parent_id, slug, label_fr, kind, sort_order, is_active)
select p.id, v.slug, v.label_fr, 'part', v.sort_order, true
  from public.categories p
  cross join (values
    ('echappement',        'Échappement',                110),
    ('refroidissement',    'Refroidissement & clim',     120),
    ('embrayage',          'Embrayage',                  130),
    ('vitrage-retroviseurs','Vitrage & rétroviseurs',    140),
    ('multimedia',         'Multimédia & navigation',    150),
    ('pieces-moto',        'Pièces moto & scooter',      160),
    ('securite-antivol',   'Sécurité & antivol',         170),
    ('attelage',           'Attelage & remorquage',      180),
    ('huiles-liquides',    'Huiles & liquides',          190),
    ('outillage',          'Outillage & équipement',     200)
  ) as v(slug, label_fr, sort_order)
 where p.slug = 'pieces-rechange'
   and p.parent_id is null
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
