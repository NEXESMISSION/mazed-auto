-- ============================================================
-- Mazed Auto — make remaining features real
-- (storage bucket, auto-bid, rating-after-deal trigger, KYC trust bump)
-- Safe to run repeatedly.
-- ============================================================

-- 1) Storage bucket for auction media (public read)
insert into storage.buckets (id, name, public)
values ('auction-media', 'auction-media', true)
on conflict (id) do update set public = true;

drop policy if exists "auction_media_public_read" on storage.objects;
drop policy if exists "auction_media_owner_write" on storage.objects;
drop policy if exists "auction_media_owner_delete" on storage.objects;

-- Anyone can read
create policy "auction_media_public_read"
on storage.objects for select
using (bucket_id = 'auction-media');

-- Authenticated users can upload only inside their own folder: <user_id>/...
create policy "auction_media_owner_write"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'auction-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "auction_media_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'auction-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 2) Auto-bid table
create table if not exists public.auto_bids (
  id          uuid primary key default gen_random_uuid(),
  auction_id  uuid not null references public.auctions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  max_amount  numeric not null check (max_amount > 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (auction_id, user_id)
);

create index if not exists auto_bids_auction_idx on public.auto_bids (auction_id, is_active);

alter table public.auto_bids enable row level security;
drop policy if exists "auto_bids_owner" on public.auto_bids;
create policy "auto_bids_owner" on public.auto_bids
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3) After-bid trigger that places counter-bids for the highest active auto-bidder
create or replace function public.handle_auto_bid_after()
returns trigger language plpgsql security definer as $$
declare
  v_auction record;
  v_top_auto record;
  v_next numeric;
begin
  select status, current_price, bid_increment, seller_id, end_time
    into v_auction
    from public.auctions where id = new.auction_id;

  if v_auction.status not in ('active','ending') then return new; end if;
  if now() >= v_auction.end_time then return new; end if;

  -- Find the highest active auto-bid that:
  --   - is not from the user who just placed this bid
  --   - is not from the seller
  --   - has enough budget for at least the next legal bid
  select user_id, max_amount into v_top_auto
  from public.auto_bids
  where auction_id = new.auction_id
    and is_active = true
    and user_id <> v_auction.seller_id
    and user_id <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and max_amount >= v_auction.current_price + v_auction.bid_increment
  order by max_amount desc, created_at asc
  limit 1;

  if v_top_auto.user_id is null then return new; end if;

  v_next := least(v_top_auto.max_amount, v_auction.current_price + v_auction.bid_increment);
  if v_next < v_auction.current_price + v_auction.bid_increment then return new; end if;

  -- Recursive: this insert fires handle_new_bid (validates, updates auction)
  -- and then handle_auto_bid_after again. We swallow exceptions so the
  -- ORIGINAL transaction commits even if the auto chain fails partway.
  begin
    insert into public.bids (auction_id, user_id, bidder_label, amount, is_auto_bid)
    values (
      new.auction_id,
      v_top_auto.user_id,
      'Auto-Bid',
      v_next,
      true
    );
  exception when others then
    null;
  end;

  return new;
end; $$;

drop trigger if exists trg_auto_bid_after on public.bids;
create trigger trg_auto_bid_after
after insert on public.bids
for each row execute function public.handle_auto_bid_after();

-- 4) Rating-after-deal: a buyer can rate the seller AFTER they've paid
--    the final payment. Enforced via a check trigger.
create or replace function public.require_purchase_before_rating()
returns trigger language plpgsql security definer as $$
declare
  v_paid int;
  v_top_user uuid;
  v_seller uuid;
begin
  -- We need an auction context: the buyer rated the seller for which auction?
  -- We pass it via a separate column? Simpler: let the app set seller_id
  -- and we just verify a final_payment from the rater exists for any auction
  -- where the seller is this seller.
  if new.buyer_label is null or new.seller_id is null then
    return new;
  end if;

  -- Allow demo seed inserts without auth context
  if auth.uid() is null then return new; end if;

  select count(*) into v_paid
  from public.transactions t
  join public.auctions a on a.id = t.auction_id
  where t.user_id = auth.uid()
    and t.type = 'final_payment'
    and t.status = 'completed'
    and a.seller_id = new.seller_id;

  if v_paid = 0 then
    raise exception 'NO_COMPLETED_PURCHASE';
  end if;

  return new;
end; $$;

drop trigger if exists trg_rating_check on public.seller_ratings;
create trigger trg_rating_check
before insert on public.seller_ratings
for each row execute function public.require_purchase_before_rating();

-- 5) Recompute seller average rating + count after every new rating
create or replace function public.recompute_seller_rating()
returns trigger language plpgsql security definer as $$
declare
  v_avg numeric(3,2);
  v_count int;
begin
  select round(avg(rating)::numeric, 2), count(*)
    into v_avg, v_count
  from public.seller_ratings
  where seller_id = new.seller_id;

  update public.sellers
     set rating_average = coalesce(v_avg, 0),
         rating_count = v_count,
         trust_score = least(500, trust_score + 5)
   where id = new.seller_id;

  return new;
end; $$;

drop trigger if exists trg_rating_recompute on public.seller_ratings;
create trigger trg_rating_recompute
after insert on public.seller_ratings
for each row execute function public.recompute_seller_rating();

-- 6) When a seller passes KYC (admin flips verified_kyc to true), bump trust_score
--    once. Only fires on the false → true transition.
create or replace function public.handle_seller_kyc_change()
returns trigger language plpgsql security definer as $$
begin
  if new.verified_kyc = true and (old.verified_kyc is distinct from true) then
    update public.sellers
       set trust_score = greatest(trust_score, 80)
     where id = new.id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_seller_kyc on public.sellers;
create trigger trg_seller_kyc
after update of verified_kyc on public.sellers
for each row execute function public.handle_seller_kyc_change();
