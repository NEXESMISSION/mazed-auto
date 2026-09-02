-- ============================================================================
-- Publishing a spare part is free.
--
-- A decision, not a special case in code: it is a `products` row like every
-- other price, scoped to the « Pièces de rechange » PARENT category, so
--
--   * an admin can put a price on parts later from /admin/pricing without a
--     deploy — which is the whole point of 0157;
--   * the nine part sub-categories (freinage, moteur, pneus…) inherit it
--     through `resolveListingFee`'s parent lookup, instead of needing nine
--     identical rows that would drift apart the first time one was edited;
--   * a sub-category added next month is free too, rather than silently
--     falling through to the 15 TND catch-all.
--
-- Zero here means FREE, and the submit route treats it as such: no payment
-- row, no receipt upload, straight to the moderation queue. That is different
-- from having NO row, which still means "nobody priced this" and refuses to
-- publish (`no_price_configured`) rather than giving the annonce away by
-- accident.
--
-- Cars are untouched: `annonce-standard` still charges 15 TND.
-- ============================================================================

insert into public.products
  (slug, kind, name_fr, name_ar, description, price, category_id,
   listing_quota, duration_days, is_active, sort_order)
select
  'annonce-piece',
  'listing_single',
  'Annonce · pièce de rechange',
  'إعلان · قطعة غيار',
  'Publication gratuite pour les pièces de rechange. Mettez un prix ici pour commencer à les facturer.',
  0,
  c.id,
  null,
  30,
  true,
  5
from public.categories c
where c.slug = 'pieces-rechange'
  and c.parent_id is null
on conflict (slug) do update
  set price       = excluded.price,
      category_id = excluded.category_id,
      is_active   = excluded.is_active;

comment on table public.products is
  'Every price in v3. A row scoped to a PARENT category applies to all its children (see resolveListingFee in src/lib/products.ts); price 0 means free, no row means unpriced.';

notify pgrst, 'reload schema';
