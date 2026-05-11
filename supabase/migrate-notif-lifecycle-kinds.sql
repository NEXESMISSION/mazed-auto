-- ============================================================
-- Mazed Auto — wire 3 more dormant notification kinds
--   - finalize_auction(reserve_not_met) → kind="reserve_not_met"
--   - finalize_auction(ended)            → kind="deposit_refunded" for losers
--   - forfeit_winner_deposit             → kind="deposit_forfeited" for forfeiter
--
-- Replaces the generic "lost" / "system" kinds with the v2 categories
-- so kindMeta in NotificationsList routes them correctly (round 16):
--   reserve_not_met   → AlertTriangle, /seller/auctions
--   deposit_refunded  → RefreshCcw,   /transactions
--   deposit_forfeited → AlertTriangle, /transactions
--
-- Safe to run repeatedly.
-- ============================================================

-- 1) finalize_auction — re-emit with the right kinds + refund alert -------
create or replace function public.finalize_auction(p_auction_id uuid)
returns void language plpgsql security definer as $$
declare
  v_winner uuid;
  v_winning_amount numeric;
  v_make text; v_model text; v_year int;
  v_status text;
  v_deadline_days int;
  v_deposit numeric;
begin
  select status, make, model, year, participation_deposit
    into v_status, v_make, v_model, v_year, v_deposit
    from public.auctions where id = p_auction_id;

  if v_status = 'ended' then
    select user_id, amount into v_winner, v_winning_amount
    from public.bids
    where auction_id = p_auction_id and user_id is not null
    order by amount desc, placed_at asc
    limit 1;

    if v_winner is not null then
      v_deadline_days := public.get_setting_num('auction.payment.deadline_days', 7)::int;
      update public.auctions
         set current_winner_id = v_winner,
             payment_deadline  = now() + make_interval(days => v_deadline_days)
       where id = p_auction_id;

      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (v_winner, p_auction_id, 'won',
              'Félicitations ! Vous avez gagné l''enchère',
              v_make || ' ' || v_model || ' ' || v_year || ' à ' || v_winning_amount::text
              || ' DT — complétez le paiement final dans les ' || v_deadline_days || ' jours');

      -- Losing bidders get "lost" + their refund row right after. The
      -- "lost" kind is the right category for the headline; the
      -- separate deposit_refunded notification gets emitted when the
      -- refund transaction lands.
      insert into public.notifications (user_id, auction_id, kind, title, body)
      select distinct user_id, p_auction_id, 'lost', 'Enchère terminée',
             v_make || ' ' || v_model || ' ' || v_year
             || ' — Vous n''avez pas gagné cette fois. Votre caution sera remboursée sous 24 heures.'
      from public.bids
      where auction_id = p_auction_id and user_id is not null and user_id <> v_winner;

      update public.transactions
         set status = 'completed', label = label || ' (remboursée)'
       where auction_id = p_auction_id
         and type = 'deposit'
         and direction = 'out'
         and user_id is not null
         and user_id <> v_winner;

      insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
      select 'TX-RF-' || substring(gen_random_uuid()::text from 1 for 8) || '-' || substring(b.id::text from 1 for 4),
             b.user_id,
             b.bidder_label,
             p_auction_id,
             'refund',
             'in',
             a.participation_deposit,
             'Remboursement caution — ' || a.make || ' ' || a.model || ' ' || a.year,
             'completed'
      from (select distinct on (user_id) user_id, bidder_label, id
              from public.bids
             where auction_id = p_auction_id and user_id is not null and user_id <> v_winner) b
      cross join public.auctions a
      where a.id = p_auction_id;

      -- Fire a dedicated deposit_refunded notification so the user gets a
      -- routable "your money is back" alert instead of relying on the
      -- "lost" headline (which doesn't point to /transactions).
      insert into public.notifications (user_id, auction_id, kind, title, body)
      select distinct user_id, p_auction_id, 'deposit_refunded',
             'Caution remboursée',
             'Votre caution de ' || v_deposit::text
               || ' DT pour ' || v_make || ' ' || v_model || ' ' || v_year
               || ' a été créditée.'
      from public.bids
      where auction_id = p_auction_id and user_id is not null and user_id <> v_winner;
    end if;

  elsif v_status = 'reserve_not_met' then
    -- Use the dedicated v2 kind. Routes to /seller/auctions via kindMeta
    -- which lands the user on a result banner instead of a generic
    -- "lost" tray entry.
    insert into public.notifications (user_id, auction_id, kind, title, body)
    select distinct user_id, p_auction_id, 'reserve_not_met',
           'Prix de réserve non atteint',
           v_make || ' ' || v_model || ' ' || v_year
           || ' — Vente annulée. Votre caution sera remboursée.'
    from public.bids where auction_id = p_auction_id and user_id is not null;

    insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
    select 'TX-RF-' || substring(gen_random_uuid()::text from 1 for 8) || '-' || substring(b.id::text from 1 for 4),
           b.user_id, b.bidder_label, p_auction_id, 'refund', 'in',
           a.participation_deposit,
           'Remboursement caution — ' || a.make || ' ' || a.model || ' ' || a.year,
           'completed'
    from (select distinct on (user_id) user_id, bidder_label, id
            from public.bids where auction_id = p_auction_id and user_id is not null) b
    cross join public.auctions a where a.id = p_auction_id;

    insert into public.notifications (user_id, auction_id, kind, title, body)
    select distinct user_id, p_auction_id, 'deposit_refunded',
           'Caution remboursée',
           'Votre caution de ' || v_deposit::text
             || ' DT pour ' || v_make || ' ' || v_model || ' ' || v_year
             || ' a été créditée.'
    from public.bids where auction_id = p_auction_id and user_id is not null;
  end if;
end; $$;


-- 2) forfeit_winner_deposit — use deposit_forfeited kind ------------------
-- Locate the forfeiter notification insert and re-categorise it. The
-- rest of the function is unchanged; we re-write the whole body so the
-- definition stays atomic.
create or replace function public.forfeit_winner_deposit(
  p_auction_id uuid,
  p_user_id    uuid,
  p_reason     text default 'voluntary'
) returns void language plpgsql security definer as $$
declare
  v_seller uuid;
  v_make text; v_model text; v_year int;
  v_deposit numeric;
  v_seller_share_pct numeric;
  v_platform_share_pct numeric;
  v_seller_amt numeric;
  v_platform_amt numeric;
  v_deadline_days int;
  v_label text;
  v_user_label text;
  v_next_bidder record;
begin
  if p_reason not in ('payment_deadline_expired','voluntary') then
    raise exception 'INVALID_REASON: %', p_reason;
  end if;
  if p_user_id is null then
    raise exception 'USER_REQUIRED';
  end if;

  select seller_id, make, model, year, participation_deposit
    into v_seller, v_make, v_model, v_year, v_deposit
    from public.auctions where id = p_auction_id for update;

  if not found then raise exception 'AUCTION_NOT_FOUND'; end if;
  if v_seller is null then raise exception 'AUCTION_NO_SELLER'; end if;

  if not exists (
    select 1 from public.bids b
    where b.auction_id = p_auction_id
      and b.user_id    = p_user_id
      and not exists (
        select 1 from public.auction_forfeits f
        where f.auction_id = p_auction_id and f.user_id = b.user_id
      )
      and b.amount = (
        select max(b2.amount) from public.bids b2
        where b2.auction_id = p_auction_id
          and b2.user_id is not null
          and not exists (
            select 1 from public.auction_forfeits f2
            where f2.auction_id = p_auction_id and f2.user_id = b2.user_id
          )
      )
  ) then
    raise exception 'NOT_CURRENT_WINNER';
  end if;

  if exists (
    select 1 from public.transactions
    where auction_id = p_auction_id
      and user_id = p_user_id
      and type = 'final_payment'
      and status = 'completed'
  ) then
    raise exception 'ALREADY_PAID';
  end if;

  v_seller_share_pct   := public.get_setting_num('auction.forfeit.seller_share',   0.7);
  v_platform_share_pct := public.get_setting_num('auction.forfeit.platform_share', 0.3);
  v_deadline_days      := public.get_setting_num('auction.payment.deadline_days',  7)::int;

  v_seller_amt   := round(v_deposit * v_seller_share_pct);
  v_platform_amt := v_deposit - v_seller_amt;

  select b.bidder_label into v_user_label
    from public.bids b
    where b.auction_id = p_auction_id and b.user_id = p_user_id
    order by b.amount desc, b.placed_at desc
    limit 1;

  insert into public.auction_forfeits (
    auction_id, user_id, user_label, amount, seller_share, platform_share, reason
  ) values (
    p_auction_id, p_user_id, v_user_label, v_deposit, v_seller_amt, v_platform_amt, p_reason
  );

  v_label := v_make || ' ' || v_model || ' ' || v_year;

  insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
  values (
    'TX-FP-' || substring(gen_random_uuid()::text from 1 for 8),
    v_seller, null, p_auction_id, 'forfeit_payout', 'in', v_seller_amt,
    'Caution forfait — ' || v_label || ' (part vendeur)',
    'completed'
  );

  insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
  values (
    'TX-FF-' || substring(gen_random_uuid()::text from 1 for 8),
    null, 'Mazed Auto', p_auction_id, 'forfeit_fee', 'in', v_platform_amt,
    'Caution forfait — ' || v_label || ' (commission plateforme)',
    'completed'
  );

  -- Forfeiter notification — dedicated v2 kind so it routes to
  -- /transactions instead of the generic system tray.
  insert into public.notifications (user_id, auction_id, kind, title, body)
  values (p_user_id, p_auction_id, 'deposit_forfeited',
    case p_reason
      when 'voluntary' then 'Vous avez renoncé à votre victoire'
      else 'Délai de paiement expiré — caution perdue'
    end,
    v_label || ' — Votre caution de ' || v_deposit::text
      || ' DT a été redistribuée (' || v_seller_amt::text
      || ' DT au vendeur, ' || v_platform_amt::text || ' DT à la plateforme).'
  );

  select b.user_id, b.amount, b.bidder_label
    into v_next_bidder
    from public.bids b
    where b.auction_id = p_auction_id
      and b.user_id is not null
      and b.user_id <> p_user_id
      and not exists (
        select 1 from public.auction_forfeits f
        where f.auction_id = p_auction_id and f.user_id = b.user_id
      )
    order by b.amount desc, b.placed_at asc
    limit 1;

  if v_next_bidder.user_id is not null then
    update public.auctions
       set status            = 're_offered',
           current_winner_id = v_next_bidder.user_id,
           current_price     = v_next_bidder.amount,
           payment_deadline  = now() + make_interval(days => v_deadline_days)
     where id = p_auction_id;

    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (v_next_bidder.user_id, p_auction_id, 'won',
      'Enchère re-proposée à votre prix',
      v_label || ' — Le gagnant précédent a renoncé. Vous pouvez l''acheter à votre offre de '
        || v_next_bidder.amount::text || ' DT. Délai de paiement : '
        || v_deadline_days || ' jours.'
    );
  else
    update public.auctions
       set status            = 'cancelled',
           current_winner_id = null,
           payment_deadline  = null
     where id = p_auction_id;

    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (v_seller, p_auction_id, 'system',
      'Enchère annulée — aucun acheteur restant',
      v_label || ' — Tous les enchérisseurs éligibles ont renoncé.'
    );
  end if;
end; $$;


-- Diagnostic ----------------------------------------------------------------
do $$
begin
  raise notice 'finalize_auction now emits reserve_not_met + deposit_refunded; forfeit_winner_deposit emits deposit_forfeited';
end $$;
