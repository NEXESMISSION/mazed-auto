-- ============================================================================
-- The seller's attestation, on LISTINGS.
--
-- 0147/0151 gave `properties` the attestation columns and the trigger that
-- makes them mean something. `listings` (0154) copied the columns but not the
-- trigger — so /api/annonces was writing the version string and nothing was
-- stamping the moment. Caught by the Phase 3 end-to-end run:
--
--     1 draft + server-stamped attestation: {"stamped": false}
--
-- A signature with no timestamp is not evidence of anything, which is the whole
-- reason the attestation exists.
--
-- Unlike 0151 (held back because an older deploy would fail every property
-- insert), this one is safe to apply immediately: `listings` is new, nothing
-- outside the v3 code path writes to it, and that path sends the version.
-- ============================================================================

create or replace function public._listings_attestation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nothing enters review unsigned. Checked on the transition so an admin
  -- moving a signed row between states is never blocked.
  if new.status in ('pending_review', 'published')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and new.seller_attestation_version is null then
    raise exception 'seller_attestation_required'
      using errcode = 'P0001',
            hint = 'The seller must accept the accuracy statement before submitting.';
  end if;

  -- The server clock owns the timestamp; the client only ever sends a version.
  if tg_op = 'INSERT' then
    if new.seller_attestation_version is not null then
      new.seller_attestation_at := now();
    end if;
  elsif new.seller_attestation_version is distinct from old.seller_attestation_version then
    new.seller_attestation_at :=
      case when new.seller_attestation_version is null then null else now() end;
  else
    new.seller_attestation_at := old.seller_attestation_at;
  end if;

  return new;
end;
$$;

drop trigger if exists _listings_attestation on public.listings;
create trigger _listings_attestation
  before insert or update on public.listings
  for each row execute function public._listings_attestation();

notify pgrst, 'reload schema';
