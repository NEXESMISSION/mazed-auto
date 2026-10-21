-- ============================================================================
-- `paused` — an annonce taken off the catalogue without being lost.
--
-- The shop lifecycle needs a state that is none of the existing ones:
--
--   * a subscription ends and its grace period runs out;
--   * an owner moves to a smaller plan and keeps only the annonces they choose.
--
-- The annonce must disappear from the catalogue, must not count against any
-- quota, must keep its photos, text, history and paid duration — and must come
-- back as it was when the shop is in order again. 'archived' means the owner
-- took it down; 'expired' means its time ran out. 'paused' means "not now",
-- and `listings.paused_reason` (0187) says why.
--
-- On its own because a value added to an enum cannot be used in the
-- transaction that adds it.
-- ============================================================================

alter type public.listing_status add value if not exists 'paused';
