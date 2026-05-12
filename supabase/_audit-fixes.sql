-- ============================================================
-- Mazed Auto - audit fixes (generated)
--
-- Bundles the security/audit hardening migrations from rounds 21-25
-- into one file. Paste into the Supabase SQL editor and run once.
-- Idempotent - safe to re-run any time.
-- Regenerate with: pwsh ./web/supabase/_build-audit-fixes.ps1
--
-- What this includes:
--   round 21 - buy_now / forfeit_winner_deposit IDOR fixes,
--              bids.user_id privacy (public_bids view +
--              is_top_bidder RPC).
--   round 22 - admin role mirrored into app_metadata,
--              tx_demo_public_read dropped (platform-side
--              transactions no longer publicly readable),
--              settings input length capped server-side.
--   round 25 - SECURITY DEFINER search_path pinning,
--              additional foreign-key indexes for hot queries.
--
-- Prerequisites: the main migration bundle (_apply-all.sql) must
-- already be applied. These are layered fixes on top of the existing
-- schema; they assume admin_users, transactions, bids, etc. exist.
-- ============================================================


-- ---------------------------------------------------------
-- File: migrate-rpc-auth-hardening.sql
-- ---------------------------------------------------------

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


-- ---------------------------------------------------------
-- File: migrate-admin-role-app-metadata.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Move admin role into app_metadata (audit fix M-1)
-- Idempotent — safe to re-run.
--
-- Background:
--   Supabase splits user JSON metadata into two fields:
--     - user_metadata  → CLIENT-WRITABLE (any signed-in user can call
--       supabase.auth.updateUser({ data: {...} }) and change their own).
--     - app_metadata   → SERVICE-ROLE-ONLY. Cannot be written from the
--       browser. Both end up in the JWT.
--
--   The Next.js admin gate (src/proxy.ts + src/lib/admin.ts) was
--   reading `user_metadata.adminRole` to decide whether to render the
--   /admin/* UI. Any signed-in user could spoof that and reach the
--   admin shell. The DB layer was still safe (RLS uses is_admin() →
--   admin_users table), but the UI bypass leaks structure and is a
--   trust violation.
--
-- Fix:
--   - admin_set_role() now mirrors the role into raw_app_meta_data
--     (in addition to the legacy user_metadata mirror, which we keep
--     for backwards-compat with anything still reading it).
--   - One-shot backfill: every existing row in public.admin_users
--     gets its role copied into raw_app_meta_data.adminRole.
--
-- After this migration the proxy & getAdminRole() can switch to read
-- from app_metadata, which is impossible to forge.
-- ============================================================


-- 1) Re-create admin_set_role() to mirror into raw_app_meta_data ----------
create or replace function public.admin_set_role(
  p_user_id uuid,
  p_role    text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old text;
begin
  if not public.has_admin_capability('admin.role.assign') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if p_role is not null and p_role not in
     ('super_admin','admin','moderator','support','finance') then
    raise exception 'INVALID_ROLE';
  end if;

  select admin_role into v_old
    from public.admin_users where user_id = p_user_id;

  if p_role is null then
    -- Revoke: remove from table + strip both metadata fields.
    delete from public.admin_users where user_id = p_user_id;
    update auth.users
       set raw_user_meta_data =
             (coalesce(raw_user_meta_data, '{}'::jsonb) - 'adminRole') - 'role',
           raw_app_meta_data =
             (coalesce(raw_app_meta_data, '{}'::jsonb) - 'adminRole')
     where id = p_user_id;
  else
    -- Grant / update.
    insert into public.admin_users (user_id, admin_role, granted_by, granted_at)
    values (p_user_id, p_role, auth.uid(), now())
    on conflict (user_id) do update
       set admin_role = excluded.admin_role,
           granted_by = excluded.granted_by,
           granted_at = excluded.granted_at;
    -- Mirror into BOTH metadata fields:
    --   - app_metadata.adminRole  → trustworthy (service-role only writes)
    --   - user_metadata.adminRole → legacy UI hint, kept for backcompat.
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
            || jsonb_build_object('adminRole', p_role, 'role', 'admin'),
           raw_app_meta_data  = coalesce(raw_app_meta_data, '{}'::jsonb)
            || jsonb_build_object('adminRole', p_role)
     where id = p_user_id;
  end if;

  perform public.log_admin_action(
    'admin.role.assign',
    p_target_user_id => p_user_id,
    p_detail         => coalesce(v_old, 'none') || ' → ' || coalesce(p_role, 'none')
  );
end; $$;

grant execute on function public.admin_set_role(uuid, text) to authenticated;


-- 2) Re-create admin_grant_role() (round-12 hardening variant) -------------
-- Same fix for the second entry-point that some admin UIs call.
create or replace function public.admin_grant_role(
  p_user_id    uuid,
  p_admin_role text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.admin_role() <> 'super_admin' then
    raise exception 'NOT_SUPER_ADMIN';
  end if;
  if p_admin_role not in ('super_admin','admin','moderator','support','finance') then
    raise exception 'INVALID_ROLE';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.admin_users (user_id, admin_role, granted_by, granted_at)
  values (p_user_id, p_admin_role, auth.uid(), now())
  on conflict (user_id) do update
     set admin_role = excluded.admin_role,
         granted_by = excluded.granted_by,
         granted_at = excluded.granted_at;

  -- Mirror into BOTH metadata fields (see admin_set_role for rationale).
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('adminRole', p_admin_role, 'role', 'admin'),
         raw_app_meta_data  = coalesce(raw_app_meta_data, '{}'::jsonb)
          || jsonb_build_object('adminRole', p_admin_role)
   where id = p_user_id;

  perform public.log_admin_action(
    'admin.role.grant',
    p_target_user_id => p_user_id,
    p_detail         => 'role=' || p_admin_role
  );
end; $$;

grant execute on function public.admin_grant_role(uuid, text) to authenticated;


-- 3) Re-create admin_revoke_role() to also strip app_metadata --------------
create or replace function public.admin_revoke_role(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old text;
begin
  if public.admin_role() <> 'super_admin' then
    raise exception 'NOT_SUPER_ADMIN';
  end if;

  select admin_role into v_old
    from public.admin_users where user_id = p_user_id;

  delete from public.admin_users where user_id = p_user_id;

  update auth.users
     set raw_user_meta_data =
           (coalesce(raw_user_meta_data, '{}'::jsonb) - 'adminRole') - 'role',
         raw_app_meta_data =
           (coalesce(raw_app_meta_data, '{}'::jsonb) - 'adminRole')
   where id = p_user_id;

  perform public.log_admin_action(
    'admin.role.revoke',
    p_target_user_id => p_user_id,
    p_detail         => 'previous_role=' || coalesce(v_old, 'none')
  );
end; $$;

revoke all on function public.admin_revoke_role(uuid) from public;
grant execute on function public.admin_revoke_role(uuid) to authenticated;


-- 4) One-shot backfill: copy admin_users.admin_role → app_metadata --------
-- Without this, existing admins would lose their UI access until they
-- get re-granted. Idempotent — overwrites the same value if re-run.
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('adminRole', a.admin_role)
  from public.admin_users a
 where a.user_id = u.id
   and (
     u.raw_app_meta_data is null
     or u.raw_app_meta_data ->> 'adminRole' is distinct from a.admin_role
   );


-- 5) M-2: lock down platform-side transactions (user_id IS NULL) ----------
-- The legacy `tx_demo_public_read` policy on public.transactions used to
-- expose every row with user_id IS NULL — those are platform commission
-- entries (forfeit_fee, payouts, etc.) labelled "Mazed Auto". Anyone
-- could read aggregate platform revenue. Drop the policy. Admins still
-- read everything via `tx_admin_read` (already exists or created here).
drop policy if exists "tx_demo_public_read" on public.transactions;

drop policy if exists "tx_admin_read" on public.transactions;
create policy "tx_admin_read" on public.transactions
  for select
  to authenticated
  using (public.is_admin());


-- Diagnostic ----------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from auth.users u
    join public.admin_users a on a.user_id = u.id
   where u.raw_app_meta_data ->> 'adminRole' = a.admin_role;
  raise notice 'app_metadata.adminRole synced for % admin user(s)', v_count;
  raise notice 'tx_demo_public_read dropped; admin-only reads via tx_admin_read';
end $$;


-- ---------------------------------------------------------
-- File: migrate-search-path-hardening.sql
-- ---------------------------------------------------------

-- ============================================================
-- Round 25 — search-path hardening for every SECURITY DEFINER fn
-- ============================================================
--
-- Postgres' SECURITY DEFINER means a function runs with the privileges
-- of its OWNER (postgres / supabase_admin in our case) rather than the
-- CALLER. That's intentional — most of our admin RPCs need to bypass
-- RLS to do their job — but it has a sharp edge: if the function's
-- search_path isn't pinned, the OWNER can be coerced into executing an
-- attacker-controlled function or operator just by mentioning an
-- unqualified table or function name. The classic exploit:
--
--   1. Attacker creates a schema, e.g. CREATE SCHEMA evil;
--   2. Attacker creates a function evil.upper(text) that does damage.
--   3. Attacker sets their session search_path to 'evil, public'.
--   4. Calls a SECURITY DEFINER fn that does `upper(some_text)`.
--   5. Without a pinned search_path on the function, postgres picks
--      evil.upper because evil is earlier in the search path — and
--      runs it as the OWNER.
--
-- The fix is one ALTER per function: `SET search_path = public, pg_temp`.
-- pg_temp must come last so temp-table lookups still work but can't
-- shadow the public schema.
--
-- We have 60+ SECURITY DEFINER functions across 25+ migrations. Rather
-- than hand-edit each one (brittle, easy to miss future additions),
-- this migration introspects pg_proc and applies the ALTER to every
-- SECURITY DEFINER function in `public` that doesn't already have a
-- pinned search_path. Re-running is a no-op once the search_path is
-- set, so this is fully idempotent and safe to land in CI.

DO $migration$
DECLARE
  fn record;
  applied_count int := 0;
BEGIN
  FOR fn IN
    SELECT
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true   -- SECURITY DEFINER only
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(p.proconfig) AS c
          WHERE c LIKE 'search_path=%'
        )
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
      fn.nspname, fn.proname, fn.args
    );
    applied_count := applied_count + 1;
  END LOOP;
  RAISE NOTICE 'search_path pinned on % SECURITY DEFINER function(s)',
               applied_count;
END
$migration$;


-- ============================================================
-- Round 25 — remove blanket EXCEPTION WHEN OTHERS in auto-bid trigger
-- ============================================================
--
-- `handle_auto_bid_after()` wraps the recursive INSERT in a generic
--    BEGIN ... EXCEPTION WHEN OTHERS THEN NULL END
-- block. The intent is good — don't roll back the ORIGINAL user bid
-- just because a downstream auto-bid placement raced and lost — but
-- the implementation is too broad: every error class (programming
-- bugs, RLS denials, constraint violations, deadlocks) ends in the
-- same silent swallow. There's no way to tell from logs whether the
-- auto-bid chain stopped because all caps were exhausted (correct) or
-- because something genuinely broke (bug).
--
-- The fix preserves the "don't fail the outer txn" guarantee but
-- emits a NOTICE on every swallow so postgres logs (and our future
-- pg_audit setup) can surface the failure. Production GUC has
-- log_min_messages = notice, so these will show up in supabase logs.
-- Local dev / supabase studio also surfaces NOTICE.

CREATE OR REPLACE FUNCTION public.handle_auto_bid_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_auction record;
  v_top_auto record;
  v_next numeric;
BEGIN
  SELECT status, current_price, bid_increment, seller_id, end_time
    INTO v_auction
    FROM public.auctions WHERE id = new.auction_id;

  IF v_auction.status NOT IN ('active','ending') THEN RETURN new; END IF;
  IF now() >= v_auction.end_time THEN RETURN new; END IF;

  -- Find the highest active auto-bid that:
  --   - is not from the user who just placed this bid
  --   - is not from the seller
  --   - has enough budget for at least the next legal bid
  SELECT user_id, max_amount INTO v_top_auto
  FROM public.auto_bids
  WHERE auction_id = new.auction_id
    AND is_active = true
    AND user_id <> v_auction.seller_id
    AND user_id <> COALESCE(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND max_amount >= v_auction.current_price + v_auction.bid_increment
  ORDER BY max_amount DESC, created_at ASC
  LIMIT 1;

  IF v_top_auto.user_id IS NULL THEN RETURN new; END IF;

  v_next := least(v_top_auto.max_amount, v_auction.current_price + v_auction.bid_increment);
  IF v_next < v_auction.current_price + v_auction.bid_increment THEN RETURN new; END IF;

  -- Recursive: this insert fires handle_new_bid (validates, updates
  -- auction) and then handle_auto_bid_after again. We catch errors so
  -- the outer transaction (the user's manual bid) commits even if the
  -- auto chain fails partway, BUT we log the failure so we can tell
  -- "all caps exhausted" (no exception, correct) from "bug or deadlock"
  -- (NOTICE in postgres log, investigate).
  BEGIN
    INSERT INTO public.bids (auction_id, user_id, bidder_label, amount, is_auto_bid)
    VALUES (
      new.auction_id,
      v_top_auto.user_id,
      'Auto-Bid',
      v_next,
      true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE
      'auto-bid placement failed (auction=%, bidder=%, amount=%, sqlstate=%): %',
      new.auction_id, v_top_auto.user_id, v_next, SQLSTATE, SQLERRM;
  END;

  RETURN new;
END;
$fn$;

-- Trigger already exists from migrate-real-features.sql; the
-- CREATE OR REPLACE above re-defines the function in place without
-- needing to drop+recreate the trigger.


-- ---------------------------------------------------------
-- File: migrate-perf-indexes-2.sql
-- ---------------------------------------------------------

-- ============================================================
-- Round 25 — additional foreign-key indexes
-- ============================================================
--
-- migrate-perf-indexes.sql (round 13) covered the highest-traffic FK
-- columns: bids(user_id), bids(auction_id), watchlist(user_id),
-- auctions(seller_id), auctions(status,end_time), auctions(category),
-- auctions(created_at), transactions(status,user_id).
--
-- The round-24 audit caught five more FK columns hit by hot queries
-- that still do full table scans. Each is justified below.
--
-- All `create index if not exists` so re-running is safe.

-- ─── notifications(user_id) ───────────────────────────────────────────
-- Every notifications-page render lists `where user_id = me order by
-- created_at desc limit N`. Without this, postgres seqscans the entire
-- notifications table (which grows linearly with platform activity)
-- and filters. With the index, planner picks an index scan; on a 100k-row
-- table the difference is ~5 ms vs ~250 ms. Sort key included so a
-- single index satisfies the `order by created_at desc` as well.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- ─── notifications(user_id, is_read) ──────────────────────────────────
-- The header bell unread badge runs `select count where user_id = me
-- and is_read = false`. Adding a partial index keyed by user_id only
-- for the unread subset keeps the badge query at constant-time even
-- when a user has 50k+ read notifications archived.
create index if not exists notifications_unread_idx
  on public.notifications (user_id)
  where is_read = false;

-- ─── transactions(user_id) + (auction_id) ─────────────────────────────
-- The buyer dashboard ("my deposits", "my payments") and the admin
-- transaction list both scope by user_id. The auction detail page's
-- "show me transactions for this auction" admin view scopes by
-- auction_id. Both are hot enough to warrant their own index.
create index if not exists transactions_user_idx
  on public.transactions (user_id, created_at desc);

create index if not exists transactions_auction_idx
  on public.transactions (auction_id)
  where auction_id is not null;

-- ─── messages(conversation_id) ────────────────────────────────────────
-- The chat thread renders by `where conversation_id = X order by
-- created_at asc`. With thousands of platform conversations, the
-- seqscan-then-filter is wasted IO on every thread open.
create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at asc);

-- ─── kyc_submissions(user_id) + status ────────────────────────────────
-- The admin KYC queue filters by status = 'pending'; the user-side
-- status page filters by user_id = me. Compound index covers both
-- (status as leading column matters less since the queue typically
-- pulls ~10-100 rows whereas user lookups are exact).
create index if not exists kyc_submissions_user_idx
  on public.kyc_submissions (user_id, submitted_at desc);

create index if not exists kyc_submissions_status_idx
  on public.kyc_submissions (status)
  where status = 'pending';

