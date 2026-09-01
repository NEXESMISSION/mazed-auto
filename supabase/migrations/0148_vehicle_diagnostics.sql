-- ============================================================================
-- DIAGNOSTIC MAZED — what the "Vérifié et approuvé" badge actually means.
--
-- The badge is not a seller claim and not a third-party inspector's PDF: it is
-- OUR OWN diagnosis, written by the team in /admin/properties/<id>, with the
-- points checked, the notes, and the photos we took. A listing carries the
-- badge only while a diagnostic row exists AND is published — so the badge and
-- the evidence behind it can never drift apart.
--
-- Shape notes:
--   * ONE diagnostic per property (unique property_id). A re-check edits the
--     existing sheet rather than stacking rows nobody would reconcile.
--   * `sections` is jsonb, not a child table: it is a document written and read
--     as a whole, never queried field-by-field.
--       [{ "title": "Moteur",
--          "items": [{ "label": "Compression", "state": "ok|warn|bad",
--                      "note": "…" }] }]
--   * `photos` is jsonb: [{ "path": "<uid>/diag-….webp", "caption": "…" }],
--     paths in the PUBLIC `properties` bucket (0003) — an admin writes under
--     their own uid folder, everyone can read.
--   * draft vs published: the team can write a sheet across several sittings
--     without a half-finished diagnosis appearing under a car for sale.
-- ============================================================================

create table if not exists public.vehicle_diagnostics (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null unique references public.properties(id) on delete cascade,
  status         text not null default 'draft'
                   check (status in ('draft', 'published')),
  -- The verdict the badge renders. 'reserves' = approved but with findings the
  -- buyer must read; 'failed' = we checked it and it did NOT pass.
  verdict        text not null default 'approved'
                   check (verdict in ('approved', 'reserves', 'failed')),
  headline       text,
  summary        text,
  sections       jsonb not null default '[]'::jsonb,
  photos         jsonb not null default '[]'::jsonb,
  -- Who did the check, as shown to buyers ("Équipe Mazed", a technician name…),
  -- and when the car was physically seen — distinct from published_at.
  inspector_name text,
  inspected_at   timestamptz,
  published_at   timestamptz,
  updated_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists vehicle_diagnostics_property_idx
  on public.vehicle_diagnostics(property_id);
create index if not exists vehicle_diagnostics_published_idx
  on public.vehicle_diagnostics(status) where status = 'published';

drop trigger if exists _touch_vehicle_diagnostics on public.vehicle_diagnostics;
create trigger _touch_vehicle_diagnostics
  before update on public.vehicle_diagnostics
  for each row execute function public._touch_updated_at();

-- Keep published_at honest: stamped when the sheet goes public, cleared when
-- it is pulled back to draft. Never client-supplied.
create or replace function public._stamp_diagnostic_published()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' then
    if tg_op = 'INSERT' or old.status is distinct from 'published' then
      new.published_at := now();
    else
      new.published_at := old.published_at;
    end if;
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists _stamp_diagnostic_published on public.vehicle_diagnostics;
create trigger _stamp_diagnostic_published
  before insert or update on public.vehicle_diagnostics
  for each row execute function public._stamp_diagnostic_published();

-- ─── RLS: the world reads PUBLISHED sheets; only admins write ──────────────
alter table public.vehicle_diagnostics enable row level security;

drop policy if exists vehicle_diagnostics_public_read on public.vehicle_diagnostics;
create policy vehicle_diagnostics_public_read
  on public.vehicle_diagnostics for select
  using (status = 'published' or public.is_admin());

drop policy if exists vehicle_diagnostics_admin_write on public.vehicle_diagnostics;
create policy vehicle_diagnostics_admin_write
  on public.vehicle_diagnostics for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.vehicle_diagnostics to anon, authenticated;
grant all    on public.vehicle_diagnostics to service_role;

notify pgrst, 'reload schema';
