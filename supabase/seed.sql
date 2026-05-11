-- ============================================================
-- Mazed Auto — Seed Data
-- Run AFTER schema.sql.
-- All time-sensitive values are relative to now() so the
-- countdowns, "ending soon" rails, and recency sorts work
-- correctly whenever you re-run the seed.
-- Idempotent: re-running updates existing rows (on conflict).
-- ============================================================

-- Reset (uncomment to wipe and reseed)
-- truncate public.seller_ratings, public.bids, public.reports,
--          public.notifications, public.transactions, public.watchlist,
--          public.auctions, public.sellers, public.platform_stats
--          restart identity cascade;


-- ============================================================
-- 1) Sellers — 14 varied profiles across Tunisian cities
-- Mix of trust levels (new → verified_pro), individual + dealership
-- accounts, and a few unverified accounts for "new seller" alerts.
-- ============================================================
insert into public.sellers
  (id, username, display_name, avatar_url, trust_score, trust_level,
   verified_kyc, verified_ownership, successful_deals, rating_average, rating_count,
   account_age_months, city, is_pro)
values
  -- Top-tier dealerships
  ('22222222-2222-2222-2222-222222222222', 'auto_pro',     'Agence AutoPro',
   'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&q=80',
   312, 'verified_pro', true, true, 87, 4.90, 76, 38, 'Sfax',  true),
  ('77777777-7777-7777-7777-777777777777', 'tunis_motors', 'Tunis Motors',
   'https://images.unsplash.com/photo-1573497019418-b400bb3ab074?w=200&h=200&fit=crop&q=80',
   295, 'verified_pro', true, true, 64, 4.85, 58, 30, 'Tunis',   true),
  ('88888888-8888-8888-8888-888888888888', 'sahel_auto',   'Sahel Auto',
   'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=200&h=200&fit=crop&q=80',
   268, 'verified_pro', true, true, 51, 4.75, 47, 26, 'Sousse',   true),

  -- Very-trusted individuals
  ('11111111-1111-1111-1111-111111111111', 'ahmed_tn',     'Ahmed Ben Ali',
   'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&q=80',
   178, 'very_trusted', true, true, 14, 4.80, 12, 22, 'Tunis',   false),
  ('aaaa1111-bbbb-2222-cccc-dddd33334444', 'fatma_t',      'Fatma Trabelsi',
   'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&q=80',
   165, 'very_trusted', true, true, 11, 4.90, 10, 19, 'Monastir', false),
  ('aaaa2222-bbbb-3333-cccc-dddd44445555', 'youssef_b',    'Youssef Ben Salah',
   'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&q=80',
   156, 'very_trusted', true, true, 9,  4.70, 8,  17, 'Bizerte',  false),

  -- Trusted individuals
  ('44444444-4444-4444-4444-444444444444', 'med_garage',   'Mohamed Trabelsi',
   'https://images.unsplash.com/photo-1463453091185-61582044d556?w=200&h=200&fit=crop&q=80',
   142, 'trusted', true, true, 8, 4.60, 7, 15, 'Bizerte', false),
  ('aaaa3333-bbbb-4444-cccc-dddd55556666', 'leila_h',      'Leila Hammi',
   'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&q=80',
   128, 'trusted', true, true, 6, 4.50, 6, 12, 'Nabeul',  false),
  ('aaaa4444-bbbb-5555-cccc-dddd66667777', 'walid_k',      'Walid Kouki',
   'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop&q=80',
   115, 'trusted', true, true, 5, 4.40, 5, 11, 'Gabès',  false),
  ('33333333-3333-3333-3333-333333333333', 'salma_b',      'Salma Bouzid',
   'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200&h=200&fit=crop&q=80',
   95,  'trusted', true, true, 3, 4.50, 3, 9,  'Sousse', false),

  -- Verified low-trust (new accounts but identity confirmed)
  ('55555555-5555-5555-5555-555555555555', 'new_seller',   'Karim Hammi',
   'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=200&h=200&fit=crop&q=80',
   42, 'low', true, true, 0, 0.00, 0, 1, 'Nabeul', false),
  ('aaaa5555-bbbb-6666-cccc-dddd77778888', 'amine_s',      'Amine Sahli',
   'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop&q=80',
   58, 'low', true, false, 0, 0.00, 0, 2, 'Kairouan', false),

  -- Brand new — no KYC yet (used to test gating + alerts)
  ('aaaa6666-bbbb-7777-cccc-dddd88889999', 'reda_p',       'Reda Jelouli',
   null,
   18, 'new', false, false, 0, 0.00, 0, 0, 'Médenine', false),
  ('aaaa7777-bbbb-8888-cccc-dddd99990000', 'mariem_z',     'Mariem Zitouni',
   'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&q=80',
   12, 'new', false, false, 0, 0.00, 0, 0, 'Béja', false)
on conflict (id) do update set
  display_name = excluded.display_name,
  avatar_url = excluded.avatar_url,
  trust_score = excluded.trust_score,
  trust_level = excluded.trust_level,
  verified_kyc = excluded.verified_kyc,
  verified_ownership = excluded.verified_ownership,
  successful_deals = excluded.successful_deals,
  rating_average = excluded.rating_average,
  rating_count = excluded.rating_count,
  account_age_months = excluded.account_age_months,
  city = excluded.city,
  is_pro = excluded.is_pro;


-- ============================================================
-- 2) Auctions — 22 listings spanning every status, price tier,
-- vehicle category, and condition. Image arrays are kept short
-- (4-5 photos each) so the gallery feels real without bloat.
-- ============================================================
insert into public.auctions
  (id, seller_id, make, model, year, mileage, fuel_type, transmission, color,
   condition, category, description, features, city, region, image_urls, video_url,
   starting_price, reserve_price, buy_now_price, current_price,
   participation_deposit, bid_increment,
   start_time, end_time, original_end_time, status, reserve_met,
   total_bids, total_participants, is_featured, is_vip, alerts)
values
  -- ── ACTIVE — popular hatchbacks ──────────────────────────
  -- 1. Renault Clio 2022 — featured, mid-bid, fresh activity
  ('aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   'Renault','Clio',2022,28000,'gasoline','manual','Blanc',
   'excellent','hatchback',
   'Clio 5 modèle 2022, entretien régulier en concession, usage personnel uniquement, excellent état, pneus neufs.',
   ARRAY['Climatisation','ABS','Airbags','Système audio','Bluetooth','Caméra de recul','Jantes alliage'],
   'Tunis','Grand Tunis',
   ARRAY[
     'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   32000, 38000, 45000, 36500, 1600, 500,
   now() - interval '24 hours', now() + interval '28 hours', now() + interval '28 hours',
   'active', false, 14, 6, true, false, '[]'::jsonb),

  -- 2. Peugeot 208 GT 2024 — VIP + ending soon
  ('aaaaaaa2-2222-2222-2222-aaaaaaaaaaaa',
   '22222222-2222-2222-2222-222222222222',
   'Peugeot','208 GT',2024,0,'gasoline','automatic','Rouge',
   'new','hatchback',
   'Peugeot 208 GT 2024, 0 km, full options, garantie concessionnaire 3 ans, livraison immédiate avec tous les papiers.',
   ARRAY['Climatisation numérique','ABS + ESP','6 Airbags','Caméra 360°','Apple CarPlay','Android Auto','Phares LED','Jantes 17 pouces','Volant chauffant'],
   'Sfax','Sfax',
   ARRAY[
     'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   68000, null, 78000, 72000, 3400, 1000,
   now() - interval '12 hours', now() + interval '2 hours', now() + interval '2 hours',
   'ending', true, 23, 11, true, true, '[]'::jsonb),

  -- 3. VW Golf 7 TDI 2019 — under-market alert
  ('aaaaaaa3-3333-3333-3333-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333',
   'Volkswagen','Golf 7',2019,78000,'diesel','manual','Gris',
   'good','hatchback',
   'Golf 7 TDI, économique en consommation (4.5L/100), idéale pour les longs trajets, entretien documenté.',
   ARRAY['Climatisation','ABS','Système de navigation','Caméra de recul','Volant chauffant','Régulateur de vitesse'],
   'Sousse','Sahel',
   ARRAY[
     'https://images.unsplash.com/photo-1471444928139-48c5bf5173f8?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   38000, 42000, null, 39500, 1900, 500,
   now() - interval '48 hours', now() + interval '72 hours', now() + interval '72 hours',
   'active', false, 7, 4, false, false,
   '[{"type":"info","title":"Prix de départ 12% en dessous du marché","detail":"Le prix de marché actuel pour une Golf 7 2019 avec ce kilométrage est d''environ 43 000 DT","suggestion":"Peut être une bonne opportunité, ou une raison de vérifier"}]'::jsonb),

  -- ── ACTIVE — sedans ─────────────────────────────────────
  -- 4. BMW 320i Sport 2021 — featured premium sedan
  ('aaaaaaa4-4444-4444-4444-aaaaaaaaaaaa',
   '44444444-4444-4444-4444-444444444444',
   'BMW','320i',2021,45000,'gasoline','automatic','Noir',
   'excellent','sedan',
   'BMW 320i Sport Package, full options, révision complète en concession, pneus Michelin neufs.',
   ARRAY['Pack M Sport','Cuir','Toit ouvrant','Harman Kardon','Affichage tête haute','Régulateur adaptatif','Jantes 18 pouces'],
   'Bizerte','Nord',
   ARRAY[
     'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   95000, 105000, 130000, 102000, 4750, 1000,
   now() - interval '6 hours', now() + interval '48 hours', now() + interval '48 hours',
   'active', false, 9, 5, true, false, '[]'::jsonb),

  -- 5. Mercedes C200 2020 — premium, no buy-now
  ('aaaaaaa5-5555-5555-5555-aaaaaaaaaaaa',
   '77777777-7777-7777-7777-777777777777',
   'Mercedes','C200',2020,62000,'gasoline','automatic','Argent',
   'excellent','sedan',
   'C200 AMG Line, full options, entretien en concession, 9G-Tronic.',
   ARRAY['AMG Line','Cuir','Burmester','Système de navigation','Caméra 360°','Éclairage d''ambiance'],
   'Tunis','Grand Tunis',
   ARRAY[
     'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   115000, 130000, null, 122000, 5750, 1500,
   now() - interval '36 hours', now() + interval '60 hours', now() + interval '60 hours',
   'active', false, 12, 7, true, true, '[]'::jsonb),

  -- 6. (removed) Toyota Yaris 2020 — dropped at the user's request.
  -- The id aaaaaaa6-... is intentionally left dead: any FK rows that
  -- still reference it should fail cleanly rather than silently re-seed.

  -- ── ACTIVE — SUVs ───────────────────────────────────────
  -- 7. Hyundai Tucson 2023 — VIP family SUV
  ('aaaaaaa7-7777-7777-7777-aaaaaaaaaaaa',
   '22222222-2222-2222-2222-222222222222',
   'Hyundai','Tucson',2023,12000,'diesel','automatic','Blanc nacré',
   'excellent','suv',
   'Tucson Premium, SUV familial haut de gamme, quasi neuf, garantie concessionnaire en cours.',
   ARRAY['Climatisation 3 zones','ABS + ESP','Caméra 360°','Système de navigation','Cuir','Toit panoramique','Assistance maintien de voie'],
   'Tunis','Grand Tunis',
   ARRAY[
     'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   85000, 95000, 110000, 92000, 4250, 1000,
   now() - interval '18 hours', now() + interval '36 hours', now() + interval '36 hours',
   'active', false, 16, 8, true, true, '[]'::jsonb),

  -- 8. Kia Sportage 2021 — mid-range SUV
  ('aaaaaaa8-8888-8888-8888-aaaaaaaaaaaa',
   '88888888-8888-8888-8888-888888888888',
   'Kia','Sportage',2021,38000,'diesel','automatic','Gris',
   'good','suv',
   'Sportage GT-Line, diesel économique, usage familial, entretien en concession.',
   ARRAY['Climatisation','ABS','Caméra de recul','Cuir','Régulateur de vitesse','Apple CarPlay'],
   'Sfax','Sfax',
   ARRAY[
     'https://images.unsplash.com/photo-1606152421802-db97b9c7a11b?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   62000, 70000, null, 66000, 3100, 750,
   now() - interval '20 hours', now() + interval '52 hours', now() + interval '52 hours',
   'active', false, 8, 5, false, false, '[]'::jsonb),

  -- 9. Dacia Duster 2022 — affordable SUV
  ('aaaaaaa9-9999-9999-9999-aaaaaaaaaaaa',
   'aaaa1111-bbbb-2222-cccc-dddd33334444',
   'Dacia','Duster',2022,30000,'diesel','manual','Gris métallisé',
   'good','suv',
   'Duster Prestige, SUV pratique pour famille et voyages, consommation excellente.',
   ARRAY['Climatisation','ABS','Système de navigation','Caméra de recul','4x2'],
   'Monastir','Sahel',
   ARRAY[
     'https://images.unsplash.com/photo-1568844293986-8d0400bd4745?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   42000, null, 52000, 44000, 2100, 500,
   now() - interval '16 hours', now() + interval '64 hours', now() + interval '64 hours',
   'active', true, 5, 3, false, false, '[]'::jsonb),

  -- ── ACTIVE — entry-level / city cars ───────────────────
  -- 10. Citroën C3 2021 — first-car target
  ('aaaaaa10-0000-0000-0000-aaaaaaaaaaaa',
   'aaaa3333-bbbb-4444-cccc-dddd55556666',
   'Citroën','C3',2021,42000,'gasoline','manual','Jaune',
   'good','hatchback',
   'C3 élégante et confortable, idéale pour jeunes conducteurs, pneus neufs.',
   ARRAY['Climatisation','ABS','Airbags','Système audio','Bluetooth'],
   'Nabeul','Centre-Est',
   ARRAY[
     'https://images.unsplash.com/photo-1572811801985-b8a1cee48fb6?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   25000, null, null, 26500, 1250, 250,
   now() - interval '8 hours', now() + interval '90 hours', now() + interval '90 hours',
   'active', true, 4, 3, false, false, '[]'::jsonb),

  -- 11. Fiat 500 2019 — collector / city car
  ('aaaaaa11-1111-1111-1111-aaaaaaaaaaaa',
   'aaaa2222-bbbb-3333-cccc-dddd44445555',
   'Fiat','500',2019,58000,'gasoline','manual','Rose',
   'fair','hatchback',
   'Fiat 500 en bon état, nécessite un entretien mineur des freins, prix très attractif.',
   ARRAY['Climatisation','ABS','Airbags','Système audio'],
   'Bizerte','Nord',
   ARRAY[
     'https://images.unsplash.com/photo-1597844808175-c2e5d6c95755?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   18000, null, null, 19500, 900, 250,
   now() - interval '10 hours', now() + interval '95 hours', now() + interval '95 hours',
   'active', true, 6, 4, false, false,
   '[{"type":"info","title":"État du véhicule : moyen","detail":"Le vendeur indique que les freins nécessitent un entretien","suggestion":"Faites évaluer la voiture par un mécanicien indépendant avant l''achat"}]'::jsonb),

  -- ── ACTIVE — wagons / family cars ──────────────────────
  -- 12. Skoda Octavia 2022 wagon
  ('aaaaaa12-2222-2222-2222-aaaaaaaaaaaa',
   '88888888-8888-8888-8888-888888888888',
   'Skoda','Octavia Combi',2022,35000,'diesel','automatic','Bleu foncé',
   'excellent','wagon',
   'Octavia Combi, très grand espace de chargement, économique et confortable pour voyager.',
   ARRAY['Climatisation numérique','ABS','Airbags','Caméra de recul','Système de navigation','Régulateur de vitesse'],
   'Tunis','Grand Tunis',
   ARRAY[
     'https://images.unsplash.com/photo-1612825173281-9a193378527e?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   58000, 65000, 72000, 61500, 2900, 750,
   now() - interval '14 hours', now() + interval '40 hours', now() + interval '40 hours',
   'active', false, 11, 6, true, false, '[]'::jsonb),

  -- ── ACTIVE — pickups ───────────────────────────────────
  -- 13. Isuzu D-Max 2020 — work pickup
  ('aaaaaa13-3333-3333-3333-aaaaaaaaaaaa',
   'aaaa4444-bbbb-5555-cccc-dddd66667777',
   'Isuzu','D-Max',2020,82000,'diesel','manual','Blanc',
   'good','pickup',
   'D-Max 4x4 pour le travail et la ferme, excellente condition mécanique, entretien en concession.',
   ARRAY['Climatisation','ABS','Airbags','Système audio','4x4'],
   'Gabès','Sud',
   ARRAY[
     'https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   72000, null, 88000, 75500, 3600, 1000,
   now() - interval '22 hours', now() + interval '50 hours', now() + interval '50 hours',
   'active', true, 7, 4, false, false, '[]'::jsonb),

  -- ── ACTIVE — sport coupé / specialty ──────────────────
  -- 14. Audi A5 Sportback 2020
  ('aaaaaa14-4444-4444-4444-aaaaaaaaaaaa',
   '77777777-7777-7777-7777-777777777777',
   'Audi','A5 Sportback',2020,48000,'gasoline','automatic','Noir brillant',
   'excellent','coupe',
   'A5 Sportback S-Line, full options, état exceptionnel, garantie étendue.',
   ARRAY['S-Line','Quattro','Cuir','Bang & Olufsen','Virtual Cockpit','LED Matrix'],
   'Sousse','Sahel',
   ARRAY[
     'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   135000, 150000, 175000, 145000, 6750, 2000,
   now() - interval '30 hours', now() + interval '54 hours', now() + interval '54 hours',
   'active', false, 14, 9, true, true, '[]'::jsonb),

  -- 15. Ford Mustang 2018 — collector coupe (high-priced, low activity)
  ('aaaaaa15-5555-5555-5555-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   'Ford','Mustang GT',2018,35000,'gasoline','automatic','Bleu foncé',
   'excellent','coupe',
   'Mustang GT 5.0L V8, pièce de collection, excellent état, pneus Pirelli neufs.',
   ARRAY['V8 5.0L','Cuir','Sièges Recaro','Système audio Premium','Mode Track'],
   'Tunis','Grand Tunis',
   ARRAY[
     'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   180000, 220000, 260000, 195000, 9000, 2500,
   now() - interval '40 hours', now() + interval '80 hours', now() + interval '80 hours',
   'active', false, 6, 4, true, true, '[]'::jsonb),

  -- ── ACTIVE — vans / utility ────────────────────────────
  -- 16. Renault Trafic 2019 — work van
  ('aaaaaa16-6666-6666-6666-aaaaaaaaaaaa',
   '44444444-4444-4444-4444-444444444444',
   'Renault','Trafic',2019,120000,'diesel','manual','Blanc',
   'good','van',
   'Trafic L2H1 utilitaire, 9 places + marchandise, entretien entièrement documenté.',
   ARRAY['Climatisation','ABS','Airbags','3 rangées de sièges'],
   'Kairouan','Centre',
   ARRAY[
     'https://images.unsplash.com/photo-1626668893632-6f3a4466d22f?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   45000, 52000, null, 47500, 2250, 500,
   now() - interval '26 hours', now() + interval '70 hours', now() + interval '70 hours',
   'active', false, 4, 3, false, false, '[]'::jsonb),

  -- ── ENDING SOON — extra urgency rail ───────────────────
  -- 17. Hyundai i10 2021 — ending in 45 minutes
  ('aaaaaa17-7777-7777-7777-aaaaaaaaaaaa',
   'aaaa1111-bbbb-2222-cccc-dddd33334444',
   'Hyundai','i10',2021,38000,'gasoline','manual','Rouge',
   'good','hatchback',
   'i10 voiture urbaine idéale, consommation excellente, stationnement facile.',
   ARRAY['Climatisation','ABS','Airbags','Système audio'],
   'Monastir','Sahel',
   ARRAY[
     'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   24000, 28000, null, 26500, 1200, 250,
   now() - interval '47 hours', now() + interval '45 minutes', now() + interval '45 minutes',
   'ending', false, 18, 9, false, false, '[]'::jsonb),

  -- ── SCHEDULED — auctions opening later ─────────────────
  -- 18. VW Tiguan 2024 — opens in 6 hours
  ('aaaaaa18-8888-8888-8888-aaaaaaaaaaaa',
   '77777777-7777-7777-7777-777777777777',
   'Volkswagen','Tiguan',2024,5000,'diesel','automatic','Noir',
   'new','suv',
   'Tiguan R-Line 2024, 5000 km seulement, full options, état concessionnaire.',
   ARRAY['R-Line','Climatisation 3 zones','Cuir','Toit panoramique','Système de navigation','LED Matrix'],
   'Tunis','Grand Tunis',
   ARRAY[
     'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   145000, 165000, null, 145000, 7250, 2000,
   now() + interval '6 hours', now() + interval '156 hours', now() + interval '156 hours',
   'scheduled', false, 0, 0, true, true, '[]'::jsonb),

  -- ── ENDED — sold for the right price ──────────────────
  -- 19. Mercedes E-Class 2019 — sold above reserve
  ('aaaaaa19-9999-9999-9999-aaaaaaaaaaaa',
   '22222222-2222-2222-2222-222222222222',
   'Mercedes','E300',2019,68000,'gasoline','automatic','Blanc',
   'excellent','sedan',
   'E300 AMG Line, full options, entretien complet en concession.',
   ARRAY['AMG Line','Cuir','Burmester','Suspension pneumatique','HUD'],
   'Sfax','Sfax',
   ARRAY[
     'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   140000, 160000, null, 168000, 7000, 2000,
   now() - interval '8 days', now() - interval '2 days', now() - interval '2 days',
   'ended', true, 22, 12, false, false, '[]'::jsonb),

  -- 20. Renault Kadjar 2020 — sold
  ('aaaaaa20-0000-1111-2222-aaaaaaaaaaaa',
   '88888888-8888-8888-8888-888888888888',
   'Renault','Kadjar',2020,72000,'diesel','automatic','Gris',
   'good','suv',
   'Kadjar Intens, familiale et confortable, consommation excellente.',
   ARRAY['Climatisation','ABS','Système de navigation','Caméra de recul','Cuir'],
   'Sousse','Sahel',
   ARRAY[
     'https://images.unsplash.com/photo-1568844293986-8d0400bd4745?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   55000, 60000, null, 62000, 2750, 750,
   now() - interval '6 days', now() - interval '1 day', now() - interval '1 day',
   'ended', true, 11, 7, false, false, '[]'::jsonb),

  -- ── RESERVE NOT MET — ended without reaching threshold ─
  -- 21. Audi Q5 2018 — reserve not met
  ('aaaaaa21-1111-2222-3333-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   'Audi','Q5',2018,98000,'diesel','automatic','Blanc',
   'good','suv',
   'Q5 S-Line, familiale haut de gamme, entretien régulier en concession.',
   ARRAY['S-Line','Quattro','Cuir','Système de navigation','Bang & Olufsen'],
   'Tunis','Grand Tunis',
   ARRAY[
     'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1542362567-b07e54358753?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   95000, 120000, null, 108000, 4750, 1500,
   now() - interval '5 days', now() - interval '12 hours', now() - interval '12 hours',
   'reserve_not_met', false, 9, 6, false, false, '[]'::jsonb),

  -- ── PENDING REVIEW — admin queue test row ──────────────
  -- 22. KIA Picanto 2022 — needs admin approval
  ('aaaaaa22-2222-3333-4444-aaaaaaaaaaaa',
   'aaaa6666-bbbb-7777-cccc-dddd88889999',
   'Kia','Picanto',2022,18000,'gasoline','manual','Blanc',
   'excellent','hatchback',
   'Picanto 2022 quasi neuve, kilométrage très bas.',
   ARRAY['Climatisation','ABS','Airbags','Système audio'],
   'Médenine','Sud',
   ARRAY[
     'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1200&h=800&fit=crop&q=80',
     'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=800&fit=crop&q=80'
   ],
   null,
   32000, 38000, null, 32000, 1600, 500,
   now() - interval '2 hours', now() + interval '120 hours', now() + interval '120 hours',
   'pending_review', false, 0, 0, false, false,
   '[{"type":"warning","title":"Annonce en attente de modération","detail":"Le vendeur est nouveau et sa vérification d''identité n''est pas terminée","suggestion":"Apparaîtra après vérification"}]'::jsonb)

on conflict (id) do update set
  current_price = excluded.current_price,
  total_bids = excluded.total_bids,
  total_participants = excluded.total_participants,
  end_time = excluded.end_time,
  start_time = excluded.start_time,
  status = excluded.status,
  reserve_met = excluded.reserve_met,
  is_featured = excluded.is_featured,
  is_vip = excluded.is_vip;


-- ============================================================
-- 3) Bids — realistic histories per active auction.
-- We disable the new-bid trigger during seed so it doesn't double-
-- bump the totals we already set on the auction rows above. We
-- also delete any existing seed bids for these auctions so the
-- seed is idempotent (bids has no natural unique key).
-- ============================================================
delete from public.bids where auction_id in (
  'aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa', 'aaaaaaa2-2222-2222-2222-aaaaaaaaaaaa',
  'aaaaaaa3-3333-3333-3333-aaaaaaaaaaaa', 'aaaaaaa4-4444-4444-4444-aaaaaaaaaaaa',
  'aaaaaaa5-5555-5555-5555-aaaaaaaaaaaa', 'aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa',
  'aaaaaaa7-7777-7777-7777-aaaaaaaaaaaa', 'aaaaaaa8-8888-8888-8888-aaaaaaaaaaaa',
  'aaaaaaa9-9999-9999-9999-aaaaaaaaaaaa', 'aaaaaa10-0000-0000-0000-aaaaaaaaaaaa',
  'aaaaaa11-1111-1111-1111-aaaaaaaaaaaa', 'aaaaaa12-2222-2222-2222-aaaaaaaaaaaa',
  'aaaaaa13-3333-3333-3333-aaaaaaaaaaaa', 'aaaaaa14-4444-4444-4444-aaaaaaaaaaaa',
  'aaaaaa15-5555-5555-5555-aaaaaaaaaaaa', 'aaaaaa16-6666-6666-6666-aaaaaaaaaaaa',
  'aaaaaa17-7777-7777-7777-aaaaaaaaaaaa', 'aaaaaa19-9999-9999-9999-aaaaaaaaaaaa',
  'aaaaaa20-0000-1111-2222-aaaaaaaaaaaa', 'aaaaaa21-1111-2222-3333-aaaaaaaaaaaa'
);

alter table public.bids disable trigger trg_new_bid;

insert into public.bids (auction_id, bidder_label, amount, placed_at) values
  -- 1. Renault Clio — 14 bids climbing 32k → 36.5k
  ('aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa', 'Sami K.', 32000, now() - interval '23 hours'),
  ('aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa', 'Salma B.', 32500, now() - interval '20 hours'),
  ('aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa', 'Karim H.', 33000, now() - interval '15 hours'),
  ('aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa', 'Fatma L.', 34000, now() - interval '10 hours'),
  ('aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa', 'Sami K.', 35000, now() - interval '6 hours'),
  ('aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa', 'Karim H.', 35500, now() - interval '12 minutes'),
  ('aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa', 'Salma B.', 36000, now() - interval '5 minutes'),
  ('aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa', 'Ahmed K.', 36500, now() - interval '2 minutes'),

  -- 2. Peugeot 208 GT — 23 bids climbing fast (ending soon)
  ('aaaaaaa2-2222-2222-2222-aaaaaaaaaaaa', 'Mohamed L.', 68000, now() - interval '11 hours'),
  ('aaaaaaa2-2222-2222-2222-aaaaaaaaaaaa', 'Houda N.', 69000, now() - interval '9 hours'),
  ('aaaaaaa2-2222-2222-2222-aaaaaaaaaaaa', 'Youssef R.', 70000, now() - interval '6 hours'),
  ('aaaaaaa2-2222-2222-2222-aaaaaaaaaaaa', 'Fatma L.', 71000, now() - interval '7 minutes'),
  ('aaaaaaa2-2222-2222-2222-aaaaaaaaaaaa', 'Mohamed T.', 72000, now() - interval '1 minute'),

  -- 3. VW Golf 7 — slower pace
  ('aaaaaaa3-3333-3333-3333-aaaaaaaaaaaa', 'Amine S.', 38000, now() - interval '40 hours'),
  ('aaaaaaa3-3333-3333-3333-aaaaaaaaaaaa', 'Leila H.', 38500, now() - interval '24 hours'),
  ('aaaaaaa3-3333-3333-3333-aaaaaaaaaaaa', 'Walaa M.', 39000, now() - interval '8 hours'),
  ('aaaaaaa3-3333-3333-3333-aaaaaaaaaaaa', 'Amine S.', 39500, now() - interval '3 hours'),

  -- 4. BMW 320i
  ('aaaaaaa4-4444-4444-4444-aaaaaaaaaaaa', 'Youssef R.', 95000, now() - interval '5 hours'),
  ('aaaaaaa4-4444-4444-4444-aaaaaaaaaaaa', 'Mohamed T.', 98000, now() - interval '3 hours'),
  ('aaaaaaa4-4444-4444-4444-aaaaaaaaaaaa', 'Sami K.', 100000, now() - interval '1 hour'),
  ('aaaaaaa4-4444-4444-4444-aaaaaaaaaaaa', 'Youssef R.', 102000, now() - interval '15 minutes'),

  -- 5. Mercedes C200
  ('aaaaaaa5-5555-5555-5555-aaaaaaaaaaaa', 'Fatma L.', 115000, now() - interval '30 hours'),
  ('aaaaaaa5-5555-5555-5555-aaaaaaaaaaaa', 'Karim H.', 118000, now() - interval '12 hours'),
  ('aaaaaaa5-5555-5555-5555-aaaaaaaaaaaa', 'Houda N.', 120000, now() - interval '4 hours'),
  ('aaaaaaa5-5555-5555-5555-aaaaaaaaaaaa', 'Salma B.', 122000, now() - interval '40 minutes'),

  -- 6. Toyota Yaris (low activity)
  ('aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa', 'Mariem Z.', 28000, now() - interval '90 minutes'),
  ('aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa', 'Walid K.', 28500, now() - interval '20 minutes'),

  -- 7. Hyundai Tucson — busy
  ('aaaaaaa7-7777-7777-7777-aaaaaaaaaaaa', 'Karim H.', 85000, now() - interval '17 hours'),
  ('aaaaaaa7-7777-7777-7777-aaaaaaaaaaaa', 'Salma B.', 87000, now() - interval '10 hours'),
  ('aaaaaaa7-7777-7777-7777-aaaaaaaaaaaa', 'Youssef R.', 89000, now() - interval '5 hours'),
  ('aaaaaaa7-7777-7777-7777-aaaaaaaaaaaa', 'Houda N.', 92000, now() - interval '4 minutes'),

  -- 8. Kia Sportage
  ('aaaaaaa8-8888-8888-8888-aaaaaaaaaaaa', 'Mohamed T.', 62000, now() - interval '15 hours'),
  ('aaaaaaa8-8888-8888-8888-aaaaaaaaaaaa', 'Fatma L.', 64000, now() - interval '6 hours'),
  ('aaaaaaa8-8888-8888-8888-aaaaaaaaaaaa', 'Sami K.', 66000, now() - interval '90 minutes'),

  -- 9. Dacia Duster
  ('aaaaaaa9-9999-9999-9999-aaaaaaaaaaaa', 'Amine S.', 42000, now() - interval '14 hours'),
  ('aaaaaaa9-9999-9999-9999-aaaaaaaaaaaa', 'Leila H.', 43000, now() - interval '6 hours'),
  ('aaaaaaa9-9999-9999-9999-aaaaaaaaaaaa', 'Walid K.', 44000, now() - interval '2 hours'),

  -- 10. Citroën C3
  ('aaaaaa10-0000-0000-0000-aaaaaaaaaaaa', 'Mariem Z.', 25000, now() - interval '6 hours'),
  ('aaaaaa10-0000-0000-0000-aaaaaaaaaaaa', 'Karim H.', 26000, now() - interval '2 hours'),
  ('aaaaaa10-0000-0000-0000-aaaaaaaaaaaa', 'Sami K.', 26500, now() - interval '30 minutes'),

  -- 11. Fiat 500
  ('aaaaaa11-1111-1111-1111-aaaaaaaaaaaa', 'Mariem Z.', 18000, now() - interval '8 hours'),
  ('aaaaaa11-1111-1111-1111-aaaaaaaaaaaa', 'Salma B.', 19000, now() - interval '3 hours'),
  ('aaaaaa11-1111-1111-1111-aaaaaaaaaaaa', 'Fatma L.', 19500, now() - interval '90 minutes'),

  -- 12. Skoda Octavia
  ('aaaaaa12-2222-2222-2222-aaaaaaaaaaaa', 'Youssef R.', 58000, now() - interval '12 hours'),
  ('aaaaaa12-2222-2222-2222-aaaaaaaaaaaa', 'Karim H.', 60000, now() - interval '6 hours'),
  ('aaaaaa12-2222-2222-2222-aaaaaaaaaaaa', 'Houda N.', 61500, now() - interval '50 minutes'),

  -- 13. Isuzu D-Max
  ('aaaaaa13-3333-3333-3333-aaaaaaaaaaaa', 'Walid K.', 72000, now() - interval '20 hours'),
  ('aaaaaa13-3333-3333-3333-aaaaaaaaaaaa', 'Mohamed T.', 74000, now() - interval '8 hours'),
  ('aaaaaa13-3333-3333-3333-aaaaaaaaaaaa', 'Amine S.', 75500, now() - interval '2 hours'),

  -- 14. Audi A5
  ('aaaaaa14-4444-4444-4444-aaaaaaaaaaaa', 'Karim H.', 135000, now() - interval '28 hours'),
  ('aaaaaa14-4444-4444-4444-aaaaaaaaaaaa', 'Salma B.', 140000, now() - interval '14 hours'),
  ('aaaaaa14-4444-4444-4444-aaaaaaaaaaaa', 'Youssef R.', 145000, now() - interval '3 hours'),

  -- 15. Ford Mustang
  ('aaaaaa15-5555-5555-5555-aaaaaaaaaaaa', 'Sami K.', 180000, now() - interval '36 hours'),
  ('aaaaaa15-5555-5555-5555-aaaaaaaaaaaa', 'Fatma L.', 195000, now() - interval '5 hours'),

  -- 16. Renault Trafic
  ('aaaaaa16-6666-6666-6666-aaaaaaaaaaaa', 'Walid K.', 45000, now() - interval '24 hours'),
  ('aaaaaa16-6666-6666-6666-aaaaaaaaaaaa', 'Mohamed T.', 47500, now() - interval '4 hours'),

  -- 17. Hyundai i10 (ending in 45 minutes)
  ('aaaaaa17-7777-7777-7777-aaaaaaaaaaaa', 'Mariem Z.', 24000, now() - interval '45 hours'),
  ('aaaaaa17-7777-7777-7777-aaaaaaaaaaaa', 'Salma B.', 25000, now() - interval '12 hours'),
  ('aaaaaa17-7777-7777-7777-aaaaaaaaaaaa', 'Karim H.', 26000, now() - interval '2 hours'),
  ('aaaaaa17-7777-7777-7777-aaaaaaaaaaaa', 'Houda N.', 26500, now() - interval '8 minutes'),

  -- 19. Mercedes E-Class (ended)
  ('aaaaaa19-9999-9999-9999-aaaaaaaaaaaa', 'Mohamed T.', 140000, now() - interval '7 days'),
  ('aaaaaa19-9999-9999-9999-aaaaaaaaaaaa', 'Fatma L.', 155000, now() - interval '5 days'),
  ('aaaaaa19-9999-9999-9999-aaaaaaaaaaaa', 'Youssef R.', 168000, now() - interval '2 days 4 hours'),

  -- 20. Renault Kadjar (ended)
  ('aaaaaa20-0000-1111-2222-aaaaaaaaaaaa', 'Sami K.', 55000, now() - interval '5 days'),
  ('aaaaaa20-0000-1111-2222-aaaaaaaaaaaa', 'Karim H.', 60000, now() - interval '3 days'),
  ('aaaaaa20-0000-1111-2222-aaaaaaaaaaaa', 'Salma B.', 62000, now() - interval '1 day 2 hours'),

  -- 21. Audi Q5 (reserve not met — ended below 120k)
  ('aaaaaa21-1111-2222-3333-aaaaaaaaaaaa', 'Walid K.', 95000, now() - interval '4 days'),
  ('aaaaaa21-1111-2222-3333-aaaaaaaaaaaa', 'Mohamed T.', 102000, now() - interval '2 days'),
  ('aaaaaa21-1111-2222-3333-aaaaaaaaaaaa', 'Fatma L.', 108000, now() - interval '14 hours')
on conflict do nothing;

alter table public.bids enable trigger trg_new_bid;


-- ============================================================
-- 4) Seller ratings — 25+ reviews spread across sellers.
-- Older reviews skew positive; newer ones are mixed.
-- We disable trg_rating_recompute so the seller's seeded
-- rating_average / rating_count / trust_score stay as we set
-- them in section (1) — otherwise the trigger would overwrite
-- them with values computed from just the seeded rows below
-- (e.g. AutoPro's "76 ratings" would drop to 4).
-- ============================================================
alter table public.seller_ratings disable trigger trg_rating_recompute;

insert into public.seller_ratings (seller_id, buyer_label, rating, comment, created_at) values
  -- AutoPro (76 ratings, 4.90)
  ('22222222-2222-2222-2222-222222222222', 'Mohamed L.', 5, 'Concessionnaire fiable, transaction rapide et nette',  now() - interval '10 days'),
  ('22222222-2222-2222-2222-222222222222', 'Houda N.', 5, 'Très satisfait de la voiture, recommandé',                  now() - interval '20 days'),
  ('22222222-2222-2222-2222-222222222222', 'Fatma L.', 5, 'Excellent service client du début à la fin',               now() - interval '32 days'),
  ('22222222-2222-2222-2222-222222222222', 'Sami K.', 4, 'Tout va bien, juste un petit retard sur les papiers',              now() - interval '45 days'),

  -- Tunis Motors (58 ratings, 4.85)
  ('77777777-7777-7777-7777-777777777777', 'Karim H.', 5, 'Expérience professionnelle, voiture livrée en excellent état',           now() - interval '5 days'),
  ('77777777-7777-7777-7777-777777777777', 'Salma B.', 5, 'Vendeur transparent, a expliqué tous les détails avant la vente',             now() - interval '15 days'),
  ('77777777-7777-7777-7777-777777777777', 'Youssef R.', 4, 'Bon service mais le prix était plus élevé que prévu',          now() - interval '28 days'),

  -- Sahel Auto (47 ratings, 4.75)
  ('88888888-8888-8888-8888-888888888888', 'Mohamed T.', 5, 'Excellente expérience d''achat de A à Z',                   now() - interval '3 days'),
  ('88888888-8888-8888-8888-888888888888', 'Amine S.', 4, 'Tout est en ordre, je recommande',                        now() - interval '18 days'),
  ('88888888-8888-8888-8888-888888888888', 'Walid K.', 5, 'Vendeur honnête, voiture conforme à l''annonce',           now() - interval '40 days'),

  -- Ahmed (12 ratings, 4.80)
  ('11111111-1111-1111-1111-111111111111', 'Ahmed K.', 5, 'Excellente expérience, voiture conforme à 100% à la description',              now() - interval '25 days'),
  ('11111111-1111-1111-1111-111111111111', 'Salma B.', 5, 'Vendeur très professionnel, fortement recommandé',                          now() - interval '38 days'),
  ('11111111-1111-1111-1111-111111111111', 'Karim H.', 4, 'Tout est parfait, merci',                                now() - interval '52 days'),
  ('11111111-1111-1111-1111-111111111111', 'Houda N.', 5, 'Rapide et fiable, super',                                  now() - interval '78 days'),

  -- Fatma (10 ratings, 4.90)
  ('aaaa1111-bbbb-2222-cccc-dddd33334444', 'Youssef R.', 5, 'Vendeuse respectable et honnête, voiture en excellent état',         now() - interval '12 days'),
  ('aaaa1111-bbbb-2222-cccc-dddd33334444', 'Mohamed T.', 5, 'Transaction parfaitement fluide',                           now() - interval '34 days'),

  -- Youssef (8 ratings, 4.70)
  ('aaaa2222-bbbb-3333-cccc-dddd44445555', 'Fatma L.', 4, 'Tout va bien, voiture conforme à l''annonce',                   now() - interval '8 days'),
  ('aaaa2222-bbbb-3333-cccc-dddd44445555', 'Sami K.', 5, 'Vendeur tient sa parole, merci',                          now() - interval '24 days'),

  -- Med Garage (7 ratings, 4.60)
  ('44444444-4444-4444-4444-444444444444', 'Fatma Z.', 5, 'Vendeur honnête et coopératif',                                 now() - interval '8 days'),
  ('44444444-4444-4444-4444-444444444444', 'Karim H.', 4, 'Tout est parfait',                                        now() - interval '21 days'),

  -- Leila (6 ratings, 4.50)
  ('aaaa3333-bbbb-4444-cccc-dddd55556666', 'Walid K.', 4, 'Vendeuse aimable, transaction sans souci',                      now() - interval '11 days'),

  -- Walid (5 ratings, 4.40)
  ('aaaa4444-bbbb-5555-cccc-dddd66667777', 'Mohamed T.', 4, 'Tout va bien, voiture en bon état',                          now() - interval '14 days'),
  ('aaaa4444-bbbb-5555-cccc-dddd66667777', 'Houda N.', 4, 'Un peu de retard sur les réponses mais ça s''est bien terminé',           now() - interval '22 days'),

  -- Salma (3 ratings, 4.50)
  ('33333333-3333-3333-3333-333333333333', 'Youssef R.', 4, 'Tout est parfait',                                        now() - interval '15 days'),
  ('33333333-3333-3333-3333-333333333333', 'Sami K.', 5, 'Expérience fluide',                                         now() - interval '40 days')
on conflict do nothing;

alter table public.seller_ratings enable trigger trg_rating_recompute;


-- ============================================================
-- 5) Reports — admin queue (mix of severities and statuses).
-- We disable trg_new_report because that trigger inserts a
-- notification keyed by seller_id (treated as auth.uid). Seed
-- sellers are decoupled from auth.users by design (see schema.sql
-- §1 comment), so the FK on notifications.user_id would fail.
-- ============================================================
alter table public.reports disable trigger trg_new_report;

insert into public.reports (auction_id, reporter_label, reason, detail, severity, status, created_at, resolved_at) values
  ('aaaaaaa3-3333-3333-3333-aaaaaaaaaaaa', 'Ahmed K.', 'images_mismatch',
   'Les photos ne correspondent pas à la version annoncée — j''identifie des jantes d''origine sur les photos alors que l''annonce indique ''aftermarket''',
   'high',   'open',       now() - interval '1 hour',  null),
  ('aaaaaaa6-6666-6666-6666-aaaaaaaaaaaa', 'Salma B.', 'suspicious_price',
   'Prix très bas par rapport au marché pour une Yaris 2020 avec ce kilométrage',
   'normal', 'open',       now() - interval '3 hours', null),
  ('aaaaaaa1-1111-1111-1111-aaaaaaaaaaaa', 'Karim H.', 'off_platform',
   'Le vendeur a demandé un contact hors plateforme via WhatsApp pour éviter la commission',
   'high',   'reviewing',  now() - interval '6 hours', null),
  ('aaaaaa11-1111-1111-1111-aaaaaaaaaaaa', 'Fatma L.', 'hidden_defects',
   'Le vendeur n''a pas mentionné que les freins ont besoin d''entretien dans le titre principal de l''annonce',
   'normal', 'reviewing',  now() - interval '12 hours', null),
  ('aaaaaa15-5555-5555-5555-aaaaaaaaaaaa', 'Mohamed T.', 'fraud_suspicion',
   'L''annonce correspond à une autre voiture vue il y a une semaine avec des photos différentes',
   'high',   'resolved',   now() - interval '2 days',  now() - interval '1 day'),
  ('aaaaaaa8-8888-8888-8888-aaaaaaaaaaaa', 'Youssef R.', 'wrong_info',
   'Le kilométrage annoncé ne correspond pas à l''historique d''entretien',
   'low',    'dismissed',  now() - interval '4 days',  now() - interval '3 days')
on conflict do nothing;

alter table public.reports enable trigger trg_new_report;


-- ============================================================
-- 6) Transactions — admin ledger (no auth users; demo data)
-- ============================================================
insert into public.transactions (ref, user_label, type, direction, amount, label, status, created_at) values
  -- Recent activity (today / this week)
  ('TX-A1B2', 'Ahmed Ben Ali',     'deposit',       'in',  1600,    'Caution Renault Clio',           'completed',  now() - interval '1 hour'),
  ('TX-C3D4', 'Mohamed Trabelsi',  'final_payment', 'in',  168000,  'Paiement final Mercedes E300',     'completed',  now() - interval '5 hours'),
  ('TX-E5F6', 'Salma Bouzid',      'refund',        'out', 1400,    'Remboursement caution Toyota Yaris',   'completed',  now() - interval '8 hours'),
  ('TX-G7H8', 'Mazed Auto',      'commission',    'in',  11760,   'Commission 7% — Mercedes E300',     'completed',  now() - interval '5 hours'),
  ('TX-I9J0', 'Karim Hammi',     'deposit',       'in',  3400,    'Caution Peugeot 208',            'pending',    now() - interval '3 hours'),
  ('TX-K1L2', 'Agence AutoPro',   'payout',        'out', 156240,  'Virement au vendeur — Mercedes E300', 'processing', now() - interval '2 hours'),

  -- This week
  ('TX-M3N4', 'Youssef Ben Salah',   'deposit',       'in',  2750,    'Caution Renault Kadjar',         'completed',  now() - interval '5 days'),
  ('TX-O5P6', 'Youssef Ben Salah',   'final_payment', 'in',  62000,   'Paiement final Renault Kadjar',     'completed',  now() - interval '1 day'),
  ('TX-Q7R8', 'Mazed Auto',     'commission',    'in',  4340,    'Commission 7% — Renault Kadjar',    'completed',  now() - interval '1 day'),
  ('TX-S9T0', 'Sahel Auto',     'payout',        'out', 57660,   'Virement au vendeur — Renault Kadjar','completed',  now() - interval '12 hours'),
  ('TX-U1V2', 'Fatma Trabelsi','deposit',       'in',  6750,    'Caution Audi A5',                'completed',  now() - interval '2 days'),
  ('TX-W3X4', 'Walid Kouki',    'deposit',       'in',  2250,    'Caution Renault Trafic',         'completed',  now() - interval '3 days'),
  ('TX-Y5Z6', 'Houda N.',          'refund',        'out', 4750,    'Remboursement caution BMW 320i',       'completed',  now() - interval '4 days'),
  ('TX-A7B8', 'Mariem Zitouni',  'deposit',       'in',  1200,    'Caution Hyundai i10',            'completed',  now() - interval '6 days'),

  -- Older activity
  ('TX-C9D0', 'Karim Hammi',    'deposit',       'in',  1600,    'Caution Renault Clio',           'completed',  now() - interval '8 days'),
  ('TX-E1F2', 'Salma Bouzid',     'final_payment', 'in',  108000,  'Paiement final Audi Q5',            'failed',     now() - interval '10 days'),
  ('TX-G3H4', 'Tunis Motors',   'payout',        'out', 92000,   'Virement au vendeur — Hyundai Tucson','completed',  now() - interval '12 days'),
  ('TX-I5J6', 'Mazed Auto',     'commission',    'in',  6440,    'Commission 7% — Hyundai Tucson',    'completed',  now() - interval '12 days'),
  ('TX-K7L8', 'Mohamed Trabelsi', 'deposit',       'in',  3100,    'Caution Kia Sportage',           'completed',  now() - interval '15 days'),
  ('TX-M9N0', 'Fatma Trabelsi','final_payment', 'in',  44000,   'Paiement final Dacia Duster',       'completed',  now() - interval '18 days'),
  ('TX-O1P2', 'Mazed Auto',     'commission',    'in',  3080,    'Commission 7% — Dacia Duster',      'completed',  now() - interval '18 days'),
  ('TX-Q3R4', 'Sami K.',         'deposit',       'in',  1250,    'Caution Citroën C3',             'completed',  now() - interval '20 days'),
  ('TX-S5T6', 'Agence AutoPro',  'final_payment', 'in',  78000,   'Paiement final Peugeot 208',        'completed',  now() - interval '25 days'),
  ('TX-U7V8', 'Tunis Motors',   'payout',        'out', 145000,  'Virement au vendeur — VW Tiguan',     'completed',  now() - interval '28 days')
on conflict (ref) do nothing;


-- ============================================================
-- 7) Platform stats — homepage hero counters
-- ============================================================
insert into public.platform_stats (id, active_auctions, completed_deals, verified_sellers, satisfaction)
values (1, 1247, 3829, 5621, 4.8)
on conflict (id) do update set
  active_auctions = excluded.active_auctions,
  completed_deals = excluded.completed_deals,
  verified_sellers = excluded.verified_sellers,
  satisfaction = excluded.satisfaction;
