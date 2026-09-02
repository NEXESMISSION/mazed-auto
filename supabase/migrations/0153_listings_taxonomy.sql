-- ============================================================================
-- v3 PHASE 1 (1/4) — the taxonomy every listing hangs off.
--
-- `property_type` is a v1 enum that still contains apartment / villa / farm
-- alongside car body types. It cannot describe a brake pad, and widening it
-- again (as 0149 proposed) buries the problem deeper: an enum cannot carry a
-- parent, a label in two languages, an icon, an order, or an on/off switch,
-- and every change to it is a migration.
--
-- So: a real table. Categories are a tree (Véhicules > Voitures, Pièces >
-- Freinage), each with its own attribute definitions. Adding "Motos" or
-- "Turbo & injection" becomes a row an admin writes, not a deploy.
--
-- Nothing reads these tables yet — 0154 adds `listings`, 0155 backfills, and
-- the UI switches over in Phases 3-4. This migration is additive and safe.
-- ============================================================================

-- ── Listing lifecycle ───────────────────────────────────────────────────────
-- draft            seller is still writing it
-- pending_payment  submitted, waiting on the publication fee (or a credit)
-- pending_review   paid (or credited, or admin-created) — in the moderation queue
-- published        live and visible to everyone
-- rejected         moderation refused it; rejection_reason says why
-- expired          ran past expires_at; renewable
-- archived         seller or admin took it down
-- sold             seller marked it sold (we are not in the transaction, so this
--                  is their word — it stops the calls, it is not a receipt)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'listing_status') then
    create type public.listing_status as enum (
      'draft', 'pending_payment', 'pending_review', 'published',
      'rejected', 'expired', 'archived', 'sold'
    );
  end if;
end $$;

-- ── Categories ──────────────────────────────────────────────────────────────
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories(id) on delete restrict,
  slug        text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label_fr    text not null,
  label_ar    text,
  -- What KIND of thing this is, which drives the form and the filters:
  -- a vehicle asks for mileage and a carte grise, a part asks for a reference
  -- and what it fits.
  kind        text not null check (kind in ('vehicle', 'part', 'other')),
  icon        text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists categories_parent_idx on public.categories(parent_id, sort_order);
create index if not exists categories_active_idx on public.categories(is_active) where is_active;

drop trigger if exists _touch_categories on public.categories;
create trigger _touch_categories before update on public.categories
  for each row execute function public._touch_updated_at();

-- ── Per-category attribute definitions ──────────────────────────────────────
-- Same idea as property_attribute_kinds (which this replaces), plus
-- `filterable`: an attribute a buyer searches by (fuel, brand) is not the same
-- as one they only read (colour), and the explore page needs to know which.
create table if not exists public.category_attributes (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories(id) on delete cascade,
  field_key    text not null check (field_key ~ '^[a-z][a-z0-9_]*$'),
  label        text not null,
  data_type    text not null check (data_type in ('number', 'text', 'boolean', 'select')),
  options      jsonb,                       -- [{value,label}] for select
  unit         text,
  required     boolean not null default false,
  filterable   boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (category_id, field_key)
);
create index if not exists category_attributes_cat_idx
  on public.category_attributes(category_id, sort_order);

drop trigger if exists _touch_category_attributes on public.category_attributes;
create trigger _touch_category_attributes before update on public.category_attributes
  for each row execute function public._touch_updated_at();

-- ── RLS: the catalog is public, only admins write it ────────────────────────
alter table public.categories          enable row level security;
alter table public.category_attributes enable row level security;

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select using (is_active or public.is_admin());

drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists category_attributes_public_read on public.category_attributes;
create policy category_attributes_public_read on public.category_attributes
  for select using (true);

drop policy if exists category_attributes_admin_write on public.category_attributes;
create policy category_attributes_admin_write on public.category_attributes
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.categories, public.category_attributes to anon, authenticated;
grant all    on public.categories, public.category_attributes to service_role;

-- ── Seed: the two branches of the catalog ───────────────────────────────────
insert into public.categories (slug, label_fr, label_ar, kind, icon, sort_order) values
  ('vehicules',        'Véhicules',          'مركبات',        'vehicle', 'car',   10),
  ('pieces-rechange',  'Pièces de rechange', 'قطع غيار',      'part',    'wrench', 20)
on conflict (slug) do nothing;

insert into public.categories (parent_id, slug, label_fr, label_ar, kind, icon, sort_order)
select p.id, v.slug, v.label_fr, v.label_ar, 'vehicle', v.icon, v.sort_order
  from (values
    ('voitures',    'Voitures',    'سيارات',   'car',    10),
    ('utilitaires', 'Utilitaires', 'نفعية',    'truck',  20),
    ('motos',       'Motos',       'دراجات',   'bike',   30),
    ('camions',     'Camions',     'شاحنات',   'truck',  40),
    ('engins',      'Engins',      'آليات',    'tractor', 50)
  ) as v(slug, label_fr, label_ar, icon, sort_order)
  cross join (select id from public.categories where slug = 'vehicules') p
on conflict (slug) do nothing;

insert into public.categories (parent_id, slug, label_fr, label_ar, kind, icon, sort_order)
select p.id, v.slug, v.label_fr, v.label_ar, 'part', v.icon, v.sort_order
  from (values
    ('moteur',            'Moteur',                    'محرك',        'engine',  10),
    ('transmission',      'Boîte & transmission',      'علبة السرعة', 'cog',     20),
    ('freinage',          'Freinage',                  'فرملة',       'disc',    30),
    ('suspension',        'Suspension & direction',    'تعليق',       'spring',  40),
    ('electricite',       'Électricité & batterie',    'كهرباء',      'battery', 50),
    ('carrosserie',       'Carrosserie & optique',     'هيكل',        'car',     60),
    ('interieur',         'Intérieur',                 'داخلية',      'seat',    70),
    ('pneus-jantes',      'Pneus & jantes',            'عجلات',       'wheel',   80),
    ('filtration',        'Filtration & entretien',    'صيانة',       'filter',  90),
    ('accessoires',       'Accessoires',               'إكسسوارات',   'plus',   100)
  ) as v(slug, label_fr, label_ar, icon, sort_order)
  cross join (select id from public.categories where slug = 'pieces-rechange') p
on conflict (slug) do nothing;

-- ── Seed: vehicle attributes, lifted from the catalog the admin already
--    curated for cars (property_attribute_kinds, 'sedan' is the canonical set)
--    so nothing they configured is lost. ──────────────────────────────────────
insert into public.category_attributes
  (category_id, field_key, label, data_type, options, unit, required, filterable, sort_order)
select c.id, k.field_key, k.label, k.data_type, k.options, k.unit, k.required,
       k.field_key in ('make', 'model', 'year', 'fuel', 'transmission', 'mileage'),
       k.sort_order
  from public.property_attribute_kinds k
  cross join public.categories c
 where k.property_type = 'sedan'
   and c.slug in ('voitures', 'utilitaires', 'motos', 'camions', 'engins')
on conflict (category_id, field_key) do nothing;

-- ── Seed: part attributes. These are new — a part is described by what it IS
--    and what it FITS, and the fitment half lives in its own table (0154). ────
insert into public.category_attributes
  (category_id, field_key, label, data_type, options, unit, required, filterable, sort_order)
select c.id, a.field_key, a.label, a.data_type, a.options::jsonb, a.unit, a.required, a.filterable, a.sort_order
  from (values
    ('brand',     'Marque',            'text',   null, null, true,  true,  10),
    ('reference', 'Référence (OEM)',   'text',   null, null, false, true,  20),
    ('condition', 'État',              'select',
       '[{"value":"new","label":"Neuf"},{"value":"used","label":"Occasion"},{"value":"refurbished","label":"Reconditionné"}]',
       null, true, true, 30),
    ('warranty_months', 'Garantie',    'number', null, 'mois', false, false, 40),
    ('quantity',  'Quantité disponible', 'number', null, null, false, false, 50)
  ) as a(field_key, label, data_type, options, unit, required, filterable, sort_order)
  cross join public.categories c
 where c.kind = 'part' and c.parent_id is not null
on conflict (category_id, field_key) do nothing;

notify pgrst, 'reload schema';
