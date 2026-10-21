-- ============================================================================
-- An annonce belongs to a person, and may also belong to their shop.
--
--   shop_id        NULL = a personal annonce, as every annonce was until now.
--                  Set = it is published by the shop, shows on the shop's page
--                  AND in the public catalogue, and counts against the shop's
--                  quota instead of the person's.
--   listing_type   the brief's three activities: vente_auto, location_auto,
--                  pieces_auto. It is the quota bucket and, for a shop, must
--                  match the shop's activity.
--   price_unit     'total' for a sale, 'day' for a rental. Kept as a column
--                  because the catalogue has to sort and label it.
--   paused_*       why and since when an annonce is 'paused' (0186).
--
-- Nothing existing changes meaning. Every current annonce stays personal
-- (shop_id NULL), keeps its status, its dates and the duration it paid for.
-- The only rows written are the 19 spare-part annonces, whose `listing_type`
-- is set from their category — with `updated_at` left as it was.
--
-- `listing_type` and `shop_id` are NOT granted to authenticated: since 0183 a
-- seller's token writes content, and which quota an annonce draws on is not
-- content. The routes set them, and `_listings_type_consistency` checks them
-- whoever writes.
-- ============================================================================

alter table public.listings
  add column if not exists shop_id       uuid references public.shops(id) on delete restrict,
  add column if not exists listing_type  text not null default 'vente_auto',
  add column if not exists price_unit    text not null default 'total',
  add column if not exists paused_reason text,
  add column if not exists paused_at     timestamptz;

alter table public.listings drop constraint if exists listings_listing_type_check;
alter table public.listings add constraint listings_listing_type_check
  check (listing_type in ('vente_auto', 'location_auto', 'pieces_auto'));

alter table public.listings drop constraint if exists listings_price_unit_check;
alter table public.listings add constraint listings_price_unit_check
  check (price_unit in ('total', 'day'));

-- Compared as text on purpose: an enum value cannot be used in the transaction
-- that adds it, and this keeps 0187 valid whether or not 0186 has committed yet
-- (a rehearsal runs them together, then rolls back).
alter table public.listings drop constraint if exists listings_paused_has_reason;
alter table public.listings add constraint listings_paused_has_reason
  check (status::text <> 'paused' or paused_reason is not null);

create index if not exists listings_shop_idx
  on public.listings (shop_id, status) where shop_id is not null;
create index if not exists listings_seller_type_idx
  on public.listings (seller_id, listing_type, status) where shop_id is null;

-- Parts take their type from their category. The touch trigger is held off so
-- this bookkeeping does not look like 19 sellers editing their annonces today.
alter table public.listings disable trigger _touch_listings;
update public.listings l
   set listing_type = 'pieces_auto'
  from public.categories c
 where c.id = l.category_id
   and c.kind = 'part'
   and l.listing_type <> 'pieces_auto';
alter table public.listings enable trigger _touch_listings;

grant select (shop_id, listing_type, price_unit) on public.listings to anon, authenticated;
grant select (paused_reason, paused_at) on public.listings to authenticated;

-- ── Consistency, whoever writes ───────────────────────────────────────────────

create or replace function public._listings_type_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind     text;
  v_activity text;
begin
  if tg_op = 'UPDATE'
     and new.category_id  is not distinct from old.category_id
     and new.listing_type is not distinct from old.listing_type
     and new.shop_id      is not distinct from old.shop_id
     and new.seller_id    is not distinct from old.seller_id
     and new.price_unit   is not distinct from old.price_unit then
    return new;   -- nothing this trigger is about has changed
  end if;

  select kind into v_kind from public.categories where id = new.category_id;

  -- The category decides part vs vehicle; nobody files a brake pad as a car.
  if v_kind = 'part' then
    new.listing_type := 'pieces_auto';
  elsif new.listing_type = 'pieces_auto' then
    new.listing_type := 'vente_auto';
  end if;

  new.price_unit := case when new.listing_type = 'location_auto' then 'day' else 'total' end;

  if new.listing_type = 'location_auto' and new.shop_id is null then
    raise exception 'rental_requires_shop'
      using errcode = 'P0001', hint = 'Renting out vehicles is a professional activity: publish it from a location shop.';
  end if;

  if new.shop_id is not null then
    select activity_type into v_activity from public.shops where id = new.shop_id;
    if v_activity is null then
      raise exception 'shop_not_found' using errcode = 'P0002';
    end if;
    if v_activity <> new.listing_type then
      raise exception 'shop_activity_mismatch'
        using errcode = 'P0001',
              hint = format('This shop publishes %s annonces, not %s.', v_activity, new.listing_type);
    end if;
    if not exists (
      select 1 from public.shop_members m
       where m.shop_id = new.shop_id and m.user_id = new.seller_id
    ) then
      raise exception 'not_shop_member'
        using errcode = 'P0001', hint = 'Only a member of the shop can publish in its name.';
    end if;
  end if;

  return new;
end;
$$;

-- BEFORE triggers fire in name order. The `0` makes this one run first, so
-- every later trigger — the quota check (0189) above all — sees the corrected
-- `listing_type`, not whatever the writer sent.
drop trigger if exists _listings_0_type_consistency on public.listings;
create trigger _listings_0_type_consistency
  before insert or update on public.listings
  for each row execute function public._listings_type_consistency();

notify pgrst, 'reload schema';
