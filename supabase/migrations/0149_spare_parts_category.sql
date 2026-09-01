-- ============================================================================
-- Pièces de rechange — a second kind of listing on the same engine.
--
-- A spare part is not a car: it has no mileage, no carte grise, no bidding
-- war. Sellers post one for FREE and it sells at a fixed price to the first
-- buyer. Everything else (photos, review queue, KYC, direct-sale checkout)
-- is already built, so the part reuses it:
--
--   * `property_type` gains 'spare_part' — same enum every RLS policy,
--     RPC and index already keys off, so nothing downstream changes.
--   * A CHECK-style trigger pins spare parts to listing_type='direct'.
--     Auctioning a used alternator is not a product we offer, and the
--     guard belongs in the DB so a hand-written insert can't bypass the
--     form's rule.
--
-- The fee waiver lives in the app (fee settings are admin-tunable per
-- listing kind); the DB only enforces the shape.
--
-- NOTE: `alter type ... add value` cannot be used in the same transaction
-- that adds it, so the trigger below references the label as text only.
-- ============================================================================

alter type property_type add value if not exists 'spare_part';

-- ── spare parts are direct-sale only ────────────────────────────────────────
create or replace function public._enforce_spare_part_direct()
returns trigger
language plpgsql
as $$
begin
  if new.type::text = 'spare_part' then
    -- Normalise rather than reject: a NULL listing_type on a spare part is a
    -- form that forgot to send it, and the answer is always 'direct'.
    if new.listing_type is null or new.listing_type::text <> 'direct' then
      new.listing_type := 'direct';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists _spare_part_direct_only on public.properties;
create trigger _spare_part_direct_only
  before insert or update of type, listing_type on public.properties
  for each row execute function public._enforce_spare_part_direct();

notify pgrst, 'reload schema';
