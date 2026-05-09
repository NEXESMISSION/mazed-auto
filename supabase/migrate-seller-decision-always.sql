-- ============================================================
-- Mazed Auto — Seller decision is REQUIRED for every ended auction
-- (not only when the reserve isn't met).
--
-- Per platform requirement: the seller is never auto-bound to sell to
-- the highest bidder. Every auction with at least one bid moves to
-- `pending_seller_decision` when its end_time passes; the seller has
-- 3 days to accept (winner is finalised) or reject (deposits refunded).
--
-- Safe to run repeatedly. Depends on migrate-seller-decision.sql.
-- ============================================================

-- 1) Reshape end_expired_auctions: ALL bids → pending_seller_decision.
create or replace function public.end_expired_auctions()
returns void language plpgsql security definer as $$
declare
  r record;
  v_make text; v_model text; v_year int;
  v_seller uuid;
  v_high_bid numeric;
  v_reserve numeric;
  v_total_bids int;
  v_msg_body text;
begin
  for r in
    select id from public.auctions
    where status in ('active','ending') and end_time <= now()
  loop
    select make, model, year, seller_id, current_price, reserve_price, total_bids
      into v_make, v_model, v_year, v_seller, v_high_bid, v_reserve, v_total_bids
      from public.auctions where id = r.id;

    if v_total_bids = 0 then
      update public.auctions set status = 'cancelled' where id = r.id;
    else
      -- Every auction with bids needs the seller's go-ahead, reserve
      -- met or not. Preserves the existing 3-day decision window.
      update public.auctions
         set status = 'pending_seller_decision',
             reserve_decision_deadline = now() + interval '3 days'
       where id = r.id;

      if v_seller is not null then
        v_msg_body := v_make || ' ' || v_model || ' ' || v_year ||
                      ' — Enchère terminée à ' || v_high_bid::text || ' DT.';
        if v_reserve is not null and v_high_bid < v_reserve then
          v_msg_body := v_msg_body ||
            ' Le prix de réserve n''a pas été atteint. ';
        else
          v_msg_body := v_msg_body || ' ';
        end if;
        v_msg_body := v_msg_body ||
          'Vous avez 3 jours pour accepter ou refuser l''offre du plus haut enchérisseur.';

        insert into public.notifications (user_id, auction_id, kind, title, body)
        values (
          v_seller,
          r.id,
          'reminder',
          'Votre enchère nécessite votre décision',
          v_msg_body
        );
      end if;
    end if;
  end loop;

  -- Auto-expire decisions past their deadline → reject (refund deposits).
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

-- 2) seller_accept_offer — accept the highest bid. Works whether the
--    reserve was met or not. Replaces the older reserve-only variant
--    semantically; the reserve-only RPCs still exist as aliases.
create or replace function public.seller_accept_offer(p_auction_id uuid)
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

-- 3) seller_reject_offer — reject the offer. Auction goes to
--    reserve_not_met regardless of whether the reserve was actually
--    met (semantic re-use of the existing terminal state). All
--    deposits get refunded via finalize_auction.
create or replace function public.seller_reject_offer(p_auction_id uuid)
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

-- 4) Keep the old reserve-only RPCs as compatibility aliases that
--    forward to the new generic ones, so any deployed client that
--    still calls the older names keeps working.
create or replace function public.seller_accept_under_reserve(p_auction_id uuid)
returns void language plpgsql security definer as $$
begin
  perform public.seller_accept_offer(p_auction_id);
end; $$;

create or replace function public.seller_reject_under_reserve(p_auction_id uuid)
returns void language plpgsql security definer as $$
begin
  perform public.seller_reject_offer(p_auction_id);
end; $$;

grant execute on function public.seller_accept_offer(uuid) to authenticated;
grant execute on function public.seller_reject_offer(uuid) to authenticated;
grant execute on function public.seller_accept_under_reserve(uuid) to authenticated;
grant execute on function public.seller_reject_under_reserve(uuid) to authenticated;
