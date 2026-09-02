-- ============================================================================
-- SELLER ATTESTATION — the seller signs for the accuracy of their listing.
--
-- Every listing that goes to review now carries a sworn statement: the seller
-- certifies the information, photos and documents are exact and accepts sole
-- responsibility for anything false or misleading. Until now nothing on the
-- record said the seller had ever been told that, so a dispute over a rigged
-- odometer or a hidden accident came down to one word against another.
--
-- SPLIT IN TWO ON PURPOSE. This file adds only the COLUMNS, which are safe to
-- apply against any build: an older deploy simply never writes them. The
-- enforcement (server-stamped timestamp + "no listing enters review unsigned")
-- lives in 0151 and must be applied only once the build that fills the columns
-- is actually deployed — applying it under an older build would refuse every
-- new listing.
--
-- Existing listings are grandfathered as unsigned (null). They only need a
-- signature the next time they are submitted for review — which is what the
-- edit form now asks for.
-- ============================================================================

alter table public.properties
  add column if not exists seller_attestation_version text,
  add column if not exists seller_attestation_at      timestamptz;

comment on column public.properties.seller_attestation_version is
  'Version of the sworn accuracy statement the seller ticked (see SELLER_ATTESTATION_VERSION in src/components/sell/SellForm.tsx). Null = signed before this was required.';
comment on column public.properties.seller_attestation_at is
  'Server-stamped moment the seller signed. Set by _require_seller_attestation; never written by the client.';

notify pgrst, 'reload schema';
