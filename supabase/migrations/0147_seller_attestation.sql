-- ============================================================================
-- SELLER ATTESTATION — the seller signs for the accuracy of their listing.
--
-- Every listing that goes to review now carries a sworn statement: the seller
-- certifies the information, photos and documents are exact and accepts sole
-- responsibility for anything false or misleading. Until now nothing on the
-- record said the seller had ever been told that, so a dispute over a rigged
-- odometer or a hidden accident came down to one word against another.
--
-- Two columns, and a trigger that makes them mean something:
--   * the CLIENT may only send the version string it displayed;
--   * the SERVER stamps the timestamp (never trust a client clock);
--   * a row cannot ENTER 'pending_review' without a version, so the guarantee
--     does not depend on the form being the only writer.
--
-- Existing listings are grandfathered as unsigned (null). They only need a
-- signature the next time they are submitted for review — which is what the
-- edit form now asks for.
-- ============================================================================

alter table public.properties
  add column if not exists seller_attestation_version text,
  add column if not exists seller_attestation_at      timestamptz;

comment on column public.properties.seller_attestation_version is
  'Version of the sworn accuracy statement the seller ticked (see SELLER_ATTESTATION_VERSION in src/components/sell/SellForm.tsx). Null = signed before this was required.';
comment on column public.properties.seller_attestation_at is
  'Server-stamped moment the seller signed. Set by _require_seller_attestation; never written by the client.';

create or replace function public._require_seller_attestation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A listing may not enter review unsigned. Checked on the transition, so an
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
