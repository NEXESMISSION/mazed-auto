-- ============================================================
-- Mazed Auto — CMS categories (body types)
--
-- Adds an admin-managed "category" table so the home page and
-- browse filter can show an image + localised label per body
-- type without redeploying. The matching `VehicleCategory` TS
-- union still drives auction.category writes, but the labels and
-- images that users *see* now come from this table.
--
-- Depends on: migrate-admin-foundations.sql, migrate-cms.sql
-- Safe to run repeatedly.
-- ============================================================

create table if not exists public.cms_categories (
  slug         text primary key,           -- 'sedan' | 'suv' | 'hatchback' | 'pickup' | 'van' | 'coupe' | 'convertible' | 'wagon'
  name_ar      text,
  name_fr      text not null,
  image_url    text,                       -- absolute URL or relative /uploads/...
  is_visible   boolean not null default true,
  position     int not null default 0,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.cms_categories enable row level security;
drop policy if exists "cms_categories_public_read" on public.cms_categories;
create policy "cms_categories_public_read" on public.cms_categories
  for select using (true);

-- Admin write — relies on the cross-cutting admin RLS bypass set up in
-- migrate-rls-admin-fix.sql, same pattern as the rest of the cms_* tables.

insert into public.cms_categories (slug, name_fr, name_ar, position) values
  ('sedan',       'Berline',     'سيدان',           10),
  ('suv',         'SUV',         'دفع رباعي',       20),
  ('hatchback',   'Citadine',    'هاتشباك',         30),
  ('pickup',      'Pickup',      'بيك آب',          40),
  ('coupe',       'Coupé',       'كوبيه',           50),
  ('convertible', 'Cabriolet',   'مكشوفة',          60),
  ('wagon',       'Break',       'بريك',            70),
  ('van',         'Utilitaire',  'فان',             80)
on conflict (slug) do nothing;
