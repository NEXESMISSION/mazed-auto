-- ============================================================================
-- CAUTION — one flat rule instead of three knobs.
--
-- app_settings.deposit shipped as {mode, value, free_until}: free | fixed |
-- percent, plus an optional "gratuit jusqu'au" date. In percent mode (the
-- seeded default: 10 % of the opening price) the caution was a DIFFERENT
-- number on every lot, and the free-until date made it a different number on
-- different days. Nobody — bidder, seller, or support — could answer "how
-- much is the caution?" without opening a specific listing.
--
-- New shape: {"amount": <TND>}. One number, same on every lot, 0 = bidding is
-- free. The app-side reader (src/lib/pricing.ts) still understands the legacy
-- shape, so an un-migrated row or an older deploy resolves sanely; this
-- migration makes the stored row match the rule the admin screen now edits.
--
-- Conversion:
--   mode=free    → amount 0            (intent preserved exactly)
--   mode=fixed   → amount = value      (already flat)
--   mode=percent → amount = 500 TND    (a percent CANNOT be converted without
--                  a price; 'value' was 10 meaning 10 %, and storing 10 TND
--                  would silently drop the caution by ~99 %. 500 is the app's
--                  DEFAULT_DEPOSIT_TND — deliberate, and the admin overrides
--                  it in /admin/settings.)
--
-- An open free-until window is NOT preserved: it was a temporary promotion,
-- and the admin can express the same thing by setting the amount to 0.
-- Deposits already locked (auction_deposits rows) are untouched — bidders keep
-- whatever they actually paid.
-- ============================================================================

update public.app_settings
   set value = jsonb_build_object(
         'amount',
         case
           when value ? 'amount'          then greatest(0, (value ->> 'amount')::numeric)
           when value ->> 'mode' = 'free'  then 0
           when value ->> 'mode' = 'fixed' then greatest(0, coalesce((value ->> 'value')::numeric, 0))
           else 500
         end
       ),
       description =
         'Caution pour enchérir, en TND. Un seul montant, identique sur toutes '
         || 'les enchères. 0 = enchères gratuites.',
       updated_at = now()
 where key = 'deposit';

-- Seed it if the row was never created (fresh DB that skipped 0040).
insert into public.app_settings (key, value, description)
values (
  'deposit',
  '{"amount":500}'::jsonb,
  'Caution pour enchérir, en TND. Un seul montant, identique sur toutes les enchères. 0 = enchères gratuites.'
)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
