-- ============================================================
-- Mazed Auto — Seller decision window when reserve not met (3 days)
-- Safe to run repeatedly.
-- ============================================================

-- 1) Status enum: add 'pending_seller_decision'
alter table public.auctions drop constraint if exists auctions_status_check;
alter table public.auctions add constraint auctions_status_check
  check (status in (
    'scheduled','active','ending','ended','cancelled',
    'reserve_not_met','pending_review','pending_seller_decision'
  ));

-- 2) Deadline column (only set while pending_seller_decision)
alter table public.auctions
  add column if not exists reserve_decision_deadline timestamptz;

-- 3) When the cron / read-time sweep ends an auction:
--    - no bids                   → cancelled
--    - reserve hit (or no reserve) → ended (finalize_auction notifies winner + losers)
--    - reserve missed              → pending_seller_decision (NEW), deadline = +3 days, notify seller
create or replace function public.end_expired_auctions()
returns void language plpgsql security definer as $$
declare
  r record;
  v_make text; v_model text; v_year int;
  v_seller uuid;
  v_high_bid numeric;
  v_reserve numeric;
begin
  for r in
    select id from public.auctions
    where status in ('active','ending') and end_time <= now()
  loop
    select make, model, year, seller_id, current_price, reserve_price
      into v_make, v_model, v_year, v_seller, v_high_bid, v_reserve
      from public.auctions where id = r.id;

    if (select total_bids from public.auctions where id = r.id) = 0 then
      update public.auctions set status = 'cancelled' where id = r.id;

    elsif v_reserve is null or v_high_bid >= v_reserve then
      update public.auctions set status = 'ended' where id = r.id;
      perform public.finalize_auction(r.id);

    else
      -- Reserve missed → seller decides within 3 days
      update public.auctions
         set status = 'pending_seller_decision',
             reserve_decision_deadline = now() + interval '3 days'
       where id = r.id;

      if v_seller is not null then
        insert into public.notifications (user_id, auction_id, kind, title, body)
        values (
          v_seller,
          r.id,
          'reminder',
          'Votre enchère nécessite votre décision',
          v_make || ' ' || v_model || ' ' || v_year ||
            ' — Enchère terminée au prix de ' || v_high_bid::text ||
            ' DT, le Prix de réserve n''a pas été atteint. Vous avez 3 jours pour accepter ou refuser l''offre.'
        );
      end if;
    end if;
  end loop;

  -- 4) Auto-expire seller decisions: any pending decision past its deadline
  --    becomes reserve_not_met (deposits get refunded via finalize_auction below)
  for r in
    select id from public.auctions
    where status = 'pending_seller_decision'
      and reserve_decision_deadline is not null
      and reserve_decision_deadline <= now()
  loop
    update public.auctions
       set status = 'reserve_not_met',
           reserve_decision_deadline = null
     where id = r.id;
    perform public.finalize_auction(r.id);
  end loop;
end; $$;

-- 5) Seller accepts the highest bid even though reserve wasn't met
create or replace function public.seller_accept_under_reserve(p_auction_id uuid)
returns void language plpgsql security definer as $$
declare
  v_seller uuid;
  v_status text;
begin
  select seller_id, status
    into v_seller, v_status
    from public.auctions where id = p_auction_id for update;

  if v_seller is null then raise exception 'AUCTION_NOT_FOUND'; end if;
  if auth.uid() <> v_seller then raise exception 'NOT_SELLER'; end if;
  if v_status <> 'pending_seller_decision' then raise exception 'NOT_PENDING'; end if;

  update public.auctions
     set status = 'ended',
         reserve_met = true,
         reserve_decision_deadline = null
   where id = p_auction_id;

  perform public.finalize_auction(p_auction_id);
end; $$;

-- 6) Seller rejects → auction goes to reserve_not_met, all deposits refunded
create or replace function public.seller_reject_under_reserve(p_auction_id uuid)
returns void language plpgsql security definer as $$
declare
  v_seller uuid;
  v_status text;
begin
  select seller_id, status
    into v_seller, v_status
    from public.auctions where id = p_auction_id for update;

  if v_seller is null then raise exception 'AUCTION_NOT_FOUND'; end if;
  if auth.uid() <> v_seller then raise exception 'NOT_SELLER'; end if;
  if v_status <> 'pending_seller_decision' then raise exception 'NOT_PENDING'; end if;

  update public.auctions
     set status = 'reserve_not_met',
         reserve_decision_deadline = null
   where id = p_auction_id;

  perform public.finalize_auction(p_auction_id);
end; $$;
