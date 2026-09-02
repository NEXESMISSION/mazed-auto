-- ============================================================================
-- v3 PHASE 1 (3/4) — move the existing catalog into `listings`.
--
-- 62 properties, all `status='ready'`, all `listing_type='auction'`. They are
-- copied, not moved: `properties` stays untouched until Phase 6, so every
-- screen that still reads it keeps working while the new model is built.
--
-- MAPPING DECISIONS, and why:
--
--   price          The lots are auctions, so there is no asking price. We take
--                  the last known number — current_price, else opening_price —
--                  because a catalog entry with no price is unusable, and the
--                  seller will correct it when they next edit. `negotiable` is
--                  set true on every backfilled row for the same reason: the
--                  number is indicative, and saying so is honest.
--
--   contact_phone  From the seller's profile. A listing with no number cannot
--                  be published in v3 (0154 enforces it), so a seller with no
--                  phone lands in 'draft' instead of 'published' — they finish
--                  it themselves rather than us inventing a contact.
--
--   category       By body type: sedan → Voitures, van/pickup → Utilitaires,
--                  everything else → Voitures. Real-estate leftovers (there are
--                  none today) would go to Voitures too and be re-categorised
--                  by hand; the query below reports anything it had to guess.
--
--   expires_at     published_at + 30 days (D2). Backfilled rows get 30 days
--                  from NOW, not from their original creation date, so nothing
--                  silently expires the moment this runs.
--
-- Idempotent: re-running copies nothing twice (keyed on the source id kept in
-- attributes->>'_migrated_from').
-- ============================================================================

insert into public.listings (
  seller_id, category_id, title, description,
  price, negotiable, price_on_request, condition,
  governorate, address, lat, lng,
  attributes,
  contact_name, contact_phone, contact_whatsapp, show_phone,
  status, published_at, expires_at,
  seller_attestation_version, seller_attestation_at,
  created_at
)
select
  p.owner_id,
  cat.id,
  p.title,
  p.description,
  coalesce(a.current_price, a.opening_price, p.sale_price),
  true,                                    -- see note above
  false,
  'used',
  p.governorate,
  p.address,
  p.lat,
  p.lng,
  coalesce(p.attributes, '{}'::jsonb)
    || jsonb_build_object('_migrated_from', p.id::text, '_migrated_at', now()),
  pr.full_name,
  pr.phone,
  pr.phone,                                -- same number until the seller says otherwise
  true,
  -- No phone → cannot be published (0154 CHECK). Park it in draft.
  case when pr.phone is null then 'draft'::public.listing_status
       else 'published'::public.listing_status end,
  case when pr.phone is null then null else now() end,
  case when pr.phone is null then null else now() + interval '30 days' end,
  p.seller_attestation_version,
  p.seller_attestation_at,
  p.created_at
from public.properties p
join public.profiles pr on pr.id = p.owner_id
left join lateral (
  select a2.current_price, a2.opening_price
    from public.auctions a2
   where a2.property_id = p.id
   order by a2.created_at desc
   limit 1
) a on true
join public.categories cat
  on cat.slug = case
       when p.type in ('van', 'pickup') then 'utilitaires'
       else 'voitures'
     end
where p.status = 'ready'
  and not exists (
    select 1 from public.listings l
     where l.attributes->>'_migrated_from' = p.id::text
  );

-- Photos follow their listing.
insert into public.listing_photos (listing_id, storage_path, caption, sort_order)
select l.id, ph.storage_path, ph.caption, ph.sort_order
  from public.property_photos ph
  join public.listings l on l.attributes->>'_migrated_from' = ph.property_id::text
 where not exists (
   select 1 from public.listing_photos lp
    where lp.listing_id = l.id and lp.storage_path = ph.storage_path
 );

notify pgrst, 'reload schema';
