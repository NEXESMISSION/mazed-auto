-- ============================================================================
-- A welcome allowance: the first N publications a seller makes are free.
--
-- Switched on and sized from the admin console, because the whole point is to
-- be able to turn it up while the catalogue is thin and turn it off once it is
-- not. Nothing about it is compiled in.
--
-- WHY A COLUMN AND NOT A COUNT OF LISTINGS. "How many free ones has this seller
-- had" cannot be derived after the fact: a listing that was free because it is
-- a spare part, one that was free because an admin published it by hand, and
-- one that used this allowance are indistinguishable by the time you look —
-- all three are simply listings with no payment attached. So the waiver records
-- ITSELF, on the row it applied to. That also means lowering the allowance
-- later never retroactively bills anyone, and the admin can see exactly which
-- listings were given away.
--
-- WHY AN RPC AND NOT A CHECK IN THE ROUTE. Two submits arriving together would
-- both read "1 used of 3" and both take the second slot. The count and the
-- claim have to happen under one lock. `pg_advisory_xact_lock` on the seller id
-- serialises just that seller, so two different sellers never wait on each
-- other — the same shape `consume_listing_credit` already uses.
--
-- WHERE IT SITS IN THE FLOW: pack credit → category price → THIS → payment. It
-- is deliberately after the price is resolved, so a category that is already
-- free (spare parts) never burns an allowance the seller could have spent on a
-- car.
-- ============================================================================

alter table public.listings
  add column if not exists fee_waived_reason text;

comment on column public.listings.fee_waived_reason is
  'Why this listing was published without payment. null = it was paid for, or the category is free. ''welcome'' = it consumed the free-listing allowance. The waiver is recorded here because it cannot be reconstructed afterwards.';

-- Counting a seller's used allowance is the hot path of the function below.
create index if not exists listings_fee_waived_seller_idx
  on public.listings (seller_id)
  where fee_waived_reason is not null;

insert into public.app_settings (key, value, description)
values (
  'free_listings',
  '{"enabled": false, "count": 3}'::jsonb,
  'Allocation de bienvenue : les N premières publications payantes d''un vendeur sont offertes. enabled=false pour facturer dès la première.'
)
on conflict (key) do nothing;

-- ── Claim one ───────────────────────────────────────────────────────────────
create or replace function public.consume_free_listing(
  p_listing_id uuid,
  p_seller_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg     jsonb;
  v_enabled boolean;
  v_allowed int;
  v_used    int;
begin
  select value into v_cfg from public.app_settings where key = 'free_listings';

  v_enabled := coalesce((v_cfg->>'enabled')::boolean, false);
  v_allowed := greatest(coalesce((v_cfg->>'count')::int, 0), 0);

  if not v_enabled or v_allowed = 0 then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;

  -- Serialise this seller, and only this seller, for the rest of the
  -- transaction. Without it two concurrent submits both read the same count.
  perform pg_advisory_xact_lock(hashtextextended(p_seller_id::text, 0));

  -- Already waived on this very listing: a retried submit must be idempotent
  -- rather than spend a second slot on the same annonce.
  if exists (
    select 1 from public.listings
     where id = p_listing_id and seller_id = p_seller_id
       and fee_waived_reason = 'welcome'
  ) then
    select count(*) into v_used
      from public.listings
     where seller_id = p_seller_id and fee_waived_reason = 'welcome';
    return jsonb_build_object('ok', true, 'remaining', greatest(v_allowed - v_used, 0),
                              'allowance', v_allowed, 'replayed', true);
  end if;

  select count(*) into v_used
    from public.listings
   where seller_id = p_seller_id and fee_waived_reason = 'welcome';

  if v_used >= v_allowed then
    return jsonb_build_object('ok', false, 'reason', 'exhausted',
                              'allowance', v_allowed, 'used', v_used);
  end if;

  update public.listings
     set fee_waived_reason = 'welcome',
         updated_at        = now()
   where id = p_listing_id and seller_id = p_seller_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'remaining', greatest(v_allowed - v_used - 1, 0),
                            'allowance', v_allowed, 'replayed', false);
end;
$$;

revoke all on function public.consume_free_listing(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_free_listing(uuid, uuid) to service_role;

-- ── Report one, without claiming ────────────────────────────────────────────
-- What the publish form needs to say "your next listing is free" BEFORE the
-- seller commits to anything. Read-only on purpose: showing the offer must
-- never be what consumes it.
create or replace function public.free_listing_status(p_seller_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg     jsonb;
  v_enabled boolean;
  v_allowed int;
  v_used    int;
begin
  select value into v_cfg from public.app_settings where key = 'free_listings';
  v_enabled := coalesce((v_cfg->>'enabled')::boolean, false);
  v_allowed := greatest(coalesce((v_cfg->>'count')::int, 0), 0);

  if not v_enabled or v_allowed = 0 then
    return jsonb_build_object('enabled', false, 'remaining', 0, 'allowance', v_allowed);
  end if;

  select count(*) into v_used
    from public.listings
   where seller_id = p_seller_id and fee_waived_reason = 'welcome';

  return jsonb_build_object('enabled', true, 'allowance', v_allowed,
                            'used', v_used, 'remaining', greatest(v_allowed - v_used, 0));
end;
$$;

revoke all on function public.free_listing_status(uuid) from public, anon;
grant execute on function public.free_listing_status(uuid) to service_role, authenticated;

notify pgrst, 'reload schema';
