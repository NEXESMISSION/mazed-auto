-- ============================================================
-- Mazed Auto — Pricing spec alignment (per project doc §6.5 / §8.1)
--
-- The initial seeds in migrate-platform-settings.sql used
-- placeholder commission values (7% seller / 0% buyer / 15000
-- cap). The official spec is 3% seller + 2% buyer + 12000 cap,
-- plus a one-shot VIP listing fee and the transport commission
-- share. This migration nudges existing rows to the spec
-- values AND seeds the new keys.
--
-- Safe to run repeatedly: each UPDATE is idempotent.
-- ============================================================

-- 1) Correct commission defaults to match the spec.
update public.platform_settings set value = '0.03'::jsonb
 where key = 'auction.commission.seller_pct' and value = '0.07'::jsonb;

update public.platform_settings set value = '12000'::jsonb
 where key = 'auction.commission.seller_cap' and value = '15000'::jsonb;

update public.platform_settings set value = '0.02'::jsonb
 where key = 'auction.commission.buyer_pct' and value = '0'::jsonb;

-- 2) Seed the new keys (VIP listing fee, transport commission,
--    free listings/month for non-subscribed personal users).
insert into public.platform_settings (key, value, type, category, description, sensitive, requires_approval) values
  ('auction.vip_listing_fee',  '200'::jsonb,  'number', 'auction',
   'Frais VIP appliqués à une enchère mise en avant (200 DT par défaut).',
   false, true),

  ('transport.commission_pct', '0.15'::jsonb, 'number', 'transport',
   'Commission perçue sur le transport via partenaire (15% par défaut).',
   false, true),

  ('listing.free_per_month',   '1'::jsonb,    'number', 'listing',
   'Nombre de mises en ligne gratuites par mois pour un utilisateur personnel sans abonnement.',
   false, false)
on conflict (key) do nothing;
