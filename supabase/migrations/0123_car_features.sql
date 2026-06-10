-- ============================================================================
-- Mazed Auto — convert land-only features to car equivalents.
--   1. Inspectors: allow car specialities (drop the real-estate-only CHECK;
--      speciality becomes free text — the UI offers mechanic/diagnostic/…).
--   2. Legal docs: replace the property doc catalog (titre foncier, permis…)
--      with car documents (carte grise, quitus, visite technique, assurance)
--      for every vehicle body category.
-- ============================================================================

alter table public.inspectors drop constraint if exists inspectors_speciality_check;

delete from public.legal_doc_kinds
 where property_type in ('apartment','house','villa','land','commercial','office','warehouse','farm');

insert into public.legal_doc_kinds (property_type, label, description, required, sort_order)
select c.t::public.property_type, d.label, d.description, d.required, d.sort_order
from (values ('sedan'),('suv'),('hatchback'),('pickup'),('van'),('coupe'),('convertible'),('wagon')) as c(t)
cross join (values
  ('Carte grise',             'Certificat d''immatriculation au nom du vendeur.',          true,  10),
  ('Quitus fiscal',           'Quitus / non-gage (et quitus douanier si importée).',       true,  20),
  ('Visite technique',        'Procès-verbal de la visite technique en cours de validité.', false, 30),
  ('Attestation d''assurance', 'Assurance en cours de validité (optionnel).',              false, 40)
) as d(label, description, required, sort_order)
on conflict (property_type, label) do nothing;
