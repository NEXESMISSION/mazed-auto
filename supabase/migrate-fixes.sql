-- ============================================================
-- Mazed Auto — alignment fixes for PLAN
-- Safe to run repeatedly.
-- ============================================================

-- 1) Anti-sniping: PLAN §19 says LAST 2 MINUTES → +2 MIN.
--    Original migrate-bid-rules.sql used 5/5 by mistake.
--    Re-create handle_new_bid with the correct values, keeping every other rule.
create or replace function public.handle_new_bid()
returns trigger language plpgsql security definer as $$
declare
  v_status text;
  v_seller uuid;
  v_current numeric;
  v_increment numeric;
  v_end timestamptz;
  v_reserve numeric;
  v_make text; v_model text; v_year int;
  v_prev_bidder uuid;
  v_participants int;
  v_extended boolean := false;
begin
  select status, seller_id, current_price, bid_increment, end_time, reserve_price, make, model, year
    into v_status, v_seller, v_current, v_increment, v_end, v_reserve, v_make, v_model, v_year
  from public.auctions
  where id = new.auction_id
  for update;

  if not found then
    raise exception 'AUCTION_NOT_FOUND';
  end if;

  if v_status not in ('active', 'ending') then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;

  if now() >= v_end then
    raise exception 'AUCTION_ENDED';
  end if;

  if new.user_id is not null and new.user_id = v_seller then
    raise exception 'SELLER_CANNOT_BID';
  end if;

  if new.amount < v_current + v_increment then
    raise exception 'BID_TOO_LOW';
  end if;

  -- PLAN §19 anti-sniping: bids in the last 2 min push end_time +2 min.
  if v_end - now() <= interval '2 minutes' then
    v_end := v_end + interval '2 minutes';
    v_extended := true;
  end if;

  select count(distinct coalesce(user_id::text, bidder_label))
    into v_participants
  from public.bids
  where auction_id = new.auction_id;

  select user_id into v_prev_bidder
  from public.bids
  where auction_id = new.auction_id
    and id <> new.id
    and user_id is not null
  order by amount desc, placed_at desc
  limit 1;

  update public.auctions
     set current_price = new.amount,
         total_bids = total_bids + 1,
         total_participants = v_participants,
         reserve_met = (v_reserve is null or new.amount >= v_reserve),
         end_time = v_end,
         status = case when v_extended then 'ending' else status end
   where id = new.auction_id;

  if v_prev_bidder is not null and v_prev_bidder <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (
      v_prev_bidder,
      new.auction_id,
      'outbid',
      'Votre offre a été dépassée',
      v_make || ' ' || v_model || ' ' || v_year || ' — Prix actuel ' || new.amount::text || ' DT'
    );
  end if;

  return new;
end; $$;

drop trigger if exists trg_new_bid on public.bids;
create trigger trg_new_bid after insert on public.bids
for each row execute function public.handle_new_bid();


-- 2) Trust level should derive from trust_score (PLAN §15.3 tiers).
--    Trigger updates trust_level whenever trust_score changes.
create or replace function public.recompute_trust_level()
returns trigger language plpgsql security definer as $$
begin
  if new.trust_score is distinct from old.trust_score then
    new.trust_level := case
      when new.trust_score >= 251 then 'verified_pro'      when new.trust_score >= 151 then 'very_trusted'      when new.trust_score >=  81 then 'trusted'      when new.trust_score >=  31 then 'low'      else 'new'    end;
  end if;
  return new;
end; $$;

drop trigger if exists trg_trust_level_sync on public.sellers;
create trigger trg_trust_level_sync
before update of trust_score on public.sellers
for each row execute function public.recompute_trust_level();

-- One-shot backfill so existing rows show the right tier today.
update public.sellers
   set trust_level = case
     when trust_score >= 251 then 'verified_pro'     when trust_score >= 151 then 'very_trusted'     when trust_score >=  81 then 'trusted'     when trust_score >=  31 then 'low'     else 'new'   end
 where trust_level is distinct from case
     when trust_score >= 251 then 'verified_pro'     when trust_score >= 151 then 'very_trusted'     when trust_score >=  81 then 'trusted'     when trust_score >=  31 then 'low'     else 'new'   end;
