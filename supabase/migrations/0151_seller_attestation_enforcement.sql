-- ============================================================================
-- SELLER ATTESTATION, part 2 — make the columns from 0147 mean something.
--
-- ⚠ APPLY ONLY ONCE THE BUILD THAT SENDS `seller_attestation_version` IS
--   DEPLOYED. Under an older build this trigger refuses every new listing,
--   because nothing fills the column. 0147 (the columns) is safe on any build;
--   this file is not.
--
--   * the CLIENT may only send the version string it displayed;
--   * the SERVER stamps the timestamp (never trust a client clock);
--   * a row cannot ENTER 'pending_review' unsigned, so the guarantee does not
--     depend on the form being the only writer.
--
-- Existing listings are grandfathered as unsigned (null). They only need a
-- signature the next time they are submitted for review.
-- ============================================================================

create or replace function public._require_seller_attestation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A listing may not enter review unsigned. Checked on the TRANSITION, so an
  -- admin moving an already-signed row between states is never blocked, and a
  -- legacy row is only stopped when its owner re-submits it.
  if new.status = 'pending_review'
     and (tg_op = 'INSERT' or old.status is distinct from 'pending_review')
     and new.seller_attestation_version is null then
    raise exception 'seller_attestation_required'
      using errcode = 'P0001',
            hint = 'The seller must accept the accuracy statement before submitting.';
  end if;

  -- Server clock owns the timestamp. Stamp it whenever the signature appears
  -- or changes; clear it if the version is ever cleared.
  if tg_op = 'INSERT' then
    if new.seller_attestation_version is not null then
      new.seller_attestation_at := now();
    end if;
  elsif new.seller_attestation_version is distinct from old.seller_attestation_version then
    new.seller_attestation_at :=
      case when new.seller_attestation_version is null then null else now() end;
  else
    -- Unchanged signature → keep the original moment, whatever the client sent.
    new.seller_attestation_at := old.seller_attestation_at;
  end if;

  return new;
end;
$$;

drop trigger if exists _require_seller_attestation on public.properties;
create trigger _require_seller_attestation
  before insert or update on public.properties
  for each row execute function public._require_seller_attestation();

notify pgrst, 'reload schema';
