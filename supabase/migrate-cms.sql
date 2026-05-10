-- ============================================================
-- Mazed Auto — CMS tables
--
-- Today the marketing pages (about, help, terms, privacy), the FAQ,
-- the contact info and the home promo banner are hardcoded French
-- JSX. This migration moves them into the database so the admin
-- can edit copy without redeploying.
--
-- Tables:
--   cms_pages             — about / help / terms / privacy / how-it-works
--   cms_faqs              — single FAQ list, ordered, both locales
--   cms_promo_banners     — home promo banners with effective dates
--   cms_brands            — allowed brands list (for seller wizard)
--   cms_features          — allowed equipment / feature toggles
--   cms_cities            — allowed cities (Tunisia governorates)
--   notification_templates — notification templates by kind × locale
--
-- Depends on: migrate-admin-foundations.sql
-- Safe to run repeatedly.
-- ============================================================

-- 1) cms_pages -------------------------------------------------------
create table if not exists public.cms_pages (
  slug         text primary key,           -- 'about' | 'help' | 'terms' | 'privacy' | 'how-it-works'
  title_ar     text,
  title_fr     text,
  body_ar      text,                       -- markdown
  body_fr      text,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.cms_pages enable row level security;
drop policy if exists "cms_pages_public_read" on public.cms_pages;
create policy "cms_pages_public_read" on public.cms_pages
  for select using (true);

-- 2) cms_faqs --------------------------------------------------------
create table if not exists public.cms_faqs (
  id           uuid primary key default gen_random_uuid(),
  position     int not null default 0,
  question_ar  text,
  question_fr  text not null,
  answer_ar    text,
  answer_fr    text not null,
  is_published boolean not null default true,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

create index if not exists cms_faqs_position_idx
  on public.cms_faqs (position) where is_published = true;

alter table public.cms_faqs enable row level security;
drop policy if exists "cms_faqs_public_read" on public.cms_faqs;
create policy "cms_faqs_public_read" on public.cms_faqs
  for select using (is_published = true or public.is_admin());

-- 3) cms_promo_banners ----------------------------------------------
create table if not exists public.cms_promo_banners (
  id           uuid primary key default gen_random_uuid(),
  title_ar     text,
  title_fr     text,
  subtitle_ar  text,
  subtitle_fr  text,
  cta_label_ar text,
  cta_label_fr text,
  cta_href     text,
  image_url    text,
  is_active    boolean not null default true,
  starts_at    timestamptz,
  ends_at      timestamptz,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.cms_promo_banners enable row level security;
drop policy if exists "cms_banners_public_read" on public.cms_promo_banners;
create policy "cms_banners_public_read" on public.cms_promo_banners
  for select using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
    or public.is_admin()
  );

-- 4) cms_brands ------------------------------------------------------
create table if not exists public.cms_brands (
  slug         text primary key,
  display_name text not null,
  logo_url     text,
  is_active    boolean not null default true,
  position     int not null default 0
);

alter table public.cms_brands enable row level security;
drop policy if exists "cms_brands_public_read" on public.cms_brands;
create policy "cms_brands_public_read" on public.cms_brands
  for select using (true);

insert into public.cms_brands (slug, display_name, position) values
  ('renault',  'Renault',       10),
  ('peugeot',  'Peugeot',       20),
  ('vw',       'Volkswagen',    30),
  ('toyota',   'Toyota',        40),
  ('hyundai',  'Hyundai',       50),
  ('bmw',      'BMW',           60),
  ('mercedes', 'Mercedes',      70),
  ('citroen',  'Citroën',       80),
  ('fiat',     'Fiat',          90),
  ('kia',      'Kia',           100),
  ('skoda',    'Skoda',         110),
  ('audi',     'Audi',          120),
  ('ford',     'Ford',          130)
on conflict (slug) do nothing;

-- 5) cms_features ----------------------------------------------------
create table if not exists public.cms_features (
  slug         text primary key,
  label_ar     text,
  label_fr     text not null,
  category     text,
  is_active    boolean not null default true,
  position     int not null default 0
);

alter table public.cms_features enable row level security;
drop policy if exists "cms_features_public_read" on public.cms_features;
create policy "cms_features_public_read" on public.cms_features
  for select using (true);

insert into public.cms_features (slug, label_fr, position) values
  ('air_conditioning', 'Climatisation', 10),
  ('abs',              'ABS',           20),
  ('esp',              'ESP',           30),
  ('airbags',          'Airbags',       40),
  ('audio',            'Audio',         50),
  ('bluetooth',        'Bluetooth',     60),
  ('reverse_camera',   'Caméra de recul', 70),
  ('led_headlights',   'Phares LED',    80),
  ('carplay',          'CarPlay',       90),
  ('android_auto',     'Android Auto',  100),
  ('sunroof',          'Toit ouvrant',  110),
  ('leather',          'Sièges en cuir', 120),
  ('cruise_control',   'Régulateur de vitesse', 130)
on conflict (slug) do nothing;

-- 6) cms_cities ------------------------------------------------------
create table if not exists public.cms_cities (
  slug         text primary key,
  name_ar      text,
  name_fr      text not null,
  region       text,                  -- governorate
  is_active    boolean not null default true,
  position     int not null default 0
);

alter table public.cms_cities enable row level security;
drop policy if exists "cms_cities_public_read" on public.cms_cities;
create policy "cms_cities_public_read" on public.cms_cities
  for select using (true);

insert into public.cms_cities (slug, name_fr, region, position) values
  ('tunis',     'Tunis',     'Tunis',      10),
  ('ariana',    'Ariana',    'Ariana',     20),
  ('ben_arous', 'Ben Arous', 'Ben Arous',  30),
  ('manouba',   'Manouba',   'Manouba',    40),
  ('nabeul',    'Nabeul',    'Nabeul',     50),
  ('sousse',    'Sousse',    'Sousse',     60),
  ('monastir',  'Monastir',  'Monastir',   70),
  ('mahdia',    'Mahdia',    'Mahdia',     80),
  ('sfax',      'Sfax',      'Sfax',       90),
  ('gabes',     'Gabès',     'Gabès',     100),
  ('medenine',  'Médenine',  'Médenine',  110),
  ('tataouine', 'Tataouine', 'Tataouine', 120),
  ('gafsa',     'Gafsa',     'Gafsa',     130),
  ('tozeur',    'Tozeur',    'Tozeur',    140),
  ('kebili',    'Kébili',    'Kébili',    150),
  ('sidi_bouzid','Sidi Bouzid','Sidi Bouzid',160),
  ('kairouan',  'Kairouan',  'Kairouan',  170),
  ('kasserine', 'Kasserine', 'Kasserine', 180),
  ('jendouba',  'Jendouba',  'Jendouba',  190),
  ('beja',      'Béja',      'Béja',      200),
  ('siliana',   'Siliana',   'Siliana',   210),
  ('zaghouan',  'Zaghouan',  'Zaghouan',  220),
  ('bizerte',   'Bizerte',   'Bizerte',   230),
  ('le_kef',    'Le Kef',    'Le Kef',    240)
on conflict (slug) do nothing;

-- 7) notification_templates -----------------------------------------
-- Keyed by (kind, locale). Notifications written from triggers /
-- server code look up the template and render the title/body. Body
-- supports `{{varName}}` substitutions handled in TS.
create table if not exists public.notification_templates (
  kind         text not null,
  locale       text not null,
  title        text not null,
  body         text not null,
  in_app       boolean not null default true,
  email        boolean not null default false,
  sms          boolean not null default false,
  push         boolean not null default true,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (kind, locale)
);

alter table public.notification_templates enable row level security;
drop policy if exists "notif_tmpl_public_read" on public.notification_templates;
create policy "notif_tmpl_public_read" on public.notification_templates
  for select using (true);

-- Seed both locales for every kind we know about (PLAN §23.2 — 18 kinds).
-- Bodies are short; full personalisation happens at render time.
insert into public.notification_templates (kind, locale, title, body) values
  ('outbid','fr',           'Vous avez été dépassé', 'Quelqu''un a surenchéri sur votre offre.'),
  ('outbid','ar',           'تم تجاوز عرضك',          'قام مزايد آخر بتقديم عرض أعلى من عرضك.'),
  ('won','fr',              'Félicitations, vous avez gagné !', 'Vous disposez de 7 jours pour finaliser le paiement.'),
  ('won','ar',              'تهانينا، لقد فزت بالمزاد!', 'لديك 7 أيام لإتمام الدفع النهائي.'),
  ('lost','fr',              'Enchère terminée', 'Vous n''êtes pas le gagnant. Caution remboursée.'),
  ('lost','ar',              'انتهى المزاد', 'لم تفز بهذا المزاد. سيتم استرداد التأمين.'),
  ('new_bid','fr',          'Nouvelle offre', 'Une nouvelle offre vient d''arriver.'),
  ('new_bid','ar',          'عرض جديد',       'تم تقديم عرض جديد على مزادك.'),
  ('approved','fr',         'Enchère approuvée', 'Votre annonce est en ligne.'),
  ('approved','ar',         'تمت الموافقة على المزاد', 'إعلانك متاح الآن.'),
  ('rejected','fr',         'Enchère refusée', 'Votre annonce a été refusée.'),
  ('rejected','ar',         'تم رفض المزاد',    'تم رفض إعلانك.'),
  ('payment_due','fr',      'Paiement à effectuer', 'Pensez à finaliser le paiement avant l''échéance.'),
  ('payment_due','ar',      'موعد الدفع',       'يجب إتمام الدفع قبل انقضاء المهلة.'),
  ('reminder','fr',         'Rappel', 'Rappel de l''application.'),
  ('reminder','ar',         'تذكير',  'تذكير من التطبيق.'),
  ('system','fr',           'Notification système', 'Message du système.'),
  ('system','ar',           'إشعار من النظام',     'رسالة من النظام.'),
  -- New PLAN §23.2 kinds
  ('kyc_approved','fr',     'Identité vérifiée', 'Votre identité a été vérifiée. Vous pouvez maintenant vendre.'),
  ('kyc_approved','ar',     'تم التحقق من الهوية', 'تم التحقق من هويتك. يمكنك البيع الآن.'),
  ('kyc_rejected','fr',     'Vérification refusée', 'Votre dossier KYC n''a pas été accepté.'),
  ('kyc_rejected','ar',     'تم رفض التحقق',     'لم يتم قبول وثائق التحقق.'),
  ('kyc_expires_soon','fr', 'Vérification expire bientôt', 'Votre KYC expire dans 30 jours.'),
  ('kyc_expires_soon','ar', 'انتهاء صلاحية قريبة', 'ستنتهي صلاحية التحقق خلال 30 يومًا.'),
  ('auction_starting_soon','fr', 'Enchère sur le point de commencer', 'Une enchère que vous suivez démarre bientôt.'),
  ('auction_starting_soon','ar', 'مزاد سيبدأ قريباً', 'سيبدأ مزاد قمت بتتبعه قريباً.'),
  ('reserve_not_met','fr',  'Réserve non atteinte', 'Le prix de réserve n''a pas été atteint.'),
  ('reserve_not_met','ar',  'لم يصل سعر الاحتياط', 'لم يصل العرض إلى السعر الاحتياطي.'),
  ('auction_extended','fr', 'Enchère prolongée', 'L''enchère a été prolongée par anti-sniping.'),
  ('auction_extended','ar', 'تم تمديد المزاد',     'تم تمديد المزاد بسبب نظام منع القنص.'),
  ('deposit_refunded','fr', 'Caution remboursée', 'Votre caution a été remboursée.'),
  ('deposit_refunded','ar', 'تم استرداد التأمين',  'تم استرداد تأمين المشاركة.'),
  ('deposit_forfeited','fr','Caution mise en jeu', 'Votre caution a été retenue pour non-paiement.'),
  ('deposit_forfeited','ar','مصادرة التأمين',     'تم احتجاز التأمين بسبب عدم الدفع.'),
  ('payment_received','fr', 'Paiement reçu', 'Le paiement a été crédité sur votre compte vendeur.'),
  ('payment_received','ar', 'تم استلام الدفع',  'تم تسجيل الدفع لصالح حسابك كبائع.'),
  ('rating_request','fr',   'Notez le vendeur', 'Aidez la communauté en évaluant cette transaction.'),
  ('rating_request','ar',   'قيّم البائع',       'ساعد المجتمع بتقييم هذه الصفقة.'),
  ('new_report','fr',       'Nouveau signalement', 'Une de vos enchères a été signalée.'),
  ('new_report','ar',       'بلاغ جديد',          'تم الإبلاغ عن أحد إعلاناتك.'),
  ('account_blocked','fr',  'Compte bloqué', 'Votre compte a été suspendu.'),
  ('account_blocked','ar',  'تم تعليق الحساب', 'تم تعليق حسابك.')
on conflict (kind, locale) do nothing;
