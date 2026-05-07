-- ============================================================
-- Mazed Auto — winner forfeit (PLAN §21.4)
-- Safe to run repeatedly.
--
-- When the auction winner doesn't pay within `auction.payment.deadline_days`
-- (or voluntarily renounces from /buyer/wins), their participation deposit
-- is split between the seller (`auction.forfeit.seller_share`, default 70%)
-- and the platform (`auction.forfeit.platform_share`, default 30%). The
-- auction status moves to 're_offered' and the next-highest bidder gets a
-- 7-day window to buy at their bid price. If no further bidders exist the
-- auction is cancelled.
-- ============================================================

-- ---------- 1) Schema extensions ----------

alter table public.auctions
  add column if not exists payment_deadline timestamptz,
  add column if not exists current_winner_id uuid references auth.users(id) on delete set null;

create index if not exists auctions_payment_deadline_idx
  on public.auctions (payment_deadline)
  where payment_deadline is not null;

-- Extend status enum to include 're_offered'.
do $$
begin
  alter table public.auctions drop constraint if exists auctions_status_check;
  alter table public.auctions
    add constraint auctions_status_check
    check (status in (
      'scheduled','active','ending','ended','cancelled',
      'reserve_not_met','pending_review','re_offered'
    ));
end $$;

-- Extend transactions.type for the two new ledger entries created on
-- forfeit. forfeit_payout = seller's share, forfeit_fee = platform's share.
do $$
begin
  alter table public.transactions drop constraint if exists transactions_type_check;
  alter table public.transactions
    add constraint transactions_type_check
    check (type in (
      'deposit','refund','final_payment','commission','payout',
      'forfeit_payout','forfeit_fee'
    ));
end $$;

-- ---------- 2) Forfeit history table ----------
-- Append-only audit trail of every forfeit, voluntary or expired. Used to
-- exclude already-forfeited bidders from the "next winner" search and to
-- power admin/buyer history views.
create table if not exists public.auction_forfeits (
  id              uuid primary key default gen_random_uuid(),
  auction_id      uuid not null references public.auctions(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  user_label      text,
  amount          numeric not null,
  seller_share    numeric not null,
  platform_share  numeric not null,
  reason          text not null check (reason in ('payment_deadline_expired','voluntary')),
  forfeited_at    timestamptz not null default now()
);

create index if not exists auction_forfeits_auction_idx on public.auction_forfeits (auction_id);
create index if not exists auction_forfeits_user_idx on public.auction_forfeits (user_id);

alter table public.auction_forfeits enable row level security;

drop policy if exists "auction_forfeits_read_own_or_seller" on public.auction_forfeits;
create policy "auction_forfeits_read_own_or_seller"
on public.auction_forfeits for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.auctions a
    where a.id = auction_id and a.seller_id = auth.uid()
  )
);

-- ---------- 3) Forfeit function ----------
-- Verifies the caller is the current winner (top bid not in any prior
-- forfeit row), records the forfeit, splits the deposit, advances to the
-- next bidder or cancels the auction.
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

  -- Verify this user is the current top bidder NOT already forfeited.
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

  -- Don't double-forfeit if a final_payment is already completed.
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

  -- Round down to integer DT for the seller, give the rest (any rounding
  -- residue) to the platform. Avoids float drift across split.
  v_seller_amt   := round(v_deposit * v_seller_share_pct);
  v_platform_amt := v_deposit - v_seller_amt;

  -- Capture this forfeiter's bidder_label for later transactions.
  select b.bidder_label into v_user_label
    from public.bids b
    where b.auction_id = p_auction_id and b.user_id = p_user_id
    order by b.amount desc, b.placed_at desc
    limit 1;

  -- Audit row.
  insert into public.auction_forfeits (
    auction_id, user_id, user_label, amount, seller_share, platform_share, reason
  ) values (
    p_auction_id, p_user_id, v_user_label, v_deposit, v_seller_amt, v_platform_amt, p_reason
  );

  v_label := v_make || ' ' || v_model || ' ' || v_year;

  -- Ledger: seller payout
  insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
  values (
    'TX-FP-' || substring(gen_random_uuid()::text from 1 for 8),
    v_seller, null, p_auction_id, 'forfeit_payout', 'in', v_seller_amt,
    'Caution forfait — ' || v_label || ' (part vendeur)',
    'completed'
  );

  -- Ledger: platform fee (user_id null → platform)
  insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
  values (
    'TX-FF-' || substring(gen_random_uuid()::text from 1 for 8),
    null, 'Mazed Auto', p_auction_id, 'forfeit_fee', 'in', v_platform_amt,
    'Caution forfait — ' || v_label || ' (commission plateforme)',
    'completed'
  );

  -- Notify the forfeiter
  insert into public.notifications (user_id, auction_id, kind, title, body)
  values (p_user_id, p_auction_id, 'system',
    case p_reason
      when 'voluntary' then 'Vous avez renoncé à votre victoire'
      else 'Délai de paiement expiré — caution perdue'
    end,
    v_label || ' — Votre caution de ' || v_deposit::text
      || ' DT a été redistribuée (' || v_seller_amt::text
      || ' DT au vendeur, ' || v_platform_amt::text || ' DT à la plateforme).'
  );

  -- Find next bidder (top bid not yet forfeited)
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

-- ---------- 4) Sweep: process expired payment deadlines ----------
-- Idempotent. Called from end_expired_auctions on every bid/list read so
-- the same lazy-evaluation pattern that ends auctions also forfeits stale
-- winners — no pg_cron required.
create or replace function public.process_expired_payment_deadlines()
returns void language plpgsql security definer as $$
declare
  r record;
begin
  for r in
    select id, current_winner_id
    from public.auctions
    where status in ('ended','re_offered')
      and payment_deadline is not null
      and payment_deadline <= now()
      and current_winner_id is not null
  loop
    if not exists (
      select 1 from public.transactions
      where auction_id = r.id
        and user_id    = r.current_winner_id
        and type       = 'final_payment'
        and status     = 'completed'
    ) then
      perform public.forfeit_winner_deposit(
        r.id, r.current_winner_id, 'payment_deadline_expired'
      );
    end if;
  end loop;
end; $$;

-- ---------- 5) Backfill ----------
-- Existing 'ended' auctions don't have current_winner_id or payment_deadline.
-- Set them in one shot so /buyer/wins, the sweep, and the renounce button
-- all behave consistently after this migration runs.
update public.auctions a
   set current_winner_id = top.user_id,
       payment_deadline  = a.end_time + make_interval(
         days => public.get_setting_num('auction.payment.deadline_days', 7)::int
       )
  from (
    select distinct on (auction_id)
      auction_id, user_id
    from public.bids
    where user_id is not null
    order by auction_id, amount desc, placed_at asc
  ) top
 where a.id = top.auction_id
   and a.status = 'ended'
   and a.current_winner_id is null;
