-- ============================================================================
-- Mazed Auto — replace the real-estate characteristics catalog with car specs.
--
-- property_attribute_kinds drives the sell-form fields + /admin/characteristics
-- per listing type. We drop the real-estate rows (apartment/villa/land/…) and
-- seed the same car spec set for every vehicle body category, so a seller
-- listing any car fills in make/model/year/mileage/fuel/transmission/color/
-- condition. (Existing listings keep their attributes JSONB untouched.)
-- ============================================================================

delete from public.property_attribute_kinds
 where property_type in ('apartment','house','villa','land','commercial','office','warehouse','farm');

insert into public.property_attribute_kinds
  (property_type, field_key, label, data_type, options, unit, required, sort_order)
select c.t::public.property_type, f.field_key, f.label, f.data_type, f.options, f.unit, f.required, f.sort_order
from (values ('sedan'),('suv'),('hatchback'),('pickup'),('van'),('coupe'),('convertible'),('wagon')) as c(t)
cross join (values
  ('make',        'Marque',      'text',   null::jsonb, null::text, true,  10),
  ('model',       'Modèle',      'text',   null::jsonb, null::text, true,  20),
  ('year',        'Année',       'number', null::jsonb, null::text, true,  30),
  ('mileage',     'Kilométrage', 'number', null::jsonb, 'km'::text, true,  40),
  ('fuel',        'Carburant',   'select',
     '[{"value":"gasoline","label":"Essence"},{"value":"diesel","label":"Diesel"},{"value":"hybrid","label":"Hybride"},{"value":"electric","label":"Électrique"}]'::jsonb,
     null::text, true, 50),
  ('transmission','Boîte',       'select',
     '[{"value":"manual","label":"Manuelle"},{"value":"automatic","label":"Automatique"}]'::jsonb,
     null::text, true, 60),
  ('color',       'Couleur',     'text',   null::jsonb, null::text, false, 70),
  ('condition',   'État',        'select',
     '[{"value":"new","label":"Neuf"},{"value":"excellent","label":"Excellent"},{"value":"good","label":"Bon"},{"value":"fair","label":"Correct"},{"value":"damaged","label":"Accidenté"}]'::jsonb,
     null::text, false, 80)
) as f(field_key, label, data_type, options, unit, required, sort_order)
on conflict (property_type, field_key) do update set
  label = excluded.label, data_type = excluded.data_type, options = excluded.options,
  unit = excluded.unit, required = excluded.required, sort_order = excluded.sort_order;
