-- ============================================================================
-- Diagnostic Mazed follows the catalog onto `listings`.
--
-- 0148 keyed the diagnostic to `property_id`, because that was the only object
-- a car could be. v3 listings are not properties — so as it stands, the sheet
-- behind the "Vérifié et approuvé" badge CANNOT BE ATTACHED TO ANYTHING A
-- SELLER PUBLISHES TODAY. With KYC gone, the diagnostic and the paid badge are
-- the two things that separate us from a free listings board, so a diagnostic
-- that cannot reach the catalog is not a small gap.
--
-- Both columns are nullable and exactly one must be set: v2 rows keep pointing
-- at their property until Phase 6b removes them, v3 rows point at a listing,
-- and nothing can point at both and disagree with itself.
-- ============================================================================

alter table public.vehicle_diagnostics
  add column if not exists listing_id uuid references public.listings(id) on delete cascade;

alter table public.vehicle_diagnostics
  alter column property_id drop not null;

-- The old unique(property_id) stays for v2 rows; listings get their own.
create unique index if not exists vehicle_diagnostics_listing_uniq
  on public.vehicle_diagnostics(listing_id) where listing_id is not null;

create index if not exists vehicle_diagnostics_listing_idx
  on public.vehicle_diagnostics(listing_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vehicle_diagnostics_one_subject') then
    alter table public.vehicle_diagnostics
      add constraint vehicle_diagnostics_one_subject
      check (num_nonnulls(property_id, listing_id) = 1);
  end if;
end $$;

comment on table public.vehicle_diagnostics is
  'The inspection sheet behind the "Vérifié et approuvé" badge, written by us in the admin. Points at a listing (v3) or a property (v2, retiring). Public read only while status = published.';

notify pgrst, 'reload schema';
