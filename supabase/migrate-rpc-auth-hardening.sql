-- ============================================================
-- Mazed Auto — RPC auth hardening (audit round 21)
-- Idempotent — safe to re-run.
--
-- Fixes from AUDIT-FINDINGS.md:
--
--   C-1  buy_now(p_auction_id, p_buyer_id) accepted any p_buyer_id and
--        ended the auction with that user spoofed as the winner. Adds
--        auth.uid() = p_buyer_id check.
--
--   C-2  forfeit_winner_deposit(p_auction_id, p_user_id, p_reason) let
--        any authenticated user voluntarily forfeit any other user's
--        deposit. Adds caller-identity guard:
--          - reason = 'voluntary'                → auth.uid() = p_user_id
--          - reason = 'payment_deadline_expired' → caller must be an
--            admin OR the call must originate from another SECURITY
--            DEFINER function (we surface this via a guarded internal
--            function _forfeit_internal that callers in this DB can use
--            without the auth gate; the public RPC stays gated).
--
--   H-1  bids_public_read on public.bids was `using (true)`, leaking
--        user_id to anonymous viewers. Replaced with an owner/seller/
--        admin policy and a column-stripped public view `public_bids`
--        for the listing UI to read from.
--
-- Run order: anytime after migrate-bid-buynow-hardening.sql and
-- migrate-winner-forfeit.sql have been applied.
-- ============================================================


-- ---------- C-1: harden buy_now() with caller identity check ----------
create or replace function public.buy_now(p_auction_id uuid, p_buyer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buy_now numeric;
  v_seller  uuid;
  v_status  text;
  v_end     timestamptz;
begin
  -- AUTH: the caller must be the buyer they claim to be. Without this
  -- any authenticated user could close any live "buy now" auction with
  -- another user spoofed as the winner.
  if auth.uid() is null or auth.uid() <> p_buyer_id then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- Lock the auction row so concurrent buy_now / place_bid calls serialise.
  select buy_now_price, seller_id, status, end_time
    into v_buy_now, v_seller, v_status, v_end
    from public.auctions
   where id = p_auction_id
   for update;

  if not found then
    raise exception 'AUCTION_NOT_FOUND';
  end if;
  if v_buy_now is null then
    raise exception 'NO_BUY_NOW_PRICE';
  end if;
  if v_seller = p_buyer_id then
    raise exception 'SELLER_CANNOT_BUY';
  end if;
  if v_status not in ('active','ending') then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;
  if now() >= v_end then
    raise exception 'AUCTION_ENDED';
  end if;

  update public.auctions
     set current_price = v_buy_now,
         status        = 'ended',
         reserve_met   = true,
         end_time      = now()
   where id = p_auction_id;

  insert into public.notifications (user_id, auction_id, kind, title, body)
  values (p_buyer_id, p_auction_id, 'won',
          'Félicitations ! Vous avez gagné l''enchère',
          'La voiture a été achetée au prix Acheter maintenant — prête pour le paiement final');
end; $$;


-- ---------- C-2: split forfeit into internal core + public RPC ----------
-- Core function: does the work. No auth gate. Only callable by other
-- SECURITY DEFINER functions in this DB (the sweep), and it's not granted
-- to authenticated/anon. Underscore prefix signals "private".
create or replace function public._forfeit_internal(
  p_auction_id uuid,
  p_user_id    uuid,
  p_reason     text default 'voluntary'
) returns void
language plpgsql
security definer
set search_path = public
as $$
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

-- Lock the internal helper down: only the postgres / supabase_admin owner
-- and other SECURITY DEFINER functions in this DB can call it. PostgREST
-- (the API gateway) refuses to expose functions without execute grants to
-- authenticated/anon, so this is unreachable from the browser.
revoke all on function public._forfeit_internal(uuid, uuid, text) from public;
revoke all on function public._forfeit_internal(uuid, uuid, text) from anon, authenticated;


-- Public RPC: gated on caller identity. Voluntary reason requires the
-- caller to BE the user. The expired-deadline path is admin-only here;
-- the system sweep calls the internal helper directly.
create or replace function public.forfeit_winner_deposit(
  p_auction_id uuid,
  p_user_id    uuid,
  p_reason     text default 'voluntary'
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_reason = 'voluntary' then
    -- Only the user themselves can voluntarily forfeit.
    if auth.uid() <> p_user_id then
      raise exception 'NOT_AUTHORIZED';
    end if;
  elsif p_reason = 'payment_deadline_expired' then
    -- Admin override only. System sweep bypasses this by calling
    -- _forfeit_internal directly.
    if not public.is_admin() then
      raise exception 'NOT_AUTHORIZED';
    end if;
  else
    raise exception 'INVALID_REASON: %', p_reason;
  end if;

  perform public._forfeit_internal(p_auction_id, p_user_id, p_reason);
end; $$;


-- Rewire the sweep to use the internal helper (no auth gate needed —
-- this function only runs when called from server code, never directly
-- from a browser).
create or replace function public.process_expired_payment_deadlines()
returns void language plpgsql security definer set search_path = public as $$
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
      perform public._forfeit_internal(
        r.id, r.current_winner_id, 'payment_deadline_expired'
      );
    end if;
  end loop;
end; $$;


-- ---------- H-1: tighten public read on bids, add anonymised view ----------
-- The original policy `using (true)` exposed user_id to anonymous
-- viewers, breaking the anonymity promise. New policy: authenticated
-- users see their own bids; sellers see bids on their auctions; admins
-- see everything. Anonymous public consumers (the auction detail bid
-- history, the home ticker, the recent-bids rail) now go through the
-- `public_bids` view defined below, which projects only the
-- non-identifying columns.
drop policy if exists "bids_public_read" on public.bids;
drop policy if exists "bids_owner_or_seller_or_admin_read" on public.bids;
create policy "bids_owner_or_seller_or_admin_read" on public.bids
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.auctions a
      where a.id = auction_id and a.seller_id = auth.uid()
    )
    or public.is_admin()
  );

-- View runs as its OWNER (postgres / supabase_admin), bypassing the
-- per-row policy on `bids`. The view itself only projects safe columns
-- so user_id never leaves the database for non-privileged callers.
-- (This is the same pattern Supabase docs recommend for "public-safe
-- projections of restricted tables".)
drop view if exists public.public_bids;
create view public.public_bids
with (security_invoker = false)
as
select
  id,
  auction_id,
  amount,
  bidder_label,
  is_auto_bid,
  placed_at
from public.bids;

grant select on public.public_bids to anon, authenticated;


-- Helper: is the given user the current top bidder for the given auction?
-- Used by AuctionEndModal / AuctionResultBanner to decide which "you won
-- / you lost / pending decision" copy to show, without leaking other
-- bidders' identities. SECURITY DEFINER bypasses the bids RLS so the
-- comparison can succeed even when the caller can't read the top bid row.
create or replace function public.is_top_bidder(
  p_auction_id uuid,
  p_user_id    uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.bids b
    where b.auction_id = p_auction_id
      and b.user_id    = p_user_id
      and b.amount = (
        select max(amount) from public.bids
        where auction_id = p_auction_id
          and user_id is not null
      )
  );
$$;

revoke all on function public.is_top_bidder(uuid, uuid) from public;
grant execute on function public.is_top_bidder(uuid, uuid) to authenticated;


-- ---------- Diagnostic ----------
do $$
begin
  raise notice 'RPC auth hardening applied: buy_now, forfeit_winner_deposit, bids_public_read';
end $$;
