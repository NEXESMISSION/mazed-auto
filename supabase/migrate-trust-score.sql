-- Trust Score event triggers per PLAN §15.1.
--
-- Existing triggers already cover:
--   * KYC flip false→true bumps trust_score to ≥80 (handle_seller_kyc_change)
--   * Rating insert bumps +5 (recompute_seller_rating)
--
-- This migration adds:
--   1. Successful sale → +10 trust_score (capped) and +1 successful_deals
--   2. Tweak the rating bump so only 5-star earns the full +5 (cap +30 from
--      ratings) — other ratings earn smaller amounts so a 1-star doesn't help.
--
-- Apply with: psql ... -f migrate-trust-score.sql
-- (or paste into Supabase SQL editor.)

------------------------------------------------------------------
-- 1) Successful-sale trigger
------------------------------------------------------------------
create or replace function public.handle_final_payment()
returns trigger language plpgsql security definer as $$
declare
  v_seller_id uuid;
begin
  if new.type <> 'final_payment' or new.status <> 'completed' then
    return new;
  end if;
  if new.auction_id is null then
    return new;
  end if;

  -- Skip if we've already credited this auction (idempotent re-runs).
  if exists (
    select 1 from public.transactions t
    where t.auction_id = new.auction_id
      and t.type = 'final_payment'
      and t.status = 'completed'
      and t.id <> new.id
  ) then
    return new;
  end if;

  select seller_id into v_seller_id
  from public.auctions
  where id = new.auction_id;

  if v_seller_id is null then
    return new;
  end if;

  update public.sellers
     set successful_deals = successful_deals + 1,
         trust_score = least(500, trust_score + 10)
   where id = v_seller_id;

  return new;
end; $$;

drop trigger if exists trg_final_payment_trust on public.transactions;
create trigger trg_final_payment_trust
after insert on public.transactions
for each row execute function public.handle_final_payment();

------------------------------------------------------------------
-- 2) Rating bump scaled by stars (replaces the flat +5 in
--    recompute_seller_rating). Recomputes rating_average / rating_count
--    too so this stays a drop-in replacement.
------------------------------------------------------------------
create or replace function public.recompute_seller_rating()
returns trigger language plpgsql security definer as $$
declare
  v_avg numeric;
  v_count integer;
  v_bump integer;
begin
  select avg(rating)::numeric, count(*)::integer
    into v_avg, v_count
  from public.seller_ratings
  where seller_id = new.seller_id;

  -- Per PLAN §15.1, 5-star earns +5 (cap 30 from ratings; we cap globally
  -- at 500 instead of tracking source-specific caps). Lower ratings earn
  -- proportionally less, and 1-star is neutral so a single trolly review
  -- can't grief a seller.
  v_bump := case new.rating
    when 5 then 5
    when 4 then 3
    when 3 then 1
    else 0
  end;

  update public.sellers
     set rating_average = coalesce(v_avg, 0),
         rating_count = v_count,
         trust_score = least(500, trust_score + v_bump)
   where id = new.seller_id;

  return new;
end; $$;
