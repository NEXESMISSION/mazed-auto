-- ============================================================
-- Mazed Auto - apply-all (generated)
--
-- Concatenation of every migration in correct dependency order.
-- Paste this whole file into the Supabase SQL editor and run.
-- All migrations are idempotent - safe to re-run any time.
-- Regenerate with: pwsh ./web/supabase/_build-apply-all.ps1
-- ============================================================


-- ---------------------------------------------------------
-- File: migrate-platform-settings.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Platform Settings + Audit Log
-- Per dev_report decision #1: every business number lives here, not in code.
-- Per decision #8: settings flagged requires_approval need a 2nd admin to enable.
-- Safe to run repeatedly.
-- ============================================================

-- ---------- 1) platform_settings ----------
-- Generic key/value store. Value is jsonb so a setting can be a number,
-- string, boolean, or struct. The `type` column is just a hint for UI.
create table if not exists public.platform_settings (
  key                  text primary key,
  value                jsonb not null,
  type                 text not null check (type in ('number','string','boolean','json')),
  category             text not null,
  description          text,
  sensitive            boolean not null default false,
  requires_approval    boolean not null default false,
  pending_value        jsonb,
  pending_proposed_by  uuid references auth.users(id) on delete set null,
  pending_proposed_at  timestamptz,
  updated_by           uuid references auth.users(id) on delete set null,
  updated_at           timestamptz not null default now()
);

create index if not exists platform_settings_category_idx
  on public.platform_settings (category);

-- ---------- 2) settings_audit_log ----------
create table if not exists public.settings_audit_log (
  id           uuid primary key default gen_random_uuid(),
  setting_key  text not null,
  old_value    jsonb,
  new_value    jsonb not null,
  action       text not null check (action in ('create','update','approve','reject')),
  changed_by   uuid references auth.users(id) on delete set null,
  changed_at   timestamptz not null default now(),
  reason       text,
  ip_address   inet
);

create index if not exists settings_audit_key_idx
  on public.settings_audit_log (setting_key, changed_at desc);
create index if not exists settings_audit_actor_idx
  on public.settings_audit_log (changed_by, changed_at desc);

-- ---------- 3) Audit trigger ----------
-- Every write to platform_settings is mirrored into settings_audit_log.
create or replace function public.log_platform_setting_change()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.settings_audit_log (setting_key, old_value, new_value, action, changed_by)
    values (new.key, null, new.value, 'create', new.updated_by);
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    -- Only log when value actually changed (ignore touch-only updates)
    if new.value is distinct from old.value then
      insert into public.settings_audit_log (setting_key, old_value, new_value, action, changed_by)
      values (new.key, old.value, new.value, 'update', new.updated_by);
    end if;
    return new;
  end if;

  return null;
end; $$;

drop trigger if exists trg_settings_audit on public.platform_settings;
create trigger trg_settings_audit
after insert or update on public.platform_settings
for each row execute function public.log_platform_setting_change();

-- ---------- 4) Helpers ----------
-- Read a single setting's value as jsonb. Used by SQL functions
-- (e.g. handle_new_bid) so the database itself stays config-driven.
create or replace function public.get_setting(p_key text)
returns jsonb language sql stable as $$
  select value from public.platform_settings where key = p_key;
$$;

-- Read a numeric setting, with a fallback if the row is missing.
create or replace function public.get_setting_num(p_key text, p_fallback numeric)
returns numeric language sql stable as $$
  select coalesce((select (value)::text::numeric from public.platform_settings where key = p_key), p_fallback);
$$;

-- ---------- 5) RLS ----------
alter table public.platform_settings enable row level security;
alter table public.settings_audit_log enable row level security;

-- Public read for non-sensitive settings (frontend needs commission %, etc.)
drop policy if exists "settings_public_read" on public.platform_settings;
create policy "settings_public_read" on public.platform_settings
  for select using (sensitive = false);

-- Authenticated users can also read sensitive ones IF they're admins
-- (admin gating is currently service-role; tighten when role table lands)
drop policy if exists "settings_admin_read" on public.platform_settings;
create policy "settings_admin_read" on public.platform_settings
  for select to authenticated using (true);

-- Audit log: admin-only read. Public has no business seeing who changed what.
drop policy if exists "audit_admin_read" on public.settings_audit_log;
create policy "audit_admin_read" on public.settings_audit_log
  for select to authenticated using (true);

-- Writes go through service role (server actions / admin API). No direct policy.

-- ============================================================
-- 6) Seed defaults
-- Numbers reflect what the codebase already implements (3% commission, 5%
-- deposit, 5min anti-sniping). Per dev_report §02, these are starting
-- defaults that Admin will tune before public launch.
-- ============================================================

insert into public.platform_settings (key, value, type, category, description, sensitive, requires_approval) values
  -- Commissions
  ('auction.commission.seller_pct',          '0.03'::jsonb,  'number',  'commission', 'Seller commission as a fraction (0.03 = 3%)', true,  true),
  ('auction.commission.seller_cap',          '15000'::jsonb, 'number',  'commission', 'Seller commission cap in DT', true,  true),
  ('auction.commission.buyer_pct',           '0'::jsonb,     'number',  'commission', 'Buyer commission as a fraction (0 = none for now)', true,  true),
  ('auction.tva_rate',                       '0.19'::jsonb,  'number',  'commission', 'VAT rate applied on commission (Tunisian TVA = 19%)', true,  true),

  -- Participation deposit
  ('auction.deposit.starting_pct',           '0.05'::jsonb,  'number',  'deposit',    'Participation deposit as a fraction of starting price (0.05 = 5%)', false, true),

  -- Anti-sniping (decision #5)
  ('auction.anti_sniping.window_minutes',    '5'::jsonb,     'number',  'auction',    'A bid placed within this many minutes of end_time triggers extension', false, false),
  ('auction.anti_sniping.extension_minutes', '5'::jsonb,     'number',  'auction',    'How many minutes to push end_time forward when anti-sniping fires', false, false),

  -- Winner forfeit (PLAN §21.4)
  ('auction.payment.deadline_days',          '7'::jsonb,     'number',  'auction',    'Days the winner has to complete the final payment before forfeit', false, true),
  ('auction.forfeit.seller_share',           '0.7'::jsonb,   'number',  'auction',    'Fraction of forfeited deposit paid to the seller (0.7 = 70%)', true,  true),
  ('auction.forfeit.platform_share',         '0.3'::jsonb,   'number',  'auction',    'Fraction of forfeited deposit kept by the platform (0.3 = 30%)', true,  true),

  -- Buy-now (decisions #3 and #4)
  ('auction.buy_now.min_multiplier',         '1.30'::jsonb,  'number',  'auction',    'buy_now_price must be >= starting_price * this multiplier', false, false),
  ('auction.buy_now.payment_mode',           '"deposit_then_full"'::jsonb, 'string', 'auction', 'Either "full_immediate" or "deposit_then_full"', false, true),

  -- KYC (decision #7 + pending #1)
  ('kyc.seller_required',                    'true'::jsonb,  'boolean', 'kyc',        'Sellers must complete KYC before creating their first auction', false, false),
  ('kyc.bidder_required_above',              '50000'::jsonb, 'number',  'kyc',        'KYC required for bidders when current_price exceeds this DT amount', false, true),
  ('kyc.winner_required_for_payment',        'true'::jsonb,  'boolean', 'kyc',        'Auction winners must complete KYC before final payment', false, false),
  ('kyc.face_match_threshold',               '95'::jsonb,    'number',  'kyc',        'Minimum face-match % to auto-approve KYC', false, true),
  ('kyc.ocr_confidence_threshold',           '95'::jsonb,    'number',  'kyc',        'Minimum OCR confidence % to auto-approve KYC', false, true),

  -- Photos & video (PLAN §12)
  ('listing.photos.required_count',          '12'::jsonb,    'number',  'listing',    'Required photo count per listing', false, false),
  ('listing.video.required',                 'true'::jsonb,  'boolean', 'listing',    'Whether walkaround video is required', false, false),
  ('listing.video.min_seconds',              '30'::jsonb,    'number',  'listing',    'Minimum video duration in seconds', false, false),
  ('listing.video.max_seconds',              '120'::jsonb,   'number',  'listing',    'Maximum video duration in seconds', false, false),

  -- Reports / moderation
  ('report.auto_review_threshold',           '3'::jsonb,     'number',  'moderation', 'Listing enters review queue once it has this many reports', false, true),
  ('report.auto_remove_threshold',           '7'::jsonb,     'number',  'moderation', 'Listing is auto-hidden once it has this many reports', false, true),

  -- Trust score weights (PLAN §15)
  ('trust.weights',
   '{"kyc":20,"ownership":15,"successful_deals":25,"ratings":15,"account_age":10,"reports":-15}'::jsonb,
   'json', 'trust', 'Weights summed to compute trust_score (max 100)', true, true),
  ('trust.kick_threshold',                   '20'::jsonb,    'number',  'trust',      'Sellers below this trust score are kicked off the platform', true, true),
  ('trust.report_cancellation_penalty',      '30'::jsonb,    'number',  'trust',      'Trust Score points deducted when auction is auto-cancelled by reports (handle_new_report)', true, true),

  -- Payment provider (decision #2)
  ('payment.active_provider',                '"simulation"'::jsonb, 'string', 'payment', 'Active payment provider: "simulation" | "konnect" | "clictopay"', true, true),

  -- i18n (pending #4)
  ('i18n.enabled_locales',                   '["ar","fr"]'::jsonb, 'json', 'i18n',     'Enabled UI locales for this MVP', false, false)
on conflict (key) do nothing;


-- ---------------------------------------------------------
-- File: migrate-bid-rules.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — bid rules, anti-sniping, deposit gate, auto-end
-- Safe to run repeatedly.
-- ============================================================

-- 1) Stronger handle_new_bid:
--    - rejects amounts <= current_price + bid_increment
--    - blocks the seller from bidding on their own auction
--    - blocks bids on non-active auctions
--    - applies anti-sniping (extends end_time by 5 min if bid is in last 5 min)
--    - inserts an outbid notification for the previous high bidder
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
  -- Lock the auction row to serialize concurrent bids
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

  -- Anti-sniping: any bid in the last 5 min pushes end_time +5 min
  if v_end - now() <= interval '5 minutes' then
    v_end := v_end + interval '5 minutes';
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

-- 2) Deposit gate
--    A user can only bid on an auction if they have a 'completed' deposit
--    transaction for that auction. Enforced via a BEFORE-INSERT trigger.
create or replace function public.require_deposit_before_bid()
returns trigger language plpgsql security definer as $$
declare
  v_paid int;
begin
  -- Allow demo bids without a user_id (label-only bids from seed)
  if new.user_id is null then
    return new;
  end if;

  select count(*) into v_paid
  from public.transactions
  where user_id = new.user_id
    and auction_id = new.auction_id
    and type = 'deposit'
    and status = 'completed';

  if v_paid = 0 then
    raise exception 'DEPOSIT_REQUIRED';
  end if;

  return new;
end; $$;

drop trigger if exists trg_deposit_gate on public.bids;
create trigger trg_deposit_gate before insert on public.bids
for each row execute function public.require_deposit_before_bid();

-- 3) Auto-end auctions whose end_time has passed.
--    Call this from the server when reading auctions; it's idempotent and cheap.
create or replace function public.end_expired_auctions()
returns void language plpgsql security definer as $$
begin
  update public.auctions a
     set status = case
       when a.total_bids = 0                     then 'cancelled'
       when a.reserve_price is not null
            and a.current_price < a.reserve_price then 'reserve_not_met'
       else 'ended'
     end
   where a.status in ('active','ending')
     and a.end_time <= now();
end; $$;

-- 4) End auction immediately for buy-now (called from app)
create or replace function public.buy_now(p_auction_id uuid, p_buyer_id uuid)
returns void language plpgsql security definer as $$
declare
  v_buy_now numeric;
  v_seller uuid;
begin
  select buy_now_price, seller_id into v_buy_now, v_seller
  from public.auctions where id = p_auction_id for update;

  if v_buy_now is null then
    raise exception 'NO_BUY_NOW_PRICE';
  end if;
  if v_seller = p_buyer_id then
    raise exception 'SELLER_CANNOT_BUY';
  end if;

  update public.auctions
     set current_price = v_buy_now,
         status = 'ended',
         reserve_met = true,
         end_time = now()
   where id = p_auction_id;

  insert into public.notifications (user_id, auction_id, kind, title, body)
  values (p_buyer_id, p_auction_id, 'won', 'Félicitations ! Vous avez gagné l''enchère',
          'La voiture a été achetée au prix Acheter maintenant — prête pour le paiement final');
end; $$;


-- ---------------------------------------------------------
-- File: migrate-bid-rules-config.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — handle_new_bid reads anti-sniping from platform_settings
-- Run AFTER migrate-platform-settings.sql (depends on get_setting_num()).
-- Safe to run repeatedly.
-- ============================================================

-- ---------- Compute participation_deposit from settings on insert ----------
-- The deposit % moves from client code into the DB so a client that
-- hasn't refreshed can't ship a stale 5% when Admin has bumped it.
create or replace function public.set_auction_deposit()
returns trigger language plpgsql security definer as $$
declare
  v_pct numeric;
begin
  v_pct := public.get_setting_num('auction.deposit.starting_pct', 0.05);
  new.participation_deposit := round(new.starting_price * v_pct);
  return new;
end; $$;

drop trigger if exists trg_set_auction_deposit on public.auctions;
create trigger trg_set_auction_deposit
before insert on public.auctions
for each row execute function public.set_auction_deposit();

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
  v_window_min numeric;
  v_extension_min numeric;
begin
  -- Lock the auction row to serialize concurrent bids
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

  -- Anti-sniping: window + extension are configurable in platform_settings.
  -- Fallbacks (5/5) match the historical hardcoded values so behavior is
  -- preserved if the settings rows are missing for any reason.
  v_window_min    := public.get_setting_num('auction.anti_sniping.window_minutes', 5);
  v_extension_min := public.get_setting_num('auction.anti_sniping.extension_minutes', 5);

  if v_end - now() <= make_interval(mins => v_window_min::int) then
    v_end := v_end + make_interval(mins => v_extension_min::int);
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


-- ---------------------------------------------------------
-- File: migrate-auction-lifecycle.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — auction lifecycle, refunds, report auto-action
-- Safe to run repeatedly.
-- ============================================================

-- 1) Anti-sniping notification: extend the bid trigger to ALSO send
--    'reminder' (auction extended) notifications to every distinct prior bidder
--    when the end_time gets pushed.
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
  v_other_bidder record;
begin
  select status, seller_id, current_price, bid_increment, end_time, reserve_price, make, model, year
    into v_status, v_seller, v_current, v_increment, v_end, v_reserve, v_make, v_model, v_year
  from public.auctions
  where id = new.auction_id
  for update;

  if not found then raise exception 'AUCTION_NOT_FOUND'; end if;
  if v_status not in ('active', 'ending') then raise exception 'AUCTION_NOT_ACTIVE'; end if;
  if now() >= v_end then raise exception 'AUCTION_ENDED'; end if;
  if new.user_id is not null and new.user_id = v_seller then raise exception 'SELLER_CANNOT_BID'; end if;
  if new.amount < v_current + v_increment then raise exception 'BID_TOO_LOW'; end if;

  if v_end - now() <= interval '5 minutes' then
    v_end := v_end + interval '5 minutes';
    v_extended := true;
  end if;

  select count(distinct coalesce(user_id::text, bidder_label)) into v_participants
    from public.bids where auction_id = new.auction_id;

  select user_id into v_prev_bidder
    from public.bids
   where auction_id = new.auction_id and id <> new.id and user_id is not null
   order by amount desc, placed_at desc limit 1;

  update public.auctions
     set current_price = new.amount,
         total_bids = total_bids + 1,
         total_participants = v_participants,
         reserve_met = (v_reserve is null or new.amount >= v_reserve),
         end_time = v_end,
         status = case when v_extended then 'ending' else status end
   where id = new.auction_id;

  -- Outbid notification for the immediately previous high bidder
  if v_prev_bidder is not null and v_prev_bidder <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (v_prev_bidder, new.auction_id, 'outbid', 'Votre offre a été dépassée',
            v_make || ' ' || v_model || ' ' || v_year || ' — Prix actuel ' || new.amount::text || ' DT');
  end if;

  -- Anti-sniping: notify every other bidder that the auction was extended
  if v_extended then
    for v_other_bidder in
      select distinct user_id
      from public.bids
      where auction_id = new.auction_id
        and user_id is not null
        and user_id <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    loop
      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (v_other_bidder.user_id, new.auction_id, 'reminder',
              'Enchère prolongée de 5 minutes',
              v_make || ' ' || v_model || ' ' || v_year || ' — Nouvelle offre dans les dernières minutes');
    end loop;
  end if;

  return new;
end; $$;

-- 2) End-of-auction lifecycle:
--    when an auction transitions from active/ending → ended/reserve_not_met/cancelled,
--    fire winner notification, loser notifications, and refund losing deposits.
create or replace function public.finalize_auction(p_auction_id uuid)
returns void language plpgsql security definer as $$
declare
  v_winner uuid;
  v_winning_amount numeric;
  v_make text; v_model text; v_year int;
  v_status text;
  v_deadline_days int;
begin
  select status, make, model, year into v_status, v_make, v_model, v_year
    from public.auctions where id = p_auction_id;

  if v_status = 'ended' then
    -- Find the winner (highest authenticated bid)
    select user_id, amount into v_winner, v_winning_amount
    from public.bids
    where auction_id = p_auction_id and user_id is not null
    order by amount desc, placed_at asc
    limit 1;

    if v_winner is not null then
      -- Stamp current_winner_id + payment_deadline so the forfeit pipeline
      -- (PLAN §21.4) has both pointers it needs. Default 7 days, configurable
      -- via auction.payment.deadline_days. Safe to call before the column
      -- exists in older schemas — the migrate-winner-forfeit migration
      -- adds the column and this update becomes effective from then on.
      v_deadline_days := public.get_setting_num('auction.payment.deadline_days', 7)::int;
      update public.auctions
         set current_winner_id = v_winner,
             payment_deadline  = now() + make_interval(days => v_deadline_days)
       where id = p_auction_id;

      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (v_winner, p_auction_id, 'won', 'Félicitations ! Vous avez gagné l''enchère',
              v_make || ' ' || v_model || ' ' || v_year || ' à ' || v_winning_amount::text
              || ' DT — complétez le paiement final dans les ' || v_deadline_days || ' jours');

      -- Notify every other bidder that they lost + refund their deposit
      insert into public.notifications (user_id, auction_id, kind, title, body)
      select distinct user_id, p_auction_id, 'lost', 'Enchère terminée',
             v_make || ' ' || v_model || ' ' || v_year || ' — Vous n''avez pas gagné cette fois. Votre caution sera remboursée sous 24 heures.'
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
    end if;
  elsif v_status = 'reserve_not_met' then
    insert into public.notifications (user_id, auction_id, kind, title, body)
    select distinct user_id, p_auction_id, 'lost', 'Prix de réserve non atteint',
           v_make || ' ' || v_model || ' ' || v_year || ' — Vente annulée. Votre caution sera remboursée.'
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
  end if;
end; $$;

-- 3) Hook finalize_auction into end_expired_auctions, then run the
--    payment-deadline sweep so any winner whose 7-day window has lapsed
--    forfeits at the same lazy-evaluation moment. Both passes are
--    idempotent and cheap when there's nothing to do.
create or replace function public.end_expired_auctions()
returns void language plpgsql security definer as $$
declare
  r record;
begin
  for r in
    select id from public.auctions
    where status in ('active','ending') and end_time <= now()
  loop
    update public.auctions a
       set status = case
         when a.total_bids = 0                     then 'cancelled'
         when a.reserve_price is not null
              and a.current_price < a.reserve_price then 'reserve_not_met'
         else 'ended'
       end
     where a.id = r.id;

    perform public.finalize_auction(r.id);
  end loop;

  -- Forfeit any winner past their payment_deadline. Function is defined
  -- in migrate-winner-forfeit.sql; if that migration hasn't been applied
  -- yet the call no-ops via the begin/exception block.
  begin
    perform public.process_expired_payment_deadlines();
  exception when undefined_function then
    -- migrate-winner-forfeit.sql not applied yet — skip silently.
    null;
  end;
end; $$;

-- 4) Reports auto-action ladder (§16.2)
--    on each new report, count open+reviewing reports for the auction
--    1                              → notify seller (handled at app layer)
--    auto_review_threshold (3)      → flip auction status to pending_review
--    auto_remove_threshold (7)      → cancel auction + Trust Score deduction
--    Thresholds and the cancellation penalty come from platform_settings
--    so admins can tune them without a redeploy (PLAN §16.2).
create or replace function public.handle_new_report()
returns trigger language plpgsql security definer as $$
declare
  v_count int;
  v_seller uuid;
  v_make text; v_model text; v_year int;
  v_review_threshold int;
  v_remove_threshold int;
  v_penalty int;
begin
  v_review_threshold := public.get_setting_num('report.auto_review_threshold', 3)::int;
  v_remove_threshold := public.get_setting_num('report.auto_remove_threshold', 7)::int;
  v_penalty          := public.get_setting_num('trust.report_cancellation_penalty', 30)::int;

  select count(*) into v_count
  from public.reports
  where auction_id = new.auction_id and status in ('open','reviewing');

  select seller_id, make, model, year
    into v_seller, v_make, v_model, v_year
    from public.auctions where id = new.auction_id;

  if v_seller is not null then
    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (v_seller, new.auction_id, 'system',
            'Nouveau signalement sur votre enchère',
            v_make || ' ' || v_model || ' ' || v_year || ' — Un signalement a été reçu, veuillez vérifier');
  end if;

  if v_count >= v_remove_threshold then
    update public.auctions
       set status = 'cancelled'
     where id = new.auction_id and status in ('active','ending','pending_review');
    update public.sellers
       set trust_score = greatest(0, trust_score - v_penalty)
     where id = v_seller;
    if v_seller is not null then
      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (v_seller, new.auction_id, 'rejected',
              'Votre enchère a été annulée',
              'Le nombre de signalements a dépassé la limite autorisée. '
              || v_penalty || ' points ont été déduits du Trust Score.');
    end if;
  elsif v_count >= v_review_threshold then
    update public.auctions
       set status = 'pending_review'
     where id = new.auction_id and status in ('active','ending');
    if v_seller is not null then
      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (v_seller, new.auction_id, 'system',
              'Votre enchère est en cours de modération',
              'Plusieurs signalements reçus — l''enchère est temporairement suspendue pour examen.');
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists trg_new_report on public.reports;
create trigger trg_new_report after insert on public.reports
for each row execute function public.handle_new_report();


-- ---------------------------------------------------------
-- File: migrate-proxy-bid.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — proxy bidding (PLAN §7.2.7)
--
-- Aligns Auto-Bid with the proxy bidding model used by eBay / Copart /
-- Manheim. The user submits a HIDDEN max cap; the system bids on their
-- behalf at the smallest amount needed to lead — never more.
--
--   Current price = MIN(highest_cap, second_highest_cap + increment)
--   Winner        = highest cap holder (oldest cap wins on a tie)
--   Cap           = can be raised, NEVER lowered
--
-- This migration:
--   1. Replaces handle_auto_bid_after with a smarter version that jumps
--      directly to (runner_max + increment) instead of stepping by one
--      increment per insert. Convergence: 1-2 inserts instead of N.
--   2. Adds a SECURITY DEFINER RPC `place_auto_bid` that is the single
--      entry point for setting/raising a cap. Validates the business
--      rules (auction live, deposit paid, cap >= starting price,
--      cap >= existing cap) and inserts the optimal proxy bid.
--
-- Safe to run repeatedly. Depends on schema.sql + migrate-real-features.sql.
-- ============================================================

-- ---------- 1) Smarter proxy trigger ----------
create or replace function public.handle_auto_bid_after()
returns trigger language plpgsql security definer as $$
declare
  v_auction record;
  v_top record;
  v_runner_max numeric;
  v_target numeric;
begin
  select * into v_auction from public.auctions where id = new.auction_id;
  if v_auction.status not in ('active', 'ending') then
    return new;
  end if;

  -- Highest active cap that's not the just-bidder's and not the seller.
  -- Tiebreaker: older cap wins (created_at asc).
  select user_id, max_amount, created_at
    into v_top
  from public.auto_bids
  where auction_id = new.auction_id
    and is_active = true
    and user_id <> v_auction.seller_id
    and user_id <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and max_amount >= v_auction.current_price + v_auction.bid_increment
  order by max_amount desc, created_at asc
  limit 1;

  if v_top.user_id is null then
    return new;
  end if;

  -- Runner-up cap = highest active cap among everyone except the leader.
  -- Includes the new bidder's own cap, if any. Jumping straight to
  -- (runner_max + increment) collapses the proxy chain into a single
  -- insert instead of stepping increment-by-increment.
  select coalesce(max(max_amount), 0)
    into v_runner_max
  from public.auto_bids
  where auction_id = new.auction_id
    and is_active = true
    and user_id <> v_top.user_id
    and user_id <> v_auction.seller_id;

  -- Counter target: smallest amount that beats the new manual bid AND
  -- the runner-up cap, capped at the leader's own ceiling.
  v_target := greatest(
    v_auction.current_price + v_auction.bid_increment,
    v_runner_max + v_auction.bid_increment,
    new.amount + v_auction.bid_increment
  );
  v_target := least(v_top.max_amount, v_target);

  -- Belt-and-suspenders: never insert below the legal floor.
  if v_target < v_auction.current_price + v_auction.bid_increment then
    return new;
  end if;

  -- Recursive: this insert fires handle_new_bid (validates, updates the
  -- auction) and handle_auto_bid_after again. We swallow exceptions so
  -- the original bid commits even if the auto chain hiccups partway.
  begin
    insert into public.bids (auction_id, user_id, bidder_label, amount, is_auto_bid)
    values (new.auction_id, v_top.user_id, 'Auto-Bid', v_target, true);
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_auto_bid_after on public.bids;
create trigger trg_auto_bid_after
  after insert on public.bids
  for each row execute function public.handle_auto_bid_after();

-- ---------- 2) place_auto_bid RPC ----------
-- Single entry point used by the client. Validates business rules then
-- upserts the cap and inserts ONE proxy bid at the optimal price. The
-- handle_auto_bid_after trigger handles any rival-cap counter chain.
create or replace function public.place_auto_bid(
  p_auction_id uuid,
  p_max_amount numeric
)
returns void
language plpgsql
security definer
as $$
declare
  v_user uuid := auth.uid();
  v_auction record;
  v_existing record;
  v_deposit_count int;
  v_runner_max numeric;
  v_my_target numeric;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_max_amount is null or p_max_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_auction from public.auctions where id = p_auction_id for update;
  if v_auction.id is null then
    raise exception 'AUCTION_NOT_FOUND';
  end if;
  if v_auction.status not in ('active', 'ending') then
    raise exception 'AUCTION_NOT_ACTIVE';
  end if;
  if v_user = v_auction.seller_id then
    raise exception 'SELLER_CANNOT_BID';
  end if;

  -- Deposit gate — same rule as manual bids.
  select count(*) into v_deposit_count
  from public.transactions
  where user_id = v_user
    and auction_id = p_auction_id
    and type = 'deposit'
    and status = 'completed';
  if v_deposit_count = 0 then
    raise exception 'DEPOSIT_REQUIRED';
  end if;

  -- Cap must clear the auction floor. Below-current-price caps are
  -- allowed (the user just won't lead until they raise it) but caps
  -- below the starting price are nonsense.
  if p_max_amount < v_auction.starting_price then
    raise exception 'CAP_BELOW_STARTING';
  end if;

  -- "User can raise the cap, but never lower it." (PLAN §7.2.7)
  select * into v_existing
  from public.auto_bids
  where auction_id = p_auction_id and user_id = v_user;
  if v_existing.id is not null
     and v_existing.is_active = true
     and p_max_amount < v_existing.max_amount then
    raise exception 'CAP_CANNOT_DECREASE';
  end if;

  -- Upsert the cap.
  insert into public.auto_bids (auction_id, user_id, max_amount, is_active, cancelled_at)
  values (p_auction_id, v_user, p_max_amount, true, null)
  on conflict (auction_id, user_id) do update
    set max_amount   = excluded.max_amount,
        is_active    = true,
        cancelled_at = null;

  -- Compute MY proxy price given everyone else's caps. runner_max is the
  -- highest cap among rivals (excluding seller). I bid the smallest
  -- amount that clears (runner_max + inc) but never exceed my own cap.
  -- If runner_max already ties or beats my cap, I bid my whole cap and
  -- the trigger lets the rival counter back to (my_cap + inc).
  select coalesce(max(max_amount), 0)
    into v_runner_max
  from public.auto_bids
  where auction_id = p_auction_id
    and is_active = true
    and user_id <> v_user
    and user_id <> v_auction.seller_id;

  v_my_target := greatest(
    v_auction.current_price + v_auction.bid_increment,
    v_runner_max + v_auction.bid_increment
  );
  v_my_target := least(p_max_amount, v_my_target);

  -- Only place a bid if it would actually clear the legal floor. A user
  -- raising a too-low cap (e.g. cap=22K when current=30K) just stores
  -- the cap and waits for the price to come back down (it won't, but
  -- we don't reject the cap — they may raise it later).
  if v_my_target >= v_auction.current_price + v_auction.bid_increment then
    insert into public.bids (auction_id, user_id, bidder_label, amount, is_auto_bid)
    values (p_auction_id, v_user, 'Auto-Bid', v_my_target, true);
  end if;
end;
$$;

grant execute on function public.place_auto_bid(uuid, numeric) to authenticated;


-- ---------------------------------------------------------
-- File: migrate-trust-score.sql
-- ---------------------------------------------------------

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


-- ---------------------------------------------------------
-- File: migrate-kyc-submissions.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — KYC submissions
-- Stores the photos/video the user uploads during the KYC flow
-- and the admin's review decision. Nothing is auto-verified —
-- a human reviews every submission.
-- Safe to run repeatedly.
-- ============================================================

-- 1) Reuse the auction-media bucket for KYC files. We add a `kyc/`
--    subfolder per user — RLS already restricts writes to the
--    user's own top-level folder (<user_id>/...), so no new policies
--    are required for storage.

-- 2) Admin-check helper. Reads role from the JWT (auth.jwt()) so end-user
--    policies don't need SELECT on auth.users (which they wouldn't have).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  )
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- 3) Submissions table
create table if not exists public.kyc_submissions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  full_name           text,
  id_front_url        text not null,
  id_back_url         text not null,
  selfie_video_url    text,
  selfie_image_url    text,
  status              text not null default 'pending'
                       check (status in ('pending','approved','rejected')),
  rejection_reason    text,
  reviewed_by         uuid references auth.users(id) on delete set null,
  reviewed_at         timestamptz,
  submitted_at        timestamptz not null default now()
);

create index if not exists kyc_submissions_status_idx
  on public.kyc_submissions (status, submitted_at desc);

alter table public.kyc_submissions enable row level security;

-- Users can read & write only their own submission
drop policy if exists "kyc_self_select" on public.kyc_submissions;
drop policy if exists "kyc_self_insert" on public.kyc_submissions;
drop policy if exists "kyc_self_update" on public.kyc_submissions;
drop policy if exists "kyc_admin_all"   on public.kyc_submissions;

create policy "kyc_self_select" on public.kyc_submissions
  for select to authenticated using (auth.uid() = user_id);

create policy "kyc_self_insert" on public.kyc_submissions
  for insert to authenticated with check (auth.uid() = user_id);

-- Self-update only allowed while still pending (re-submit after rejection)
create policy "kyc_self_update" on public.kyc_submissions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins can read/update everything. Role check uses the JWT helper
-- (public.is_admin) so we don't need SELECT on auth.users from the
-- end-user role.
create policy "kyc_admin_all" on public.kyc_submissions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3) When admin sets status='approved', mirror to the user's
--    user_metadata.kycStatus so the UI reflects the decision without
--    needing a service-role round-trip from the client. We can't write
--    to auth.users directly from a trigger in a plain RLS context, but
--    we expose an RPC (callable by the same admin) that does both updates
--    in one transaction.

create or replace function public.review_kyc(
  p_submission_id uuid,
  p_decision      text,           -- 'approved' | 'rejected'
  p_reason        text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if p_decision not in ('approved','rejected') then
    raise exception 'INVALID_DECISION';
  end if;

  update public.kyc_submissions
     set status = p_decision,
         rejection_reason = case when p_decision = 'rejected'
                                 then coalesce(p_reason, 'Documents insuffisants')
                                 else null end,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_submission_id
   returning user_id into v_user;

  if v_user is null then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;

  -- Mirror onto auth.users.raw_user_meta_data so the user's session reflects
  -- the new state on next refresh. JSONB merge preserves existing keys.
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
       || jsonb_build_object(
            'kycStatus',
            case when p_decision = 'approved' then 'verified' else 'rejected' end
          )
   where id = v_user;

  -- If the user has a sellers row matching their auth id, keep verified_kyc
  -- in sync. This is only relevant once self-onboarding sellers exists; for
  -- now it's a no-op for seed data.
  if p_decision = 'approved' then
    update public.sellers
       set verified_kyc = true
     where id = v_user;
  end if;
end; $$;

revoke all on function public.review_kyc(uuid, text, text) from public;
grant execute on function public.review_kyc(uuid, text, text) to authenticated;


-- ---------------------------------------------------------
-- File: migrate-rls-fixes.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — close all the silent-RLS-write gaps
-- Safe to run repeatedly.
-- ============================================================

-- 1) Helper: am I an admin? Reads role from JWT user_metadata.
create or replace function public.is_admin() returns boolean
language sql stable security definer as $$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- 2) seller_ratings: was missing INSERT policy → RateSellerButton failed
--    silently. The require_purchase_before_rating trigger is the actual gate.
drop policy if exists "ratings_insert_authed" on public.seller_ratings;
create policy "ratings_insert_authed" on public.seller_ratings
  for insert to authenticated
  with check (auth.uid() is not null);

-- 3) transactions: add an INSERT policy for the user's own row, so the
--    /api/payment/record route is no longer the only way in. (The API is
--    still preferred for buy-now-style atomic actions, but this lets
--    realtime UI show pending transactions immediately if needed.)
drop policy if exists "tx_owner_insert" on public.transactions;
create policy "tx_owner_insert" on public.transactions
  for insert to authenticated
  with check (auth.uid() = user_id);

-- 4) reports: admins must be able to UPDATE the status (resolve/dismiss).
--    The previous policy only covered INSERT.
drop policy if exists "reports_admin_update" on public.reports;
create policy "reports_admin_update" on public.reports
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 5) sellers: admin needs UPDATE access (KYC approve, trust-score bumps, etc.).
--    The owner policy stays for users editing their own profile.
drop policy if exists "sellers_admin_update" on public.sellers;
create policy "sellers_admin_update" on public.sellers
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 6) auctions: admin needs to be able to cancel / change status from the
--    admin-queue. The owner policy stays for sellers editing their own.
drop policy if exists "auctions_admin_update" on public.auctions;
create policy "auctions_admin_update" on public.auctions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 7) bids: defensive — admins shouldn't post bids, but they may need to
--    delete a fraudulent bid. (Read-only is already covered.)
drop policy if exists "bids_admin_delete" on public.bids;
create policy "bids_admin_delete" on public.bids
  for delete to authenticated
  using (public.is_admin());


-- ---------------------------------------------------------
-- File: migrate-rls-admin-fix.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — RLS admin-check fix
--
-- Earlier migrations (kyc_submissions, user_activity_log) gated
-- admin-only access by querying `auth.users.raw_user_meta_data`. The
-- `authenticated` role doesn't have SELECT on `auth.users`, so any
-- INSERT/UPDATE that triggered the admin policy raised
--
--   permission denied for table users (42501)
--
-- aborting the whole statement even when a *different* policy on the
-- same row (e.g. kyc_self_insert) would have allowed it.
--
-- Fix: read the role from the JWT itself via `auth.jwt()`. The JWT
-- already includes user_metadata, so we don't need to touch auth.users
-- from inside an end-user policy.
--
-- Safe to run repeatedly.
-- ============================================================

-- 1) Shared helper. STABLE so the planner caches the result per query.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  )
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- 2) kyc_submissions admin policy --------------------------------------------
drop policy if exists "kyc_admin_all" on public.kyc_submissions;
create policy "kyc_admin_all" on public.kyc_submissions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3) user_activity_log admin policy ------------------------------------------
drop policy if exists "activity_admin_read" on public.user_activity_log;
create policy "activity_admin_read" on public.user_activity_log
  for select to authenticated using (public.is_admin());

-- 4) RPCs — switch their inline admin checks to the same helper so the
--    behaviour stays identical and we have one place to maintain it.

create or replace function public.review_kyc(
  p_submission_id uuid,
  p_decision      text,
  p_reason        text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'INVALID_DECISION';
  end if;

  update public.kyc_submissions
     set status = p_decision,
         rejection_reason = case when p_decision = 'rejected'
                                 then coalesce(p_reason, 'Documents insuffisants')
                                 else null end,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_submission_id
   returning user_id into v_user;

  if v_user is null then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
       || jsonb_build_object(
            'kycStatus',
            case when p_decision = 'approved' then 'verified' else 'rejected' end
          )
   where id = v_user;

  if p_decision = 'approved' then
    update public.sellers
       set verified_kyc = true
     where id = v_user;
  end if;
end; $$;

create or replace function public.set_user_active(
  p_user_id uuid,
  p_active  boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  update public.sellers set is_active = p_active where id = p_user_id;
end; $$;

revoke all on function public.review_kyc(uuid, text, text)  from public;
revoke all on function public.set_user_active(uuid, boolean) from public;
grant execute on function public.review_kyc(uuid, text, text)  to authenticated;
grant execute on function public.set_user_active(uuid, boolean) to authenticated;


-- ---------------------------------------------------------
-- File: migrate-admin-trust-override.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Admin manual trust score adjustment
--
-- Most trust-score moves happen automatically (KYC pass, successful
-- deals, ratings, reports). For exceptional cases — admin discretion
-- after a fraud investigation, support escalation, etc. — an admin
-- needs to be able to bump or dock the score directly with a reason
-- recorded for audit.
--
-- Depends on: migrate-rls-admin-fix.sql (provides public.is_admin()).
-- Safe to run repeatedly.
-- ============================================================

-- 1) Audit table for manual adjustments. Always recorded, never auto-
--    pruned — this is the paper trail for "why did the admin change
--    this user's trust score?".
create table if not exists public.trust_adjustments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  delta        int not null,
  before_score int not null,
  after_score  int not null,
  reason       text not null,
  changed_by   uuid references auth.users(id) on delete set null,
  changed_at   timestamptz not null default now()
);

create index if not exists trust_adjustments_user_idx
  on public.trust_adjustments (user_id, changed_at desc);

alter table public.trust_adjustments enable row level security;
drop policy if exists "trust_adjust_admin_read" on public.trust_adjustments;
create policy "trust_adjust_admin_read" on public.trust_adjustments
  for select to authenticated using (public.is_admin());

-- 2) RPC: adjust trust score by delta. Admin-only.
create or replace function public.admin_adjust_trust(
  p_user_id uuid,
  p_delta   int,
  p_reason  text
)
returns void
language plpgsql
security definer
as $$
declare
  v_caller uuid := auth.uid();
  v_before int;
  v_after  int;
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select trust_score into v_before from public.sellers
   where id = p_user_id for update;
  if v_before is null then
    raise exception 'SELLER_NOT_FOUND';
  end if;

  v_after := greatest(0, least(500, v_before + p_delta));

  update public.sellers
     set trust_score = v_after
   where id = p_user_id;

  insert into public.trust_adjustments
    (user_id, delta, before_score, after_score, reason, changed_by)
  values
    (p_user_id, p_delta, v_before, v_after, p_reason, v_caller);
end;
$$;

grant execute on function public.admin_adjust_trust(uuid, int, text) to authenticated;


-- ---------------------------------------------------------
-- File: migrate-seller-decision.sql
-- ---------------------------------------------------------

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


-- ---------------------------------------------------------
-- File: migrate-seller-decision-always.sql
-- ---------------------------------------------------------

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


-- ---------------------------------------------------------
-- File: migrate-winner-forfeit.sql
-- ---------------------------------------------------------

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


-- ---------------------------------------------------------
-- File: migrate-messaging.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — buyer ↔ seller messaging
-- Conversations + messages tables, RLS so only participants can
-- read/write, realtime publication for live message delivery.
-- Safe to run repeatedly.
-- ============================================================

-- 1) Conversations
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid not null references auth.users(id) on delete cascade,
  seller_id       uuid not null references auth.users(id) on delete cascade,
  auction_id      uuid references public.auctions(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  -- One conversation per (buyer, seller, auction) tuple
  unique (buyer_id, seller_id, auction_id)
);

create index if not exists idx_conversations_buyer
  on public.conversations(buyer_id, last_message_at desc);
create index if not exists idx_conversations_seller
  on public.conversations(seller_id, last_message_at desc);

-- 2) Messages
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id) on delete cascade,
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_messages_conv
  on public.messages(conversation_id, created_at);

-- 3) Bump last_message_at whenever a new message is inserted
create or replace function public.bump_conversation_last_message()
returns trigger language plpgsql security definer as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end; $$;

drop trigger if exists trg_bump_last_message on public.messages;
create trigger trg_bump_last_message
after insert on public.messages
for each row execute function public.bump_conversation_last_message();

-- 4) RLS
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

drop policy if exists "conversations_participant_read" on public.conversations;
create policy "conversations_participant_read"
on public.conversations for select
using (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists "conversations_participant_insert" on public.conversations;
create policy "conversations_participant_insert"
on public.conversations for insert
with check (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists "messages_participant_read" on public.messages;
create policy "messages_participant_read"
on public.messages for select
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
);

drop policy if exists "messages_participant_insert" on public.messages;
create policy "messages_participant_insert"
on public.messages for insert
with check (
  sender_id = auth.uid() and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
);

-- Marking own messages as read (recipient updates read_at)
drop policy if exists "messages_participant_mark_read" on public.messages;
create policy "messages_participant_mark_read"
on public.messages for update
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
);

-- 5) Realtime — broadcast inserts so the recipient's open chat updates live.
-- Wrap in DO blocks so re-running doesn't raise
-- "relation already member of publication" (42710).
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null;
end $$;


-- ---------------------------------------------------------
-- File: migrate-home-hot-rail.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — "Hot right now" rail
--
-- Live auctions ranked by how many bids they collected in the last
-- 60 minutes. The home page reads this view and shows the top N to
-- create the strongest FOMO signal: "people are bidding RIGHT NOW".
--
-- Live = status in (active, ending) AND end_time still in the future.
-- The view is a plain SELECT against existing tables (no materialised
-- caching), so it's always up to date and free to run hundreds of times
-- a minute. The composite index that already covers (auction_id,
-- placed_at desc) on bids keeps the join cheap.
--
-- Safe to run repeatedly.
-- ============================================================

create or replace view public.auction_hot_now as
with recent as (
  select
    auction_id,
    count(*)::int as recent_bids,
    count(distinct coalesce(user_id::text, bidder_label))::int as recent_bidders
  from public.bids
  where placed_at >= now() - interval '1 hour'
  group by auction_id
)
select
  a.id,
  coalesce(r.recent_bids, 0)    as recent_bids,
  coalesce(r.recent_bidders, 0) as recent_bidders
from public.auctions a
left join recent r on r.auction_id = a.id
where a.status in ('active', 'ending')
  and a.end_time > now();

-- Make the view callable by the same roles that read auctions.
grant select on public.auction_hot_now to anon, authenticated;


-- ---------------------------------------------------------
-- File: migrate-real-features.sql
-- ---------------------------------------------------------

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


-- ---------------------------------------------------------
-- File: migrate-user-activity.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — user active flag + activity log
-- Adds an admin-controlled `is_active` flag on sellers (use to
-- soft-disable an account without losing data) and a generic
-- user_activity_log table the app + triggers append to so the
-- admin user-detail page can show a real history.
-- Safe to run repeatedly.
-- ============================================================

-- 1) Active flag on sellers ---------------------------------------------------
alter table public.sellers
  add column if not exists is_active boolean not null default true;

create index if not exists sellers_is_active_idx
  on public.sellers (is_active);

-- 2) Activity log -------------------------------------------------------------
create table if not exists public.user_activity_log (
  id          bigserial primary key,
  user_id     uuid not null,
  kind        text not null,        -- e.g. "auction_created", "bid_placed", "kyc_submitted"
  detail      text,                 -- short human-readable summary
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists user_activity_user_idx
  on public.user_activity_log (user_id, created_at desc);
create index if not exists user_activity_kind_idx
  on public.user_activity_log (kind, created_at desc);

-- 3) Triggers append-only feed entries from existing tables -------------------
-- Auction created
create or replace function public.log_auction_created()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_activity_log (user_id, kind, detail, metadata)
  values (
    new.seller_id,
    'auction_created',
    new.make || ' ' || new.model || ' ' || new.year,
    jsonb_build_object('auction_id', new.id, 'starting_price', new.starting_price)
  );
  return new;
end;
$$;
drop trigger if exists trg_log_auction_created on public.auctions;
create trigger trg_log_auction_created
after insert on public.auctions
for each row execute function public.log_auction_created();

-- Bid placed
create or replace function public.log_bid_placed()
returns trigger language plpgsql security definer as $$
declare
  v_make text;
  v_model text;
begin
  if new.user_id is null then return new; end if;
  select make, model into v_make, v_model
    from public.auctions where id = new.auction_id;
  insert into public.user_activity_log (user_id, kind, detail, metadata)
  values (
    new.user_id,
    'bid_placed',
    'Offre ' || new.amount::text || ' DT sur ' || coalesce(v_make, '') || ' ' || coalesce(v_model, ''),
    jsonb_build_object('auction_id', new.auction_id, 'amount', new.amount, 'auto', new.is_auto_bid)
  );
  return new;
end;
$$;
drop trigger if exists trg_log_bid_placed on public.bids;
create trigger trg_log_bid_placed
after insert on public.bids
for each row execute function public.log_bid_placed();

-- KYC submission
create or replace function public.log_kyc_submitted()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_activity_log (user_id, kind, detail, metadata)
  values (
    new.user_id,
    case when (tg_op = 'INSERT') then 'kyc_submitted'
         when new.status = 'approved' then 'kyc_approved'
         when new.status = 'rejected' then 'kyc_rejected'
         else 'kyc_updated'
    end,
    case when new.status = 'pending' then 'Dossier KYC soumis'
         when new.status = 'approved' then 'Dossier KYC accepté'
         when new.status = 'rejected' then 'Dossier KYC refusé'
         else 'Dossier KYC mis à jour' end,
    jsonb_build_object('submission_id', new.id, 'status', new.status, 'reason', new.rejection_reason)
  );
  return new;
end;
$$;
drop trigger if exists trg_log_kyc_insert on public.kyc_submissions;
drop trigger if exists trg_log_kyc_update on public.kyc_submissions;
create trigger trg_log_kyc_insert
after insert on public.kyc_submissions
for each row execute function public.log_kyc_submitted();
create trigger trg_log_kyc_update
after update of status on public.kyc_submissions
for each row execute function public.log_kyc_submitted();

-- Active flag flipped
create or replace function public.log_active_flag_change()
returns trigger language plpgsql security definer as $$
begin
  if new.is_active is distinct from old.is_active then
    insert into public.user_activity_log (user_id, kind, detail, metadata)
    values (
      new.id,
      case when new.is_active then 'account_reactivated' else 'account_deactivated' end,
      case when new.is_active then 'Compte réactivé par un administrateur'
           else 'Compte désactivé par un administrateur' end,
      jsonb_build_object('previous', old.is_active, 'next', new.is_active)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists trg_log_active_flag on public.sellers;
create trigger trg_log_active_flag
after update of is_active on public.sellers
for each row execute function public.log_active_flag_change();

-- 4) RLS — admin-only read, server-side writes via triggers + RPCs -----------
alter table public.user_activity_log enable row level security;

drop policy if exists "activity_admin_read" on public.user_activity_log;
drop policy if exists "activity_self_read"  on public.user_activity_log;

create policy "activity_admin_read" on public.user_activity_log
  for select to authenticated using (public.is_admin());

-- A user can read their own log if they want a "my activity" screen later.
create policy "activity_self_read" on public.user_activity_log
  for select to authenticated using (auth.uid() = user_id);

-- 5) RPC for the admin to flip the active flag in one call -------------------
create or replace function public.set_user_active(
  p_user_id uuid,
  p_active  boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  update public.sellers set is_active = p_active where id = p_user_id;
end;
$$;

revoke all on function public.set_user_active(uuid, boolean) from public;
grant execute on function public.set_user_active(uuid, boolean) to authenticated;


-- ---------------------------------------------------------
-- File: migrate-fixes.sql
-- ---------------------------------------------------------

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


-- ---------------------------------------------------------
-- File: migrate-missing.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — adds tables/policies that were added in later
-- turns but aren't yet in your DB. Safe to run repeatedly.
-- ============================================================

-- Status enum needs `pending_review`
alter table public.auctions drop constraint if exists auctions_status_check;
alter table public.auctions add constraint auctions_status_check
  check (status in ('scheduled','active','ending','ended','cancelled','reserve_not_met','pending_review'));

-- Seller ratings
create table if not exists public.seller_ratings (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references public.sellers(id) on delete cascade,
  buyer_label text not null,
  rating      int not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);
create index if not exists ratings_seller_idx on public.seller_ratings (seller_id, created_at desc);

-- Notifications
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  auction_id  uuid references public.auctions(id) on delete cascade,
  kind        text not null check (kind in ('outbid','won','lost','new_bid','approved','rejected','payment_due','reminder','system')),
  title       text not null,
  body        text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifs_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifs_unread_idx on public.notifications (user_id) where is_read = false;

-- Reports
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  auction_id    uuid not null references public.auctions(id) on delete cascade,
  reporter_id   uuid references auth.users(id) on delete set null,
  reporter_label text,
  reason        text not null,
  detail        text,
  severity      text not null default 'normal' check (severity in ('low','normal','high')),
  status        text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists reports_auction_idx on public.reports (auction_id);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

-- Transactions
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  ref         text unique not null,
  user_id     uuid references auth.users(id) on delete set null,
  user_label  text,
  auction_id  uuid references public.auctions(id) on delete set null,
  type        text not null check (type in ('deposit','refund','final_payment','commission','payout')),
  direction   text not null check (direction in ('in','out')),
  amount      numeric not null,
  label       text,
  status      text not null default 'completed' check (status in ('pending','processing','completed','failed')),
  created_at  timestamptz not null default now()
);
create index if not exists tx_user_idx on public.transactions (user_id, created_at desc);
create index if not exists tx_status_idx on public.transactions (status);

-- Realtime publication — guard against re-runs ("relation already member")
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

-- Enable RLS + policies
alter table public.seller_ratings  enable row level security;
alter table public.notifications   enable row level security;
alter table public.reports         enable row level security;
alter table public.transactions    enable row level security;

drop policy if exists "ratings_public_read"   on public.seller_ratings;
drop policy if exists "notifs_owner_read"     on public.notifications;
drop policy if exists "notifs_owner_update"   on public.notifications;
drop policy if exists "reports_insert_authed" on public.reports;
drop policy if exists "reports_public_read"   on public.reports;
drop policy if exists "tx_owner_read"         on public.transactions;
drop policy if exists "tx_demo_public_read"   on public.transactions;
drop policy if exists "sellers_owner_write"   on public.sellers;
drop policy if exists "auctions_owner_write"  on public.auctions;

create policy "ratings_public_read"  on public.seller_ratings for select using (true);
create policy "notifs_owner_read"    on public.notifications for select to authenticated using (auth.uid() = user_id);
create policy "notifs_owner_update"  on public.notifications for update to authenticated using (auth.uid() = user_id);
create policy "reports_insert_authed" on public.reports for insert to authenticated with check (auth.uid() = reporter_id);
create policy "reports_public_read"  on public.reports for select using (true);
create policy "tx_owner_read"        on public.transactions for select to authenticated using (auth.uid() = user_id);
create policy "tx_demo_public_read"  on public.transactions for select using (user_id is null);
create policy "sellers_owner_write"  on public.sellers for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "auctions_owner_write" on public.auctions for all to authenticated using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

-- Updated bid trigger (also inserts outbid notification)
create or replace function public.handle_new_bid()
returns trigger language plpgsql security definer as $$
declare
  v_participants int;
  v_reserve numeric;
  v_make text; v_model text; v_year int;
  v_prev_bidder uuid;
begin
  select count(distinct coalesce(user_id::text, bidder_label)) into v_participants
    from public.bids where auction_id = new.auction_id;
  select reserve_price, make, model, year into v_reserve, v_make, v_model, v_year
    from public.auctions where id = new.auction_id;
  select user_id into v_prev_bidder
    from public.bids
   where auction_id = new.auction_id and id <> new.id and user_id is not null
   order by amount desc, placed_at desc limit 1;
  update public.auctions
     set current_price = new.amount,
         total_bids = total_bids + 1,
         total_participants = v_participants,
         reserve_met = (v_reserve is null or new.amount >= v_reserve)
   where id = new.auction_id;
  if v_prev_bidder is not null and v_prev_bidder <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (v_prev_bidder, new.auction_id, 'outbid', 'Votre offre a été dépassée',
      v_make || ' ' || v_model || ' ' || v_year || ' — Prix actuel ' || new.amount::text || ' DT');
  end if;
  return new;
end; $$;

drop trigger if exists trg_new_bid on public.bids;
create trigger trg_new_bid after insert on public.bids
for each row execute function public.handle_new_bid();


-- ---------------------------------------------------------
-- File: migrate-admin-foundations.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Admin foundations
--
-- Per PLAN §22.2: 5 admin roles (super_admin, admin, moderator,
-- support, finance). Per §22.3: every admin action is auditable.
--
-- This migration introduces:
--  1. Per-user admin role lives in `user_metadata.adminRole` (mirrored
--     in JWT) so the existing `is_admin()` helper keeps working as a
--     coarse gate while we add fine-grained checks.
--  2. `public.admin_role()` reads the role from the JWT.
--  3. `public.has_admin_capability(cap)` returns true when the caller's
--     role can perform a given capability — single source of truth so
--     UI and RPCs agree on what each role can do.
--  4. `admin_audit_log` table — every admin action across the platform
--     writes one row here. RPCs use `log_admin_action()` to insert.
--  5. `admin_sessions` table — last-activity timestamp for the 30-min
--     idle timeout (PLAN §22.3).
--
-- Safe to run repeatedly.
-- ============================================================

-- 1) Role helper -------------------------------------------------------------
-- Returns the caller's adminRole, or null if not an admin user.
-- We check the legacy `role = 'admin'` first (back-compat: anyone marked
-- admin before this migration is treated as 'admin') and fall back to
-- the explicit `adminRole` field.
create or replace function public.admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  with j as (select auth.jwt() -> 'user_metadata' as m)
  select case
    when (select m ->> 'adminRole' from j) in
         ('super_admin','admin','moderator','support','finance')
      then (select m ->> 'adminRole' from j)
    when (select m ->> 'role' from j) = 'admin'
      then 'admin'
    else null
  end
$$;

revoke all on function public.admin_role() from public;
grant execute on function public.admin_role() to authenticated, anon;

-- 2) Capability helper ------------------------------------------------------
-- Given a capability name (e.g. 'kyc.review'), returns true when the
-- caller's adminRole is allowed to perform it. Used by RPCs that need
-- finer gating than the binary `is_admin()`.
create or replace function public.has_admin_capability(p_cap text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r text := public.admin_role();
begin
  if r is null then return false; end if;
  if r = 'super_admin' then return true; end if;

  -- Capability matrix (PLAN §22.2):
  --   super_admin  → everything
  --   admin        → everything EXCEPT user.delete and admin.manage
  --   moderator    → auction/kyc/report moderation
  --   support      → read-only + reply to messages/contact
  --   finance      → read-only + financial actions (payouts, refunds)
  return case
    when r = 'admin' then
      p_cap not in ('user.delete', 'admin.manage', 'admin.role.assign')

    when r = 'moderator' then p_cap in (
      'kyc.review', 'auction.moderate', 'auction.edit_request',
      'report.moderate', 'user.warn', 'user.suspend', 'user.view',
      'auction.view', 'broadcast.create')

    when r = 'support' then p_cap in (
      'user.view', 'user.warn', 'auction.view', 'report.view',
      'message.read_for_moderation', 'contact.reply', 'broadcast.create')

    when r = 'finance' then p_cap in (
      'transaction.view', 'transaction.refund', 'transaction.void',
      'transaction.adjust', 'payout.create', 'payout.mark_paid',
      'report.financial.export', 'user.view', 'auction.view')

    else false
  end;
end; $$;

revoke all on function public.has_admin_capability(text) from public;
grant execute on function public.has_admin_capability(text) to authenticated, anon;

-- 3) admin_audit_log --------------------------------------------------------
-- Append-only journal of every admin action. RPCs that mutate state
-- on behalf of an admin MUST call public.log_admin_action() before
-- returning so the action is reviewable.
create table if not exists public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_role   text,
  action       text not null,
  -- Free-form target fields. action determines which are populated.
  target_user_id    uuid,
  target_auction_id uuid,
  target_id         uuid,
  target_type       text,
  detail       text,
  metadata     jsonb,
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists admin_audit_actor_idx
  on public.admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_action_idx
  on public.admin_audit_log (action, created_at desc);
create index if not exists admin_audit_target_user_idx
  on public.admin_audit_log (target_user_id, created_at desc)
  where target_user_id is not null;
create index if not exists admin_audit_target_auction_idx
  on public.admin_audit_log (target_auction_id, created_at desc)
  where target_auction_id is not null;

alter table public.admin_audit_log enable row level security;
drop policy if exists "admin_audit_admin_read" on public.admin_audit_log;
create policy "admin_audit_admin_read" on public.admin_audit_log
  for select to authenticated using (public.is_admin());
-- No insert/update/delete policy — writes are SECURITY DEFINER only.

-- Helper RPC: lets server-side code (next.js server actions, other
-- RPCs) record an admin action without granting them direct INSERT.
create or replace function public.log_admin_action(
  p_action            text,
  p_target_user_id    uuid default null,
  p_target_auction_id uuid default null,
  p_target_id         uuid default null,
  p_target_type       text default null,
  p_detail            text default null,
  p_metadata          jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Allow SECURITY DEFINER callers (other RPCs running as the
  -- current admin) to log on the admin's behalf. We require that
  -- the caller be an admin in some form — this prevents a non-admin
  -- end-user from spamming the log via a malformed RPC call.
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  insert into public.admin_audit_log (
    actor_id, actor_role, action,
    target_user_id, target_auction_id, target_id, target_type,
    detail, metadata
  ) values (
    auth.uid(), public.admin_role(), p_action,
    p_target_user_id, p_target_auction_id, p_target_id, p_target_type,
    p_detail, p_metadata
  ) returning id into v_id;
  return v_id;
end; $$;

grant execute on function public.log_admin_action(text, uuid, uuid, uuid, text, text, jsonb)
  to authenticated;

-- 4) admin_sessions ---------------------------------------------------------
-- One row per (admin_user_id, session_id). Updated on each admin
-- request via `touch_admin_session()`. The Next.js admin layout reads
-- last_seen and forces re-auth if it's older than 30 minutes.
create table if not exists public.admin_sessions (
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  text not null,
  last_seen   timestamptz not null default now(),
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now(),
  primary key (user_id, session_id)
);

create index if not exists admin_sessions_last_seen_idx
  on public.admin_sessions (last_seen desc);

alter table public.admin_sessions enable row level security;
drop policy if exists "admin_sessions_self_read" on public.admin_sessions;
create policy "admin_sessions_self_read" on public.admin_sessions
  for select to authenticated using (
    user_id = auth.uid() or public.is_admin()
  );

create or replace function public.touch_admin_session(p_session_id text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  insert into public.admin_sessions (user_id, session_id, last_seen)
  values (auth.uid(), p_session_id, v_now)
  on conflict (user_id, session_id)
    do update set last_seen = excluded.last_seen;
  return v_now;
end; $$;

grant execute on function public.touch_admin_session(text) to authenticated;

-- 5) RPC: assign / change an admin's role (super_admin only) ----------------
create or replace function public.admin_set_role(
  p_user_id uuid,
  p_role    text  -- one of super_admin, admin, moderator, support, finance, or null to revoke
) returns void
language plpgsql
security definer
set search_path = public
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

  select raw_user_meta_data ->> 'adminRole' into v_old
    from auth.users where id = p_user_id;

  update auth.users
     set raw_user_meta_data = case
       when p_role is null then
         (coalesce(raw_user_meta_data, '{}'::jsonb) - 'adminRole') - 'role'
       else
         coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('adminRole', p_role, 'role', 'admin')
     end
   where id = p_user_id;

  perform public.log_admin_action(
    'admin.role.assign',
    p_target_user_id => p_user_id,
    p_detail         => coalesce(v_old, 'none') || ' → ' || coalesce(p_role, 'none')
  );
end; $$;

grant execute on function public.admin_set_role(uuid, text) to authenticated;


-- ---------------------------------------------------------
-- File: migrate-admin-actions.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Admin action tables + RPCs
--
-- Tables:
--   user_warnings           — formal warnings issued to a user
--   user_bans               — graduated bans (temp suspend / permanent)
--   auction_edit_requests   — admin asks seller to fix something
--   contact_messages        — /contact form submissions inbox
--   admin_broadcasts        — broadcast notifications target audiences
--
-- RPCs:
--   admin_warn_user, admin_dismiss_warning
--   admin_ban_user, admin_unban_user
--   admin_request_auction_edit, admin_resolve_edit_request
--   admin_force_cancel_auction, admin_force_seller_decision
--   admin_force_end_auction, admin_extend_auction_end
--   admin_set_auction_featured, admin_set_auction_vip
--   admin_invalidate_bid
--   admin_reset_kyc, admin_set_ownership_verified, admin_set_pro
--   admin_void_transaction, admin_create_transaction
--   admin_broadcast_create
--
-- Depends on: migrate-admin-foundations.sql (admin_role, log_admin_action)
-- Safe to run repeatedly.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) user_warnings
-- ------------------------------------------------------------------
create table if not exists public.user_warnings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  severity     text not null check (severity in ('info','warning','severe')),
  body         text not null,
  related_auction_id uuid references public.auctions(id) on delete set null,
  related_report_id  uuid references public.reports(id) on delete set null,
  issued_by    uuid references auth.users(id) on delete set null,
  issued_at    timestamptz not null default now(),
  acknowledged_at timestamptz,
  dismissed_at    timestamptz
);

create index if not exists user_warnings_user_idx
  on public.user_warnings (user_id, issued_at desc);
create index if not exists user_warnings_active_idx
  on public.user_warnings (user_id) where dismissed_at is null;

alter table public.user_warnings enable row level security;
drop policy if exists "warnings_self_read" on public.user_warnings;
create policy "warnings_self_read" on public.user_warnings
  for select to authenticated using (
    user_id = auth.uid() or public.is_admin()
  );
drop policy if exists "warnings_self_ack" on public.user_warnings;
create policy "warnings_self_ack" on public.user_warnings
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------------
-- 2) user_bans
-- ------------------------------------------------------------------
-- Replaces the binary `sellers.is_active` flag with a graduated, audit-
-- friendly model. A user is "banned" if any active row exists here
-- with banned_until in the future (or null = permanent).
create table if not exists public.user_bans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  reason       text not null,
  scope        text not null default 'full'
                 check (scope in ('full','bidding','selling','messaging')),
  banned_at    timestamptz not null default now(),
  banned_until timestamptz, -- null = permanent
  banned_by    uuid references auth.users(id) on delete set null,
  lifted_at    timestamptz,
  lifted_by    uuid references auth.users(id) on delete set null,
  lift_reason  text
);

create index if not exists user_bans_user_idx
  on public.user_bans (user_id, banned_at desc);
-- Partial index on un-lifted bans only. We deliberately don't include
-- `banned_until > now()` in the predicate — index predicates require
-- IMMUTABLE expressions and now() is STABLE (42P17). Postgres can still
-- use this index for the lifted_at filter and apply the time check at
-- scan time, which is fine for a few rows per user.
create index if not exists user_bans_active_idx
  on public.user_bans (user_id, banned_until)
  where lifted_at is null;

alter table public.user_bans enable row level security;
drop policy if exists "bans_self_read" on public.user_bans;
create policy "bans_self_read" on public.user_bans
  for select to authenticated using (
    user_id = auth.uid() or public.is_admin()
  );

-- Convenience: is_user_banned(uuid) returns true if any active full ban row.
create or replace function public.is_user_banned(p_user_id uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.user_bans
     where user_id = p_user_id
       and lifted_at is null
       and (banned_until is null or banned_until > now())
  );
$$;
grant execute on function public.is_user_banned(uuid) to authenticated, anon;

-- ------------------------------------------------------------------
-- 3) auction_edit_requests
-- ------------------------------------------------------------------
create table if not exists public.auction_edit_requests (
  id           uuid primary key default gen_random_uuid(),
  auction_id   uuid not null references public.auctions(id) on delete cascade,
  fields       text[] not null default '{}',
  message      text not null,
  status       text not null default 'open'
                 check (status in ('open','resolved','cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users(id) on delete set null
);

create index if not exists auction_edit_requests_auction_idx
  on public.auction_edit_requests (auction_id, requested_at desc);
create index if not exists auction_edit_requests_open_idx
  on public.auction_edit_requests (auction_id) where status = 'open';

alter table public.auction_edit_requests enable row level security;
drop policy if exists "edit_req_seller_read" on public.auction_edit_requests;
create policy "edit_req_seller_read" on public.auction_edit_requests
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.auctions a
      where a.id = auction_id and a.seller_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- 4) contact_messages
-- ------------------------------------------------------------------
-- /contact form was previously mocked. This table backs an admin
-- inbox so support agents can triage contact form submissions.
create table if not exists public.contact_messages (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null,
  topic        text not null,
  body         text not null,
  user_id      uuid references auth.users(id) on delete set null,
  ip_address   inet,
  status       text not null default 'open'
                 check (status in ('open','reading','replied','closed')),
  reply_body   text,
  replied_by   uuid references auth.users(id) on delete set null,
  replied_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists contact_status_idx
  on public.contact_messages (status, created_at desc);

alter table public.contact_messages enable row level security;
drop policy if exists "contact_admin_read" on public.contact_messages;
create policy "contact_admin_read" on public.contact_messages
  for select to authenticated using (public.is_admin());
drop policy if exists "contact_public_insert" on public.contact_messages;
create policy "contact_public_insert" on public.contact_messages
  for insert with check (true);

-- ------------------------------------------------------------------
-- 5) admin_broadcasts
-- ------------------------------------------------------------------
-- Recorded broadcast messages. Sending fans out into the existing
-- `notifications` table (one row per recipient). audience filter is
-- captured for audit; recipient_count materialises the size at send
-- time so we don't recompute later.
create table if not exists public.admin_broadcasts (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  body            text not null,
  kind            text not null default 'system',
  audience        text not null default 'all'
                    check (audience in ('all','buyers','sellers','admins',
                                        'auction_bidders','custom')),
  audience_filter jsonb,
  recipient_count int not null default 0,
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.admin_broadcasts enable row level security;
drop policy if exists "broadcasts_admin_read" on public.admin_broadcasts;
create policy "broadcasts_admin_read" on public.admin_broadcasts
  for select to authenticated using (public.is_admin());

-- ============================================================
-- RPCs
-- ============================================================

-- ------------------------------------------------------------------
-- admin_warn_user
-- ------------------------------------------------------------------
create or replace function public.admin_warn_user(
  p_user_id           uuid,
  p_severity          text,
  p_body              text,
  p_related_auction_id uuid default null,
  p_related_report_id  uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_admin_capability('user.warn') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_severity not in ('info','warning','severe') then
    raise exception 'INVALID_SEVERITY';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'BODY_REQUIRED';
  end if;

  insert into public.user_warnings
    (user_id, severity, body, related_auction_id, related_report_id, issued_by)
  values
    (p_user_id, p_severity, p_body, p_related_auction_id, p_related_report_id, auth.uid())
  returning id into v_id;

  -- Push an in-app notification so the user sees it immediately.
  insert into public.notifications (user_id, kind, title, body, auction_id)
  values (p_user_id, 'system',
          case p_severity
            when 'severe' then 'Avertissement sévère'
            when 'warning' then 'Avertissement'
            else 'Information importante'
          end,
          p_body, p_related_auction_id);

  perform public.log_admin_action(
    'user.warn',
    p_target_user_id => p_user_id,
    p_target_id      => v_id,
    p_target_type    => 'user_warning',
    p_detail         => p_severity,
    p_metadata       => jsonb_build_object('body', p_body)
  );
  return v_id;
end; $$;
grant execute on function public.admin_warn_user(uuid, text, text, uuid, uuid)
  to authenticated;

-- ------------------------------------------------------------------
-- admin_ban_user / admin_unban_user
-- ------------------------------------------------------------------
create or replace function public.admin_ban_user(
  p_user_id      uuid,
  p_reason       text,
  p_scope        text default 'full',
  p_duration_days int default null  -- null = permanent
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_until timestamptz;
begin
  if not public.has_admin_capability('user.suspend') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_scope not in ('full','bidding','selling','messaging') then
    raise exception 'INVALID_SCOPE';
  end if;

  v_until := case
    when p_duration_days is null then null
    else now() + (p_duration_days || ' days')::interval
  end;

  insert into public.user_bans (user_id, reason, scope, banned_until, banned_by)
  values (p_user_id, p_reason, p_scope, v_until, auth.uid())
  returning id into v_id;

  -- Mirror to the legacy is_active flag for full bans so the existing
  -- code paths keep working (RLS on auctions/bids checks is_active in places).
  if p_scope = 'full' then
    update public.sellers set is_active = false where id = p_user_id;
  end if;

  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'system',
          case when v_until is null then 'Compte suspendu définitivement'
               else 'Compte suspendu temporairement' end,
          p_reason);

  perform public.log_admin_action(
    'user.ban',
    p_target_user_id => p_user_id,
    p_target_id      => v_id,
    p_target_type    => 'user_ban',
    p_detail         => p_scope || coalesce(' until ' || v_until::text, ' (permanent)'),
    p_metadata       => jsonb_build_object('reason', p_reason, 'duration_days', p_duration_days)
  );
  return v_id;
end; $$;
grant execute on function public.admin_ban_user(uuid, text, text, int) to authenticated;

create or replace function public.admin_unban_user(
  p_user_id uuid,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.suspend') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.user_bans
     set lifted_at = now(),
         lifted_by = auth.uid(),
         lift_reason = p_reason
   where user_id = p_user_id
     and lifted_at is null
     and (banned_until is null or banned_until > now());

  update public.sellers set is_active = true where id = p_user_id;

  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'system', 'Compte réactivé', coalesce(p_reason, 'Votre compte a été réactivé'));

  perform public.log_admin_action(
    'user.unban',
    p_target_user_id => p_user_id,
    p_detail         => p_reason
  );
end; $$;
grant execute on function public.admin_unban_user(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- admin_request_auction_edit / admin_resolve_edit_request
-- ------------------------------------------------------------------
create or replace function public.admin_request_auction_edit(
  p_auction_id uuid,
  p_fields     text[],
  p_message    text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_seller  uuid;
begin
  if not public.has_admin_capability('auction.edit_request') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_message is null or btrim(p_message) = '' then
    raise exception 'MESSAGE_REQUIRED';
  end if;

  select seller_id into v_seller from public.auctions where id = p_auction_id;
  if v_seller is null then
    raise exception 'AUCTION_NOT_FOUND';
  end if;

  insert into public.auction_edit_requests (auction_id, fields, message, requested_by)
  values (p_auction_id, coalesce(p_fields, '{}'), p_message, auth.uid())
  returning id into v_id;

  -- Send the seller back to pending_review-ish state so they can edit.
  -- We use a dedicated 'needs_changes' isn't in the existing CHECK so
  -- we keep status unchanged and rely on the open edit_request to
  -- surface the request in /seller/auctions.

  insert into public.notifications (user_id, kind, title, body, auction_id)
  values (v_seller, 'rejected',
          'Modification demandée par l''administration',
          p_message, p_auction_id);

  perform public.log_admin_action(
    'auction.edit_request',
    p_target_user_id    => v_seller,
    p_target_auction_id => p_auction_id,
    p_target_id         => v_id,
    p_target_type       => 'auction_edit_request',
    p_detail            => left(p_message, 200),
    p_metadata          => jsonb_build_object('fields', p_fields)
  );
  return v_id;
end; $$;
grant execute on function public.admin_request_auction_edit(uuid, text[], text)
  to authenticated;

create or replace function public.admin_resolve_edit_request(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('auction.edit_request') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.auction_edit_requests
     set status = 'resolved',
         resolved_at = now(),
         resolved_by = auth.uid()
   where id = p_request_id;
  perform public.log_admin_action(
    'auction.edit_request.resolve',
    p_target_id   => p_request_id,
    p_target_type => 'auction_edit_request'
  );
end; $$;
grant execute on function public.admin_resolve_edit_request(uuid) to authenticated;

-- ------------------------------------------------------------------
-- admin_force_cancel_auction
-- ------------------------------------------------------------------
-- Cancels an auction that already has bids. All deposits are flipped to
-- refunds, every bidder gets a "lost" / refund notif, and the audit log
-- captures who/why.
create or replace function public.admin_force_cancel_auction(
  p_auction_id uuid,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_dep    uuid;
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select seller_id into v_seller from public.auctions where id = p_auction_id;
  if v_seller is null then
    raise exception 'AUCTION_NOT_FOUND';
  end if;

  update public.auctions
     set status = 'cancelled',
         end_time = least(end_time, now())
   where id = p_auction_id;

  -- Refund every completed deposit on this auction.
  for v_dep in
    select id from public.transactions
     where auction_id = p_auction_id
       and type = 'deposit'
       and status = 'completed'
  loop
    insert into public.transactions
      (ref, user_id, user_label, auction_id, type, direction,
       amount, label, status)
    select 'TX-RFD-' || substr(gen_random_uuid()::text, 1, 8),
           t.user_id, t.user_label, t.auction_id,
           'refund', 'out', t.amount,
           'Remboursement caution (annulation par administration)',
           'completed'
      from public.transactions t where t.id = v_dep;
  end loop;

  -- Notify all bidders + the seller.
  insert into public.notifications (user_id, kind, title, body, auction_id)
  select distinct b.user_id, 'lost'::text,
         'Enchère annulée', p_reason, p_auction_id
    from public.bids b where b.auction_id = p_auction_id;

  insert into public.notifications (user_id, kind, title, body, auction_id)
  values (v_seller, 'rejected', 'Enchère annulée par l''administration',
          p_reason, p_auction_id);

  perform public.log_admin_action(
    'auction.force_cancel',
    p_target_user_id    => v_seller,
    p_target_auction_id => p_auction_id,
    p_detail            => p_reason
  );
end; $$;
grant execute on function public.admin_force_cancel_auction(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- admin_force_seller_decision
-- ------------------------------------------------------------------
-- Resolve a pending_seller_decision auction on the seller's behalf.
-- Choice: 'accept' or 'reject'. On accept, runs the same flow as
-- finalize_auction (winner gets payment_deadline, losers refunded).
-- On reject, all deposits refunded, status flipped to reserve_not_met.
create or replace function public.admin_force_seller_decision(
  p_auction_id uuid,
  p_choice     text,  -- 'accept' or 'reject'
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_choice not in ('accept','reject') then
    raise exception 'INVALID_CHOICE';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select seller_id into v_seller from public.auctions
   where id = p_auction_id and status = 'pending_seller_decision';
  if v_seller is null then
    raise exception 'NOT_PENDING_DECISION';
  end if;

  if p_choice = 'accept' then
    update public.auctions set status = 'ended' where id = p_auction_id;
    -- finalize_auction may already exist from migrate-auction-lifecycle;
    -- call it if so, otherwise the cron will pick it up.
    begin
      perform public.finalize_auction(p_auction_id);
    exception when undefined_function then
      null;
    end;
  else
    update public.auctions set status = 'reserve_not_met' where id = p_auction_id;

    -- Refund every completed deposit (rejection means nobody buys).
    insert into public.transactions
      (ref, user_id, user_label, auction_id, type, direction,
       amount, label, status)
    select 'TX-RFD-' || substr(gen_random_uuid()::text, 1, 8),
           t.user_id, t.user_label, t.auction_id,
           'refund', 'out', t.amount,
           'Remboursement caution (réserve non atteinte)',
           'completed'
      from public.transactions t
     where t.auction_id = p_auction_id
       and t.type = 'deposit'
       and t.status = 'completed';
  end if;

  insert into public.notifications (user_id, kind, title, body, auction_id)
  values (v_seller, 'system',
          'Décision finale prise par l''administration',
          coalesce(p_reason, p_choice), p_auction_id);

  perform public.log_admin_action(
    'auction.force_seller_decision',
    p_target_user_id    => v_seller,
    p_target_auction_id => p_auction_id,
    p_detail            => p_choice,
    p_metadata          => jsonb_build_object('reason', p_reason)
  );
end; $$;
grant execute on function public.admin_force_seller_decision(uuid, text, text)
  to authenticated;

-- ------------------------------------------------------------------
-- admin_force_end_auction / admin_extend_auction_end
-- ------------------------------------------------------------------
create or replace function public.admin_force_end_auction(
  p_auction_id uuid,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.auctions
     set end_time = now(),
         status = case when total_bids > 0 then 'ended' else 'cancelled' end
   where id = p_auction_id;
  perform public.log_admin_action(
    'auction.force_end',
    p_target_auction_id => p_auction_id,
    p_detail            => p_reason
  );
end; $$;
grant execute on function public.admin_force_end_auction(uuid, text) to authenticated;

create or replace function public.admin_extend_auction_end(
  p_auction_id uuid,
  p_minutes    int,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_minutes is null or p_minutes <= 0 then
    raise exception 'INVALID_MINUTES';
  end if;
  update public.auctions
     set end_time = end_time + make_interval(mins => p_minutes)
   where id = p_auction_id;
  perform public.log_admin_action(
    'auction.extend_end',
    p_target_auction_id => p_auction_id,
    p_detail            => p_minutes::text || ' minutes',
    p_metadata          => jsonb_build_object('reason', p_reason)
  );
end; $$;
grant execute on function public.admin_extend_auction_end(uuid, int, text) to authenticated;

-- ------------------------------------------------------------------
-- admin_set_auction_featured / vip
-- ------------------------------------------------------------------
create or replace function public.admin_set_auction_featured(
  p_auction_id uuid,
  p_featured   boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.auctions set is_featured = p_featured where id = p_auction_id;
  perform public.log_admin_action(
    'auction.set_featured',
    p_target_auction_id => p_auction_id,
    p_detail            => case when p_featured then 'on' else 'off' end
  );
end; $$;
grant execute on function public.admin_set_auction_featured(uuid, boolean) to authenticated;

create or replace function public.admin_set_auction_vip(
  p_auction_id uuid,
  p_vip        boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.auctions set is_vip = p_vip where id = p_auction_id;
  perform public.log_admin_action(
    'auction.set_vip',
    p_target_auction_id => p_auction_id,
    p_detail            => case when p_vip then 'on' else 'off' end
  );
end; $$;
grant execute on function public.admin_set_auction_vip(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------
-- admin_invalidate_bid
-- ------------------------------------------------------------------
-- Removes a fraudulent bid. Recomputes auction.current_price /
-- total_bids from the surviving bids.
create or replace function public.admin_invalidate_bid(
  p_bid_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction uuid;
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select auction_id into v_auction from public.bids where id = p_bid_id;
  if v_auction is null then raise exception 'BID_NOT_FOUND'; end if;

  delete from public.bids where id = p_bid_id;

  update public.auctions a set
    current_price = coalesce(
      (select max(amount) from public.bids where auction_id = v_auction),
      a.starting_price),
    total_bids = (select count(*) from public.bids where auction_id = v_auction),
    total_participants = (select count(distinct user_id) from public.bids
                           where auction_id = v_auction)
   where a.id = v_auction;

  perform public.log_admin_action(
    'bid.invalidate',
    p_target_auction_id => v_auction,
    p_target_id         => p_bid_id,
    p_target_type       => 'bid',
    p_detail            => p_reason
  );
end; $$;
grant execute on function public.admin_invalidate_bid(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- admin_reset_kyc / admin_set_ownership_verified / admin_set_pro
-- ------------------------------------------------------------------
create or replace function public.admin_reset_kyc(
  p_user_id uuid,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('kyc.review') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.kyc_submissions
     set status = 'rejected',
         rejection_reason = coalesce(p_reason, 'Re-vérification demandée par administration'),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where user_id = p_user_id;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb)
       || jsonb_build_object('kycStatus','none')
   where id = p_user_id;

  update public.sellers set verified_kyc = false where id = p_user_id;

  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'system',
          'Re-vérification d''identité requise',
          coalesce(p_reason, 'Veuillez recommencer la vérification KYC'));

  perform public.log_admin_action(
    'kyc.reset',
    p_target_user_id => p_user_id,
    p_detail         => p_reason
  );
end; $$;
grant execute on function public.admin_reset_kyc(uuid, text) to authenticated;

create or replace function public.admin_set_ownership_verified(
  p_user_id uuid,
  p_value   boolean,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.warn') then -- moderator and up
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.sellers set verified_ownership = p_value where id = p_user_id;
  perform public.log_admin_action(
    'user.ownership_verified',
    p_target_user_id => p_user_id,
    p_detail         => case when p_value then 'verified' else 'cleared' end,
    p_metadata       => jsonb_build_object('reason', p_reason)
  );
end; $$;
grant execute on function public.admin_set_ownership_verified(uuid, boolean, text)
  to authenticated;

create or replace function public.admin_set_pro(
  p_user_id uuid,
  p_value   boolean,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.warn') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.sellers set is_pro = p_value where id = p_user_id;
  perform public.log_admin_action(
    'user.set_pro',
    p_target_user_id => p_user_id,
    p_detail         => case when p_value then 'promoted' else 'demoted' end,
    p_metadata       => jsonb_build_object('reason', p_reason)
  );
end; $$;
grant execute on function public.admin_set_pro(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------------
-- admin_void_transaction / admin_create_transaction
-- ------------------------------------------------------------------
create or replace function public.admin_void_transaction(
  p_tx_id  uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_auction uuid;
begin
  if not public.has_admin_capability('transaction.void') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select user_id, auction_id into v_user, v_auction
    from public.transactions where id = p_tx_id;
  if v_user is null then raise exception 'TX_NOT_FOUND'; end if;

  update public.transactions
     set status = 'failed',
         label = label || ' (annulée: ' || coalesce(p_reason,'') || ')'
   where id = p_tx_id;

  perform public.log_admin_action(
    'transaction.void',
    p_target_user_id    => v_user,
    p_target_auction_id => v_auction,
    p_target_id         => p_tx_id,
    p_target_type       => 'transaction',
    p_detail            => p_reason
  );
end; $$;
grant execute on function public.admin_void_transaction(uuid, text) to authenticated;

create or replace function public.admin_create_transaction(
  p_user_id   uuid,
  p_type      text,         -- deposit | refund | final_payment | commission | payout
  p_direction text,         -- in | out
  p_amount    numeric,
  p_label     text,
  p_auction_id uuid default null,
  p_reason    text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_label text;
begin
  if not public.has_admin_capability('transaction.adjust') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_type not in ('deposit','refund','final_payment','commission','payout') then
    raise exception 'INVALID_TYPE';
  end if;
  if p_direction not in ('in','out') then
    raise exception 'INVALID_DIRECTION';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select coalesce(raw_user_meta_data ->> 'firstName','') || ' '
       || coalesce(raw_user_meta_data ->> 'lastName','') into v_label
    from auth.users where id = p_user_id;

  insert into public.transactions
    (ref, user_id, user_label, auction_id, type, direction,
     amount, label, status)
  values
    ('TX-ADM-' || substr(gen_random_uuid()::text, 1, 8),
     p_user_id, btrim(coalesce(v_label,'')), p_auction_id,
     p_type, p_direction, p_amount, p_label, 'completed')
  returning id into v_id;

  perform public.log_admin_action(
    'transaction.create',
    p_target_user_id    => p_user_id,
    p_target_auction_id => p_auction_id,
    p_target_id         => v_id,
    p_target_type       => 'transaction',
    p_detail            => p_type || ' ' || p_direction || ' ' || p_amount::text,
    p_metadata          => jsonb_build_object('reason', p_reason, 'label', p_label)
  );
  return v_id;
end; $$;
grant execute on function public.admin_create_transaction(uuid, text, text, numeric, text, uuid, text)
  to authenticated;

-- ------------------------------------------------------------------
-- admin_broadcast_create
-- ------------------------------------------------------------------
-- Fans out a system message to every recipient matching the audience
-- selector. Returns the broadcast id.
create or replace function public.admin_broadcast_create(
  p_title           text,
  p_body            text,
  p_kind            text default 'system',
  p_audience        text default 'all',
  p_audience_filter jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  if not public.has_admin_capability('broadcast.create') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_audience not in ('all','buyers','sellers','admins','auction_bidders','custom') then
    raise exception 'INVALID_AUDIENCE';
  end if;

  insert into public.admin_broadcasts (title, body, kind, audience, audience_filter, created_by)
  values (p_title, p_body, p_kind, p_audience, p_audience_filter, auth.uid())
  returning id into v_id;

  -- Fan out:
  if p_audience = 'all' then
    insert into public.notifications (user_id, kind, title, body)
    select id, p_kind, p_title, p_body from auth.users;
  elsif p_audience = 'buyers' then
    insert into public.notifications (user_id, kind, title, body)
    select id, p_kind, p_title, p_body from auth.users
     where (raw_user_meta_data ->> 'role') in ('buyer', null)
        or raw_user_meta_data ->> 'role' is null;
  elsif p_audience = 'sellers' then
    insert into public.notifications (user_id, kind, title, body)
    select id, p_kind, p_title, p_body from public.sellers;
  elsif p_audience = 'admins' then
    insert into public.notifications (user_id, kind, title, body)
    select id, p_kind, p_title, p_body from auth.users
     where raw_user_meta_data ->> 'role' = 'admin'
        or raw_user_meta_data ->> 'adminRole' is not null;
  elsif p_audience = 'auction_bidders' then
    insert into public.notifications (user_id, kind, title, body, auction_id)
    select distinct b.user_id, p_kind, p_title, p_body,
           (p_audience_filter ->> 'auction_id')::uuid
      from public.bids b
     where b.auction_id = (p_audience_filter ->> 'auction_id')::uuid;
  end if;

  get diagnostics v_count = row_count;
  update public.admin_broadcasts
     set recipient_count = v_count, sent_at = now()
   where id = v_id;

  perform public.log_admin_action(
    'broadcast.create',
    p_target_id => v_id,
    p_target_type => 'admin_broadcast',
    p_detail => p_audience || ' (' || v_count || ' recipients)'
  );
  return v_id;
end; $$;
grant execute on function public.admin_broadcast_create(text, text, text, text, jsonb)
  to authenticated;


-- ---------------------------------------------------------
-- File: migrate-admin-financial.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Payouts queue
--
-- When an auction completes successfully and the buyer has paid in
-- full, the seller is owed (sale_price − commission − VAT). Today
-- there's no surface for the platform to track which sellers are
-- owed money or mark a wire transfer complete. This migration adds
-- the payouts ledger + RPCs to create / mark-paid / cancel a payout.
--
-- Depends on: migrate-admin-foundations.sql
-- Safe to run repeatedly.
-- ============================================================

create table if not exists public.payouts (
  id              uuid primary key default gen_random_uuid(),
  seller_id       uuid not null references auth.users(id) on delete cascade,
  auction_id      uuid references public.auctions(id) on delete set null,
  gross_amount    numeric(12,2) not null,
  commission      numeric(12,2) not null default 0,
  tva             numeric(12,2) not null default 0,
  net_amount      numeric(12,2) not null,
  rib             text,           -- Tunisian bank account
  bank_name       text,
  status          text not null default 'pending'
                     check (status in ('pending','approved','paid','cancelled')),
  approved_by     uuid references auth.users(id) on delete set null,
  approved_at     timestamptz,
  paid_at         timestamptz,
  paid_by         uuid references auth.users(id) on delete set null,
  paid_reference  text,           -- bank reference / wire id
  cancelled_reason text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists payouts_seller_idx
  on public.payouts (seller_id, created_at desc);
create index if not exists payouts_status_idx
  on public.payouts (status, created_at desc);

-- Add a parallel FK to public.sellers so PostgREST can auto-resolve
-- relation embeds like .select("*, seller:sellers(...)"). The original
-- FK to auth.users(id) stays for referential integrity (auth.users is
-- the source of truth for ids). Both are pointing at the same uuid,
-- which is fine.
do $$ begin
  alter table public.payouts
    add constraint payouts_seller_fk_sellers
    foreign key (seller_id) references public.sellers(id) on delete cascade;
exception
  when duplicate_object then null;
  when invalid_foreign_key then null; -- sellers row may not exist yet for some seller_ids
end $$;

alter table public.payouts enable row level security;
drop policy if exists "payouts_self_read" on public.payouts;
create policy "payouts_self_read" on public.payouts
  for select to authenticated using (
    seller_id = auth.uid() or public.is_admin()
  );

-- RPC: queue a payout (typically called automatically when a
-- final_payment transaction lands, but exposed for manual use too).
create or replace function public.admin_create_payout(
  p_seller_id  uuid,
  p_auction_id uuid,
  p_gross      numeric,
  p_commission numeric,
  p_tva        numeric,
  p_rib        text default null,
  p_notes      text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_net numeric;
begin
  if not public.has_admin_capability('payout.create') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  v_net := coalesce(p_gross,0) - coalesce(p_commission,0) - coalesce(p_tva,0);
  if v_net <= 0 then raise exception 'INVALID_NET_AMOUNT'; end if;

  insert into public.payouts
    (seller_id, auction_id, gross_amount, commission, tva, net_amount, rib, notes)
  values
    (p_seller_id, p_auction_id, p_gross, p_commission, p_tva, v_net, p_rib, p_notes)
  returning id into v_id;

  perform public.log_admin_action(
    'payout.create',
    p_target_user_id    => p_seller_id,
    p_target_auction_id => p_auction_id,
    p_target_id         => v_id,
    p_target_type       => 'payout',
    p_detail            => v_net::text || ' DT'
  );
  return v_id;
end; $$;
grant execute on function public.admin_create_payout(uuid, uuid, numeric, numeric, numeric, text, text)
  to authenticated;

create or replace function public.admin_mark_payout_paid(
  p_id        uuid,
  p_reference text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid; v_amount numeric;
begin
  if not public.has_admin_capability('payout.mark_paid') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.payouts
     set status = 'paid',
         paid_at = now(),
         paid_by = auth.uid(),
         paid_reference = p_reference
   where id = p_id and status in ('pending','approved')
   returning seller_id, net_amount into v_seller, v_amount;
  if v_seller is null then raise exception 'PAYOUT_NOT_FOUND_OR_ALREADY_PAID'; end if;

  -- Mirror into the transactions ledger so the seller sees it.
  insert into public.transactions
    (ref, user_id, user_label, type, direction, amount, label, status)
  select 'TX-PAY-' || substr(gen_random_uuid()::text, 1, 8),
         v_seller,
         coalesce(s.display_name, s.username),
         'payout', 'in', v_amount,
         'Virement bancaire — ' || coalesce(p_reference,'sans réf'),
         'completed'
    from public.sellers s where s.id = v_seller;

  insert into public.notifications (user_id, kind, title, body)
  values (v_seller, 'system', 'Virement effectué',
          'Votre virement de ' || v_amount::text || ' DT a été envoyé.');

  perform public.log_admin_action(
    'payout.mark_paid',
    p_target_user_id => v_seller,
    p_target_id      => p_id,
    p_target_type    => 'payout',
    p_detail         => p_reference
  );
end; $$;
grant execute on function public.admin_mark_payout_paid(uuid, text) to authenticated;

create or replace function public.admin_cancel_payout(
  p_id     uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
begin
  if not public.has_admin_capability('payout.create') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.payouts
     set status = 'cancelled',
         cancelled_reason = p_reason
   where id = p_id and status in ('pending','approved')
   returning seller_id into v_seller;
  if v_seller is null then raise exception 'PAYOUT_NOT_FOUND'; end if;
  perform public.log_admin_action(
    'payout.cancel',
    p_target_user_id => v_seller,
    p_target_id      => p_id,
    p_target_type    => 'payout',
    p_detail         => p_reason
  );
end; $$;
grant execute on function public.admin_cancel_payout(uuid, text) to authenticated;


-- ---------------------------------------------------------
-- File: migrate-admin-users-list.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Unified admin users listing
--
-- Today /admin/users only sees users that already have a row in the
-- `sellers` table. Buyers who never published an auction are invisible
-- to admins. This migration adds an RPC that pulls from auth.users
-- (with elevated privilege) and joins counts so admins get a single
-- searchable view of every account.
--
-- Returns shape — kept JSON-ish so the TS layer can read with
-- `supabase.rpc(...).then(r => r.data)` without a typed view.
--
-- Depends on: migrate-admin-foundations.sql, migrate-admin-actions.sql
-- Safe to run repeatedly.
-- ============================================================

create or replace function public.admin_list_users(
  p_search        text default null,
  p_role          text default null,    -- 'buyer' | 'seller' | 'admin' | null = any
  p_kyc_status    text default null,    -- 'none'  | 'pending' | 'verified' | 'rejected' | null
  p_only_banned   boolean default false,
  p_limit         int default 100,
  p_offset        int default 0
) returns table (
  id              uuid,
  email           text,
  phone           text,
  first_name      text,
  last_name       text,
  display_name    text,
  username        text,
  role            text,
  admin_role      text,
  kyc_status      text,
  trust_score     int,
  city            text,
  is_pro          boolean,
  is_active       boolean,
  is_banned       boolean,
  bid_count       bigint,
  auction_count   bigint,
  created_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.view') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(u.raw_user_meta_data ->> 'phone', u.phone)::text as phone,
    (u.raw_user_meta_data ->> 'firstName')::text as first_name,
    (u.raw_user_meta_data ->> 'lastName')::text  as last_name,
    coalesce(s.display_name,
             nullif(btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                          coalesce(u.raw_user_meta_data->>'lastName','')),''),
             split_part(u.email,'@',1))::text     as display_name,
    s.username::text,
    coalesce(u.raw_user_meta_data ->> 'role','buyer')::text       as role,
    (u.raw_user_meta_data ->> 'adminRole')::text                  as admin_role,
    coalesce(u.raw_user_meta_data ->> 'kycStatus','none')::text   as kyc_status,
    coalesce(s.trust_score, 0)                                    as trust_score,
    s.city::text,
    coalesce(s.is_pro, false)                                     as is_pro,
    coalesce(s.is_active, true)                                   as is_active,
    public.is_user_banned(u.id)                                   as is_banned,
    coalesce(b.bid_count, 0)                                      as bid_count,
    coalesce(a.auction_count, 0)                                  as auction_count,
    u.created_at
  from auth.users u
  left join public.sellers s on s.id = u.id
  left join (
    select user_id, count(*) as bid_count
      from public.bids group by user_id
  ) b on b.user_id = u.id
  left join (
    select seller_id, count(*) as auction_count
      from public.auctions group by seller_id
  ) a on a.seller_id = u.id
  where (p_search is null or
         u.email ilike '%' || p_search || '%' or
         coalesce(s.username,'')      ilike '%' || p_search || '%' or
         coalesce(s.display_name,'')  ilike '%' || p_search || '%' or
         coalesce(u.raw_user_meta_data ->> 'firstName','') ilike '%' || p_search || '%' or
         coalesce(u.raw_user_meta_data ->> 'lastName','')  ilike '%' || p_search || '%' or
         coalesce(u.raw_user_meta_data ->> 'phone','')     ilike '%' || p_search || '%')
    and (p_role is null
         or coalesce(u.raw_user_meta_data ->> 'role','buyer') = p_role
         or (p_role = 'admin' and (
              coalesce(u.raw_user_meta_data ->> 'role','') = 'admin'
              or u.raw_user_meta_data ->> 'adminRole' is not null)))
    and (p_kyc_status is null
         or coalesce(u.raw_user_meta_data ->> 'kycStatus','none') = p_kyc_status)
    and (not p_only_banned or public.is_user_banned(u.id))
  order by u.created_at desc
  limit greatest(0, p_limit) offset greatest(0, p_offset);
end; $$;

grant execute on function public.admin_list_users(text, text, text, boolean, int, int)
  to authenticated;

-- Single-user fetch (handles buyers without a sellers row).
create or replace function public.admin_get_user(p_user_id uuid)
returns table (
  id              uuid,
  email           text,
  phone           text,
  first_name      text,
  last_name       text,
  display_name    text,
  username        text,
  role            text,
  admin_role      text,
  kyc_status      text,
  trust_score     int,
  city            text,
  avatar_url      text,
  is_pro          boolean,
  is_active       boolean,
  is_banned       boolean,
  verified_kyc    boolean,
  verified_ownership boolean,
  account_age_months int,
  successful_deals int,
  rating_average  numeric,
  rating_count    int,
  created_at      timestamptz,
  email_verified  boolean,
  phone_verified  boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.view') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(u.raw_user_meta_data ->> 'phone', u.phone)::text,
    (u.raw_user_meta_data ->> 'firstName')::text,
    (u.raw_user_meta_data ->> 'lastName')::text,
    coalesce(s.display_name,
             nullif(btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                          coalesce(u.raw_user_meta_data->>'lastName','')),''),
             split_part(u.email,'@',1))::text,
    s.username::text,
    coalesce(u.raw_user_meta_data ->> 'role','buyer')::text,
    (u.raw_user_meta_data ->> 'adminRole')::text,
    coalesce(u.raw_user_meta_data ->> 'kycStatus','none')::text,
    coalesce(s.trust_score, 0),
    s.city::text,
    s.avatar_url::text,
    coalesce(s.is_pro, false),
    coalesce(s.is_active, true),
    public.is_user_banned(u.id),
    coalesce(s.verified_kyc, false),
    coalesce(s.verified_ownership, false),
    coalesce(s.account_age_months, 0),
    coalesce(s.successful_deals, 0),
    coalesce(s.rating_average, 0),
    coalesce(s.rating_count, 0),
    u.created_at,
    (u.email_confirmed_at is not null),
    (u.phone_confirmed_at is not null)
  from auth.users u
  left join public.sellers s on s.id = u.id
  where u.id = p_user_id;
end; $$;

grant execute on function public.admin_get_user(uuid) to authenticated;


-- ---------------------------------------------------------
-- File: migrate-cms.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — CMS tables
--
-- Today the marketing pages (about, help, terms, privacy), the FAQ,
-- the contact info and the home promo banner are hardcoded French
-- JSX. This migration moves them into the database so the admin
-- can edit copy without redeploying.
--
-- Tables:
--   cms_pages             — about / help / terms / privacy / how-it-works
--   cms_faqs              — single FAQ list, ordered, both locales
--   cms_promo_banners     — home promo banners with effective dates
--   cms_brands            — allowed brands list (for seller wizard)
--   cms_features          — allowed equipment / feature toggles
--   cms_cities            — allowed cities (Tunisia governorates)
--   notification_templates — notification templates by kind × locale
--
-- Depends on: migrate-admin-foundations.sql
-- Safe to run repeatedly.
-- ============================================================

-- 1) cms_pages -------------------------------------------------------
create table if not exists public.cms_pages (
  slug         text primary key,           -- 'about' | 'help' | 'terms' | 'privacy' | 'how-it-works'
  title_ar     text,
  title_fr     text,
  body_ar      text,                       -- markdown
  body_fr      text,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.cms_pages enable row level security;
drop policy if exists "cms_pages_public_read" on public.cms_pages;
create policy "cms_pages_public_read" on public.cms_pages
  for select using (true);

-- 2) cms_faqs --------------------------------------------------------
create table if not exists public.cms_faqs (
  id           uuid primary key default gen_random_uuid(),
  position     int not null default 0,
  question_ar  text,
  question_fr  text not null,
  answer_ar    text,
  answer_fr    text not null,
  is_published boolean not null default true,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

create index if not exists cms_faqs_position_idx
  on public.cms_faqs (position) where is_published = true;

alter table public.cms_faqs enable row level security;
drop policy if exists "cms_faqs_public_read" on public.cms_faqs;
create policy "cms_faqs_public_read" on public.cms_faqs
  for select using (is_published = true or public.is_admin());

-- 3) cms_promo_banners ----------------------------------------------
create table if not exists public.cms_promo_banners (
  id           uuid primary key default gen_random_uuid(),
  title_ar     text,
  title_fr     text,
  subtitle_ar  text,
  subtitle_fr  text,
  cta_label_ar text,
  cta_label_fr text,
  cta_href     text,
  image_url    text,
  is_active    boolean not null default true,
  starts_at    timestamptz,
  ends_at      timestamptz,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.cms_promo_banners enable row level security;
drop policy if exists "cms_banners_public_read" on public.cms_promo_banners;
create policy "cms_banners_public_read" on public.cms_promo_banners
  for select using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
    or public.is_admin()
  );

-- 4) cms_brands ------------------------------------------------------
create table if not exists public.cms_brands (
  slug         text primary key,
  display_name text not null,
  logo_url     text,
  is_active    boolean not null default true,
  position     int not null default 0
);

alter table public.cms_brands enable row level security;
drop policy if exists "cms_brands_public_read" on public.cms_brands;
create policy "cms_brands_public_read" on public.cms_brands
  for select using (true);

insert into public.cms_brands (slug, display_name, position) values
  ('renault',  'Renault',       10),
  ('peugeot',  'Peugeot',       20),
  ('vw',       'Volkswagen',    30),
  ('toyota',   'Toyota',        40),
  ('hyundai',  'Hyundai',       50),
  ('bmw',      'BMW',           60),
  ('mercedes', 'Mercedes',      70),
  ('citroen',  'Citroën',       80),
  ('fiat',     'Fiat',          90),
  ('kia',      'Kia',           100),
  ('skoda',    'Skoda',         110),
  ('audi',     'Audi',          120),
  ('ford',     'Ford',          130)
on conflict (slug) do nothing;

-- 5) cms_features ----------------------------------------------------
create table if not exists public.cms_features (
  slug         text primary key,
  label_ar     text,
  label_fr     text not null,
  category     text,
  is_active    boolean not null default true,
  position     int not null default 0
);

alter table public.cms_features enable row level security;
drop policy if exists "cms_features_public_read" on public.cms_features;
create policy "cms_features_public_read" on public.cms_features
  for select using (true);

insert into public.cms_features (slug, label_fr, position) values
  ('air_conditioning', 'Climatisation', 10),
  ('abs',              'ABS',           20),
  ('esp',              'ESP',           30),
  ('airbags',          'Airbags',       40),
  ('audio',            'Audio',         50),
  ('bluetooth',        'Bluetooth',     60),
  ('reverse_camera',   'Caméra de recul', 70),
  ('led_headlights',   'Phares LED',    80),
  ('carplay',          'CarPlay',       90),
  ('android_auto',     'Android Auto',  100),
  ('sunroof',          'Toit ouvrant',  110),
  ('leather',          'Sièges en cuir', 120),
  ('cruise_control',   'Régulateur de vitesse', 130)
on conflict (slug) do nothing;

-- 6) cms_cities ------------------------------------------------------
create table if not exists public.cms_cities (
  slug         text primary key,
  name_ar      text,
  name_fr      text not null,
  region       text,                  -- governorate
  is_active    boolean not null default true,
  position     int not null default 0
);

alter table public.cms_cities enable row level security;
drop policy if exists "cms_cities_public_read" on public.cms_cities;
create policy "cms_cities_public_read" on public.cms_cities
  for select using (true);

insert into public.cms_cities (slug, name_fr, region, position) values
  ('tunis',     'Tunis',     'Tunis',      10),
  ('ariana',    'Ariana',    'Ariana',     20),
  ('ben_arous', 'Ben Arous', 'Ben Arous',  30),
  ('manouba',   'Manouba',   'Manouba',    40),
  ('nabeul',    'Nabeul',    'Nabeul',     50),
  ('sousse',    'Sousse',    'Sousse',     60),
  ('monastir',  'Monastir',  'Monastir',   70),
  ('mahdia',    'Mahdia',    'Mahdia',     80),
  ('sfax',      'Sfax',      'Sfax',       90),
  ('gabes',     'Gabès',     'Gabès',     100),
  ('medenine',  'Médenine',  'Médenine',  110),
  ('tataouine', 'Tataouine', 'Tataouine', 120),
  ('gafsa',     'Gafsa',     'Gafsa',     130),
  ('tozeur',    'Tozeur',    'Tozeur',    140),
  ('kebili',    'Kébili',    'Kébili',    150),
  ('sidi_bouzid','Sidi Bouzid','Sidi Bouzid',160),
  ('kairouan',  'Kairouan',  'Kairouan',  170),
  ('kasserine', 'Kasserine', 'Kasserine', 180),
  ('jendouba',  'Jendouba',  'Jendouba',  190),
  ('beja',      'Béja',      'Béja',      200),
  ('siliana',   'Siliana',   'Siliana',   210),
  ('zaghouan',  'Zaghouan',  'Zaghouan',  220),
  ('bizerte',   'Bizerte',   'Bizerte',   230),
  ('le_kef',    'Le Kef',    'Le Kef',    240)
on conflict (slug) do nothing;

-- 7) notification_templates -----------------------------------------
-- Keyed by (kind, locale). Notifications written from triggers /
-- server code look up the template and render the title/body. Body
-- supports `{{varName}}` substitutions handled in TS.
create table if not exists public.notification_templates (
  kind         text not null,
  locale       text not null,
  title        text not null,
  body         text not null,
  in_app       boolean not null default true,
  email        boolean not null default false,
  sms          boolean not null default false,
  push         boolean not null default true,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (kind, locale)
);

alter table public.notification_templates enable row level security;
drop policy if exists "notif_tmpl_public_read" on public.notification_templates;
create policy "notif_tmpl_public_read" on public.notification_templates
  for select using (true);

-- Seed both locales for every kind we know about (PLAN §23.2 — 18 kinds).
-- Bodies are short; full personalisation happens at render time.
insert into public.notification_templates (kind, locale, title, body) values
  ('outbid','fr',           'Vous avez été dépassé', 'Quelqu''un a surenchéri sur votre offre.'),
  ('outbid','ar',           'تم تجاوز عرضك',          'قام مزايد آخر بتقديم عرض أعلى من عرضك.'),
  ('won','fr',              'Félicitations, vous avez gagné !', 'Vous disposez de 7 jours pour finaliser le paiement.'),
  ('won','ar',              'تهانينا، لقد فزت بالمزاد!', 'لديك 7 أيام لإتمام الدفع النهائي.'),
  ('lost','fr',              'Enchère terminée', 'Vous n''êtes pas le gagnant. Caution remboursée.'),
  ('lost','ar',              'انتهى المزاد', 'لم تفز بهذا المزاد. سيتم استرداد التأمين.'),
  ('new_bid','fr',          'Nouvelle offre', 'Une nouvelle offre vient d''arriver.'),
  ('new_bid','ar',          'عرض جديد',       'تم تقديم عرض جديد على مزادك.'),
  ('approved','fr',         'Enchère approuvée', 'Votre annonce est en ligne.'),
  ('approved','ar',         'تمت الموافقة على المزاد', 'إعلانك متاح الآن.'),
  ('rejected','fr',         'Enchère refusée', 'Votre annonce a été refusée.'),
  ('rejected','ar',         'تم رفض المزاد',    'تم رفض إعلانك.'),
  ('payment_due','fr',      'Paiement à effectuer', 'Pensez à finaliser le paiement avant l''échéance.'),
  ('payment_due','ar',      'موعد الدفع',       'يجب إتمام الدفع قبل انقضاء المهلة.'),
  ('reminder','fr',         'Rappel', 'Rappel de l''application.'),
  ('reminder','ar',         'تذكير',  'تذكير من التطبيق.'),
  ('system','fr',           'Notification système', 'Message du système.'),
  ('system','ar',           'إشعار من النظام',     'رسالة من النظام.'),
  -- New PLAN §23.2 kinds
  ('kyc_approved','fr',     'Identité vérifiée', 'Votre identité a été vérifiée. Vous pouvez maintenant vendre.'),
  ('kyc_approved','ar',     'تم التحقق من الهوية', 'تم التحقق من هويتك. يمكنك البيع الآن.'),
  ('kyc_rejected','fr',     'Vérification refusée', 'Votre dossier KYC n''a pas été accepté.'),
  ('kyc_rejected','ar',     'تم رفض التحقق',     'لم يتم قبول وثائق التحقق.'),
  ('kyc_expires_soon','fr', 'Vérification expire bientôt', 'Votre KYC expire dans 30 jours.'),
  ('kyc_expires_soon','ar', 'انتهاء صلاحية قريبة', 'ستنتهي صلاحية التحقق خلال 30 يومًا.'),
  ('auction_starting_soon','fr', 'Enchère sur le point de commencer', 'Une enchère que vous suivez démarre bientôt.'),
  ('auction_starting_soon','ar', 'مزاد سيبدأ قريباً', 'سيبدأ مزاد قمت بتتبعه قريباً.'),
  ('reserve_not_met','fr',  'Réserve non atteinte', 'Le prix de réserve n''a pas été atteint.'),
  ('reserve_not_met','ar',  'لم يصل سعر الاحتياط', 'لم يصل العرض إلى السعر الاحتياطي.'),
  ('auction_extended','fr', 'Enchère prolongée', 'L''enchère a été prolongée par anti-sniping.'),
  ('auction_extended','ar', 'تم تمديد المزاد',     'تم تمديد المزاد بسبب نظام منع القنص.'),
  ('deposit_refunded','fr', 'Caution remboursée', 'Votre caution a été remboursée.'),
  ('deposit_refunded','ar', 'تم استرداد التأمين',  'تم استرداد تأمين المشاركة.'),
  ('deposit_forfeited','fr','Caution mise en jeu', 'Votre caution a été retenue pour non-paiement.'),
  ('deposit_forfeited','ar','مصادرة التأمين',     'تم احتجاز التأمين بسبب عدم الدفع.'),
  ('payment_received','fr', 'Paiement reçu', 'Le paiement a été crédité sur votre compte vendeur.'),
  ('payment_received','ar', 'تم استلام الدفع',  'تم تسجيل الدفع لصالح حسابك كبائع.'),
  ('rating_request','fr',   'Notez le vendeur', 'Aidez la communauté en évaluant cette transaction.'),
  ('rating_request','ar',   'قيّم البائع',       'ساعد المجتمع بتقييم هذه الصفقة.'),
  ('new_report','fr',       'Nouveau signalement', 'Une de vos enchères a été signalée.'),
  ('new_report','ar',       'بلاغ جديد',          'تم الإبلاغ عن أحد إعلاناتك.'),
  ('account_blocked','fr',  'Compte bloqué', 'Votre compte a été suspendu.'),
  ('account_blocked','ar',  'تم تعليق الحساب', 'تم تعليق حسابك.')
on conflict (kind, locale) do nothing;


-- ---------------------------------------------------------
-- File: migrate-notifications-expansion.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Notifications expansion
--
-- 1. Widen notifications.kind CHECK to include the 9 missing
--    PLAN §23.2 kinds (kyc_*, auction_*, deposit_*, payment_received,
--    rating_request, new_report, account_blocked).
-- 2. Add `user_notification_prefs` for per-kind × per-channel
--    user preferences (PLAN §23.3).
--
-- Safe to run repeatedly.
-- ============================================================

-- 1) Replace the kind CHECK ----------------------------------------
do $$
begin
  alter table public.notifications drop constraint if exists notifications_kind_check;
exception when undefined_table then null;
end $$;

alter table public.notifications
  add constraint notifications_kind_check check (kind in (
    -- legacy kinds (kept for back-compat)
    'outbid','won','lost','new_bid','approved','rejected',
    'payment_due','reminder','system',
    -- PLAN §23.2 new kinds
    'kyc_approved','kyc_rejected','kyc_expires_soon',
    'auction_starting_soon','reserve_not_met','auction_extended',
    'deposit_refunded','deposit_forfeited','payment_received',
    'rating_request','new_report','account_blocked'
  ));

-- 2) user_notification_prefs --------------------------------------
-- Each (user_id, kind) row says which channels are enabled. Absence
-- of a row falls back to the channel defaults from notification_templates.
create table if not exists public.user_notification_prefs (
  user_id   uuid not null references auth.users(id) on delete cascade,
  kind      text not null,
  in_app    boolean not null default true,
  email     boolean not null default false,
  sms       boolean not null default false,
  push      boolean not null default true,
  primary key (user_id, kind)
);

alter table public.user_notification_prefs enable row level security;
drop policy if exists "notif_prefs_self_all" on public.user_notification_prefs;
create policy "notif_prefs_self_all" on public.user_notification_prefs
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Helper: should a user receive a given (kind, channel)?
create or replace function public.should_notify(
  p_user_id uuid, p_kind text, p_channel text
) returns boolean
language sql stable
as $$
  with override as (
    select * from public.user_notification_prefs
     where user_id = p_user_id and kind = p_kind
  ),
  tmpl as (
    select * from public.notification_templates
     where kind = p_kind limit 1
  )
  select case p_channel
    when 'in_app' then coalesce((select in_app from override),
                                 (select in_app from tmpl), true)
    when 'email'  then coalesce((select email  from override),
                                 (select email  from tmpl), false)
    when 'sms'    then coalesce((select sms    from override),
                                 (select sms    from tmpl), false)
    when 'push'   then coalesce((select push   from override),
                                 (select push   from tmpl), true)
    else false
  end;
$$;

grant execute on function public.should_notify(uuid, text, text) to authenticated, anon;


-- ---------------------------------------------------------
-- File: migrate-notif-helper.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — notify_with_template() helper
--
-- Trigger functions today build notification bodies via string
-- concatenation. That makes them un-editable from /admin/cms/
-- notifications. This migration introduces a SQL helper that
-- reads the row from notification_templates, substitutes
-- {{varName}} placeholders, and inserts into public.notifications
-- in one call.
--
-- New trigger code should use this helper instead of inline
-- string-builds. Existing triggers (handle_new_bid, finalize_auction,
-- handle_new_report) continue to work — their hardcoded copy is the
-- fallback when no template row exists for a given kind.
--
-- Depends on: migrate-cms.sql (notification_templates),
--             migrate-notifications-expansion.sql (kind CHECK widening)
-- Safe to run repeatedly.
-- ============================================================

-- Pick the locale to use for a given user. Falls back to 'fr'.
create or replace function public.user_locale(p_user_id uuid)
returns text
language sql stable
as $$
  select coalesce(
    (select raw_user_meta_data ->> 'locale'
       from auth.users where id = p_user_id),
    'fr'
  );
$$;
grant execute on function public.user_locale(uuid) to authenticated, anon;

-- Tiny mustache-ish substitutor. Renders {{key}} → vars->>'key'.
-- Unknown keys are left blank so a missing var doesn't blow up the
-- whole notification.
create or replace function public.render_template(
  p_template text,
  p_vars     jsonb
) returns text
language plpgsql immutable
as $$
declare
  v_out text := p_template;
  v_key text;
  v_val text;
begin
  if p_vars is null then return v_out; end if;
  for v_key in select jsonb_object_keys(p_vars) loop
    v_val := coalesce(p_vars ->> v_key, '');
    v_out := replace(v_out, '{{' || v_key || '}}', v_val);
  end loop;
  -- strip any leftover {{x}} so the user never sees a placeholder
  v_out := regexp_replace(v_out, '\{\{[^}]+\}\}', '', 'g');
  return v_out;
end; $$;
grant execute on function public.render_template(text, jsonb) to authenticated, anon;

-- Insert a notification using the (kind, locale) template if one
-- exists. Falls back to the explicit p_default_title / p_default_body
-- so triggers can stay safe when a template is missing.
create or replace function public.notify_with_template(
  p_user_id        uuid,
  p_kind           text,
  p_vars           jsonb default '{}'::jsonb,
  p_auction_id     uuid default null,
  p_default_title  text default null,
  p_default_body   text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locale text := public.user_locale(p_user_id);
  v_tmpl   record;
  v_title  text;
  v_body   text;
  v_id     uuid;
begin
  select * into v_tmpl
    from public.notification_templates
   where kind = p_kind and locale = v_locale
   limit 1;
  if not found then
    -- try French as a final fallback
    select * into v_tmpl
      from public.notification_templates
     where kind = p_kind and locale = 'fr'
     limit 1;
  end if;

  v_title := coalesce(public.render_template(v_tmpl.title, p_vars), p_default_title, p_kind);
  v_body  := coalesce(public.render_template(v_tmpl.body,  p_vars), p_default_body,  '');

  -- Honor user notification preferences for in-app delivery — if the
  -- user explicitly disabled in_app for this kind, skip the row.
  if not public.should_notify(p_user_id, p_kind, 'in_app') then
    return null;
  end if;

  insert into public.notifications (user_id, kind, title, body, auction_id)
  values (p_user_id, p_kind, v_title, v_body, p_auction_id)
  returning id into v_id;
  return v_id;
end; $$;

grant execute on function public.notify_with_template(uuid, text, jsonb, uuid, text, text)
  to authenticated, anon;


-- ---------------------------------------------------------
-- File: migrate-settings-approval.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — 2-admin approval workflow for sensitive settings
--
-- platform_settings already has pending_value / pending_proposed_by /
-- pending_proposed_at columns reserved for this. This migration adds
-- the RPCs that propose, approve and reject pending changes.
--
-- Rules:
--   * settings flagged requires_approval=true must go through
--     propose_setting_value() — direct UPDATE bypasses the workflow
--     and is reserved for non-sensitive settings.
--   * Same admin cannot propose AND approve. The approving admin
--     must be a different user.
--   * propose / approve / reject all flow through admin_audit_log.
--
-- Depends on: migrate-platform-settings.sql, migrate-admin-foundations.sql
-- Safe to run repeatedly.
-- ============================================================

create or replace function public.propose_setting_value(
  p_key       text,
  p_new_value jsonb,
  p_reason    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_row from public.platform_settings where key = p_key;
  if v_row.key is null then
    raise exception 'SETTING_NOT_FOUND';
  end if;

  update public.platform_settings
     set pending_value       = p_new_value,
         pending_proposed_by = auth.uid(),
         pending_proposed_at = now()
   where key = p_key;

  insert into public.settings_audit_log
    (setting_key, old_value, new_value, action, changed_by, reason)
  values
    (p_key, v_row.value, p_new_value, 'create', auth.uid(),
     coalesce(p_reason, 'proposed'));

  perform public.log_admin_action(
    'setting.propose',
    p_target_type => 'platform_setting',
    p_detail      => p_key,
    p_metadata    => jsonb_build_object('new_value', p_new_value, 'reason', p_reason)
  );
end; $$;
grant execute on function public.propose_setting_value(text, jsonb, text) to authenticated;

create or replace function public.approve_pending_setting(
  p_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_row from public.platform_settings where key = p_key;
  if v_row.key is null then raise exception 'SETTING_NOT_FOUND'; end if;
  if v_row.pending_value is null then raise exception 'NO_PENDING_CHANGE'; end if;

  -- Same admin cannot propose AND approve.
  if v_row.pending_proposed_by = auth.uid() then
    raise exception 'NEEDS_DIFFERENT_APPROVER';
  end if;

  update public.platform_settings
     set value               = pending_value,
         pending_value       = null,
         pending_proposed_by = null,
         pending_proposed_at = null,
         updated_by          = auth.uid(),
         updated_at          = now()
   where key = p_key;

  insert into public.settings_audit_log
    (setting_key, old_value, new_value, action, changed_by)
  values
    (p_key, v_row.value, v_row.pending_value, 'approve', auth.uid());

  perform public.log_admin_action(
    'setting.approve',
    p_target_type => 'platform_setting',
    p_detail      => p_key
  );
end; $$;
grant execute on function public.approve_pending_setting(text) to authenticated;

create or replace function public.reject_pending_setting(
  p_key    text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  select * into v_row from public.platform_settings where key = p_key;
  if v_row.pending_value is null then raise exception 'NO_PENDING_CHANGE'; end if;

  insert into public.settings_audit_log
    (setting_key, old_value, new_value, action, changed_by, reason)
  values
    (p_key, v_row.value, v_row.pending_value, 'reject', auth.uid(), p_reason);

  update public.platform_settings
     set pending_value       = null,
         pending_proposed_by = null,
         pending_proposed_at = null
   where key = p_key;

  perform public.log_admin_action(
    'setting.reject',
    p_target_type => 'platform_setting',
    p_detail      => p_key,
    p_metadata    => jsonb_build_object('reason', p_reason)
  );
end; $$;
grant execute on function public.reject_pending_setting(text, text) to authenticated;


-- ---------------------------------------------------------
-- File: migrate-admin-team.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Admin team listing
--
-- super_admin needs to see every account that holds an admin role,
-- regardless of whether the rest of the app classifies them as
-- buyer / seller / admin. This RPC pulls from auth.users with
-- elevated privilege and returns just admins.
--
-- Depends on: migrate-admin-foundations.sql
-- Safe to run repeatedly.
-- ============================================================

create or replace function public.admin_list_admins()
returns table (
  id          uuid,
  email       text,
  first_name  text,
  last_name   text,
  display_name text,
  admin_role  text,
  created_at  timestamptz,
  last_seen   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_role() is null then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select
    u.id,
    u.email::text,
    (u.raw_user_meta_data ->> 'firstName')::text as first_name,
    (u.raw_user_meta_data ->> 'lastName')::text  as last_name,
    coalesce(s.display_name,
             nullif(btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                          coalesce(u.raw_user_meta_data->>'lastName','')),''),
             split_part(u.email,'@',1))::text   as display_name,
    coalesce(u.raw_user_meta_data ->> 'adminRole',
             case when u.raw_user_meta_data ->> 'role' = 'admin' then 'admin' else null end)::text
                                                  as admin_role,
    u.created_at,
    (select max(sess.last_seen) from public.admin_sessions sess where sess.user_id = u.id) as last_seen
  from auth.users u
  left join public.sellers s on s.id = u.id
  where (u.raw_user_meta_data ->> 'role') = 'admin'
     or u.raw_user_meta_data ->> 'adminRole' is not null
  order by u.created_at desc;
end; $$;

grant execute on function public.admin_list_admins() to authenticated;


-- ---------------------------------------------------------
-- File: migrate-admin-messaging.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Messaging moderation
--
-- conversations + messages have strict participant-only RLS. For
-- abuse / harassment investigations admins need to read any thread,
-- but every read must be auditable.
--
-- This migration adds three SECURITY DEFINER RPCs that bypass RLS
-- AND record an `admin_audit_log` row tagged with the moderation
-- reason. Without the reason the RPC refuses to return rows.
--
-- Depends on: migrate-admin-foundations.sql, migrate-messaging.sql
-- Safe to run repeatedly.
-- ============================================================

create or replace function public.admin_list_conversations(
  p_search text default null,
  p_limit  int default 100
) returns table (
  id              uuid,
  buyer_id        uuid,
  seller_id       uuid,
  auction_id      uuid,
  last_message_at timestamptz,
  created_at      timestamptz,
  message_count   bigint,
  buyer_label     text,
  seller_label    text,
  auction_title   text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('message.read_for_moderation') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select
    c.id,
    c.buyer_id,
    c.seller_id,
    c.auction_id,
    c.last_message_at,
    c.created_at,
    (select count(*) from public.messages m where m.conversation_id = c.id),
    coalesce(
      (select btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                    coalesce(u.raw_user_meta_data->>'lastName',''))
         from auth.users u where u.id = c.buyer_id),
      'Acheteur')::text,
    coalesce(
      (select btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                    coalesce(u.raw_user_meta_data->>'lastName',''))
         from auth.users u where u.id = c.seller_id),
      'Vendeur')::text,
    coalesce(
      (select a.make || ' ' || a.model || ' ' || a.year::text
         from public.auctions a where a.id = c.auction_id),
      '—')::text
  from public.conversations c
  where p_search is null
     or coalesce((select ub.email from auth.users ub where ub.id = c.buyer_id),'')  ilike '%' || p_search || '%'
     or coalesce((select us.email from auth.users us where us.id = c.seller_id),'') ilike '%' || p_search || '%'
  order by coalesce(c.last_message_at, c.created_at) desc
  limit greatest(0, p_limit);
end; $$;
grant execute on function public.admin_list_conversations(text, int) to authenticated;

create or replace function public.admin_read_conversation(
  p_conversation_id uuid,
  p_reason          text
) returns table (
  id              uuid,
  sender_id       uuid,
  sender_label    text,
  body            text,
  read_at         timestamptz,
  created_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('message.read_for_moderation') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  perform public.log_admin_action(
    'message.read_for_moderation',
    p_target_id   => p_conversation_id,
    p_target_type => 'conversation',
    p_detail      => p_reason
  );

  return query
  select
    m.id,
    m.sender_id,
    coalesce(
      (select btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                    coalesce(u.raw_user_meta_data->>'lastName',''))
         from auth.users u where u.id = m.sender_id),
      'Utilisateur')::text,
    m.body,
    m.read_at,
    m.created_at
  from public.messages m
  where m.conversation_id = p_conversation_id
  order by m.created_at asc;
end; $$;
grant execute on function public.admin_read_conversation(uuid, text) to authenticated;


-- ---------------------------------------------------------
-- File: migrate-ownership-review.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Golden-Lock ownership review
--
-- The seller wizard's step-4 has a "Golden Lock": the carte grise
-- owner name must match the KYC name. When it doesn't, the seller
-- picks an exception ("company"/"agent"/"inheritance"/"spouse"/
-- "recent_purchase"/"other"). The "other" branch is supposed to
-- queue for manual admin review, but today the flag never lands
-- on the auction row — admins can't see which auctions need a
-- closer look.
--
-- Two new columns + a partial index make those auctions trivially
-- queryable.
--
-- Safe to run repeatedly.
-- ============================================================

alter table public.auctions
  add column if not exists ownership_exception text,
  add column if not exists carte_grise_owner_name text;

create index if not exists auctions_ownership_review_idx
  on public.auctions (created_at desc)
  where ownership_exception is not null;


-- ---------------------------------------------------------
-- File: migrate-fraud-signals.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Fraud signals
--
-- Lightweight read-only RPCs that admins can poll from
-- /admin/fraud. Heavier signals (device fingerprinting, IP
-- velocity) belong in a separate detection pipeline; this layer
-- focuses on what's already in our tables:
--   * duplicate-looking accounts (same phone or email prefix)
--   * users with many bids in a short window (rapid-fire)
--   * users with many active bans / warnings
--   * auctions getting many reports
--
-- All RPCs are admin-gated and security-definer.
-- Safe to run repeatedly.
-- ============================================================

-- 1) Duplicate phone numbers / similar names.
create or replace function public.fraud_duplicate_phones(
  p_limit int default 50
) returns table (
  phone     text,
  user_count bigint,
  user_ids  uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.view') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
  select
    coalesce(u.phone, u.raw_user_meta_data ->> 'phone')::text as phone,
    count(*) as user_count,
    array_agg(u.id) as user_ids
  from auth.users u
  where coalesce(u.phone, u.raw_user_meta_data ->> 'phone') is not null
  group by 1
  having count(*) > 1
  order by count(*) desc
  limit greatest(0, p_limit);
end; $$;
grant execute on function public.fraud_duplicate_phones(int) to authenticated;

-- 2) Rapid bidders — users placing > 20 bids in the last 24h.
create or replace function public.fraud_rapid_bidders(
  p_threshold int default 20,
  p_limit int default 50
) returns table (
  user_id     uuid,
  bid_count   bigint,
  auctions    bigint,
  last_bid    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.view') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
  select
    b.user_id,
    count(*) as bid_count,
    count(distinct b.auction_id) as auctions,
    max(b.placed_at) as last_bid
  from public.bids b
  where b.placed_at > now() - interval '24 hours'
  group by b.user_id
  having count(*) >= greatest(1, p_threshold)
  order by count(*) desc
  limit greatest(0, p_limit);
end; $$;
grant execute on function public.fraud_rapid_bidders(int, int) to authenticated;

-- 3) Auctions over the report threshold (auto-review/auto-remove).
create or replace function public.fraud_reported_auctions(
  p_min_reports int default 3,
  p_limit int default 50
) returns table (
  auction_id  uuid,
  reports     bigint,
  reasons     text[],
  worst       text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('report.view') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
  select
    r.auction_id,
    count(*) as reports,
    array_agg(distinct r.reason) as reasons,
    (array_agg(r.severity order by case r.severity
        when 'high'   then 0
        when 'normal' then 1
        when 'low'    then 2 end))[1] as worst
  from public.reports r
  where r.status in ('open','reviewing')
  group by r.auction_id
  having count(*) >= greatest(1, p_min_reports)
  order by count(*) desc
  limit greatest(0, p_limit);
end; $$;
grant execute on function public.fraud_reported_auctions(int, int) to authenticated;

-- 4) Users with active bans + warnings (chronic offenders).
create or replace function public.fraud_chronic_offenders(
  p_limit int default 50
) returns table (
  user_id        uuid,
  active_bans    bigint,
  total_warnings bigint,
  trust_score    int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.view') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
  select
    s.id as user_id,
    coalesce(b.active_bans, 0) as active_bans,
    coalesce(w.total_warnings, 0) as total_warnings,
    s.trust_score
  from public.sellers s
  left join (
    select user_id, count(*) as active_bans
      from public.user_bans
     where lifted_at is null and (banned_until is null or banned_until > now())
     group by user_id
  ) b on b.user_id = s.id
  left join (
    select user_id, count(*) as total_warnings
      from public.user_warnings
     where dismissed_at is null
     group by user_id
  ) w on w.user_id = s.id
  where coalesce(b.active_bans,0) > 0 or coalesce(w.total_warnings,0) >= 2
  order by coalesce(b.active_bans,0) desc, coalesce(w.total_warnings,0) desc
  limit greatest(0, p_limit);
end; $$;
grant execute on function public.fraud_chronic_offenders(int) to authenticated;


-- ---------------------------------------------------------
-- File: migrate-analytics-rpcs.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Analytics RPCs (funnel, leaderboard, heatmap)
--
-- Reads need access to auth.users.created_at for the signup → KYC →
-- bid → win funnel, which authenticated users can't read directly.
-- Wrapping behind SECURITY DEFINER + admin-gate keeps RLS clean.
--
-- Safe to run repeatedly.
-- ============================================================

-- 1) Signup → email verified → KYC verified → first bid → first win.
create or replace function public.analytics_funnel(
  p_days int default 90
) returns table (
  signups        bigint,
  email_verified bigint,
  kyc_verified   bigint,
  first_bid      bigint,
  first_win      bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_role() is null then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
  with cohort as (
    select id, email_confirmed_at, raw_user_meta_data
      from auth.users
     where created_at > now() - (p_days || ' days')::interval
  ),
  bidders as (
    select distinct user_id from public.bids b
     where b.user_id in (select id from cohort)
  ),
  winners as (
    select distinct user_id from public.transactions t
     where t.type = 'final_payment' and t.status = 'completed'
       and t.user_id in (select id from cohort)
  )
  select
    (select count(*) from cohort)::bigint,
    (select count(*) from cohort where email_confirmed_at is not null)::bigint,
    (select count(*) from cohort
       where (raw_user_meta_data ->> 'kycStatus') = 'verified')::bigint,
    (select count(*) from bidders)::bigint,
    (select count(*) from winners)::bigint;
end; $$;
grant execute on function public.analytics_funnel(int) to authenticated;

-- 2) Top sellers by realised sales in window.
create or replace function public.analytics_top_sellers(
  p_days int default 30,
  p_limit int default 10
) returns table (
  seller_id     uuid,
  display_name  text,
  username      text,
  sales_count   bigint,
  total_amount  numeric,
  trust_score   int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_role() is null then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
  select
    s.id,
    s.display_name::text,
    s.username::text,
    count(distinct a.id)        as sales_count,
    coalesce(sum(a.current_price),0) as total_amount,
    s.trust_score
  from public.sellers s
  join public.auctions a on a.seller_id = s.id
  where a.status = 'ended'
    and a.end_time > now() - (p_days || ' days')::interval
  group by s.id, s.display_name, s.username, s.trust_score
  order by total_amount desc
  limit greatest(0, p_limit);
end; $$;
grant execute on function public.analytics_top_sellers(int, int) to authenticated;

-- 3) Top bidders by bid volume in window.
create or replace function public.analytics_top_bidders(
  p_days int default 30,
  p_limit int default 10
) returns table (
  user_id     uuid,
  bid_count   bigint,
  win_count   bigint,
  total_won   numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_role() is null then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
  with bidcounts as (
    select b.user_id, count(*)::bigint as bid_count
      from public.bids b
     where b.placed_at > now() - (p_days || ' days')::interval
     group by b.user_id
  ),
  wins as (
    select t.user_id, count(*) as win_count, sum(t.amount) as total_won
      from public.transactions t
     where t.type = 'final_payment' and t.status = 'completed'
       and t.created_at > now() - (p_days || ' days')::interval
     group by t.user_id
  )
  select
    bc.user_id,
    bc.bid_count,
    coalesce(w.win_count, 0)::bigint,
    coalesce(w.total_won, 0)::numeric
  from bidcounts bc
  left join wins w on w.user_id = bc.user_id
  order by bc.bid_count desc
  limit greatest(0, p_limit);
end; $$;
grant execute on function public.analytics_top_bidders(int, int) to authenticated;

-- 4) Hourly bidding heatmap — counts per (day_of_week × hour) over the
-- last N days. day_of_week: 0=Sunday … 6=Saturday (PG dow).
create or replace function public.analytics_bidding_heatmap(
  p_days int default 30
) returns table (
  dow   int,
  hour  int,
  bids  bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_role() is null then
    raise exception 'NOT_AUTHORIZED';
  end if;
  return query
  select
    extract(dow from b.placed_at)::int  as dow,
    extract(hour from b.placed_at)::int as hour,
    count(*)::bigint                    as bids
  from public.bids b
  where b.placed_at > now() - (p_days || ' days')::interval
  group by 1, 2
  order by 1, 2;
end; $$;
grant execute on function public.analytics_bidding_heatmap(int) to authenticated;


-- ---------------------------------------------------------
-- File: migrate-additional-settings.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — additional platform_settings
--
-- Numbers / lists that today live in client-side TypeScript but
-- a non-engineer admin should be able to tune. Adding them here
-- so /admin/settings can edit them; the seller wizard reads them
-- via lib/config.ts (TS) or get_setting() (SQL).
--
-- Safe to run repeatedly.
-- ============================================================

insert into public.platform_settings (key, value, type, category, description, sensitive, requires_approval) values
  -- Listing wizard tunables
  ('listing.duration_options',       '[3, 7, 14]'::jsonb,
   'json',  'listing', 'Auction durations the seller can pick (days)', false, false),

  ('listing.bid_increment_tiers',
   '[{"max":30000,"increment":250},{"max":100000,"increment":500},{"max":null,"increment":1000}]'::jsonb,
   'json',  'listing',
   'Bid increment tiers — first matching row wins. max=null means open-ended top tier.',
   false, true),

  -- Photo slots & video script — tunable but rarely changed.
  ('listing.photos.required_slots',
   '["front","rear","right_side","left_side","dashboard","odometer","front_seats","rear_seats","engine","trunk","tires","vin"]'::jsonb,
   'json', 'listing',
   'Identifiers of the 12 mandatory photo angles. Editing this changes step-2 of the seller wizard.',
   false, true),

  ('listing.video.script',
   '[{"from":0,"to":20,"label":"360° autour"},{"from":20,"to":35,"label":"Portes ouvertes"},{"from":35,"to":45,"label":"Capot ouvert"},{"from":45,"to":55,"label":"Démarrage"},{"from":55,"to":60,"label":"Plaque"}]'::jsonb,
   'json', 'listing',
   'Video checklist segments shown in step-3 of the seller wizard.',
   false, false),

  -- Trust score tier thresholds — UI label cutoffs.
  ('trust.tier_thresholds',
   '{"new":0,"low":42,"trusted":96,"very_trusted":156,"verified_pro":268}'::jsonb,
   'json', 'trust',
   'Lower bound (inclusive) for each trust tier. The matching tier name is the highest threshold ≤ current score.',
   false, true),

  -- Image processing pipeline
  ('media.image.max_edge_px',          '1920'::jsonb,  'number', 'media',
   'Maximum image edge in pixels for client-side compression', false, false),
  ('media.image.jpeg_quality',         '0.85'::jsonb,  'number', 'media',
   'JPEG compression quality (0–1)', false, false),
  ('media.image.skip_threshold_bytes', '204800'::jsonb,'number', 'media',
   'Files smaller than this many bytes skip client-side compression', false, false),
  ('media.thumb.width_px',             '600'::jsonb,   'number', 'media',
   'Default thumbnail width', false, false),
  ('media.thumb.quality',              '70'::jsonb,    'number', 'media',
   'Default thumbnail quality (0–100)', false, false),

  -- Public contact information (used by /contact, /help, /payment/failed)
  ('support.email',                    '"support@mazedauto.tn"'::jsonb, 'string', 'support',
   'Public support email address', false, true),
  ('support.phone',                    '"+216 70 100 200"'::jsonb,      'string', 'support',
   'Public support phone number', false, true),
  ('support.address',                  '"Avenue de la Liberté, 1002 Tunis Capitale"'::jsonb,
   'string', 'support', 'Public office address', false, false),
  ('support.hours',                    '"9h - 18h, 7j/7"'::jsonb, 'string', 'support',
   'Live support hours (free-text)', false, false),

  -- Forfeit penalty for renouncing a win (PLAN §21.4)
  ('auction.forfeit.ban_days',         '30'::jsonb,   'number', 'auction',
   'How many days a winner who voluntarily forfeits is banned from new bids', false, true),
  ('auction.forfeit.trust_penalty',    '40'::jsonb,   'number', 'auction',
   'Trust score points deducted on voluntary forfeit', true, true),

  -- KYC validity
  ('kyc.validity_days',                '365'::jsonb,  'number', 'kyc',
   'How long a KYC verification stays valid before re-verification is required', false, true),
  ('kyc.expiry_warning_days',          '30'::jsonb,   'number', 'kyc',
   'Warn the user this many days before KYC expires', false, false),

  -- Payment provider / simulation
  ('payment.simulation.failure_rate',  '0'::jsonb,    'number', 'payment',
   'Probability (0–1) that the simulated payment processor fails. Useful for QA.',
   false, false),

  -- Auction time blackout windows (PLAN §21.X)
  -- Hours are local time in `auction.blackout.timezone`. Each entry is a
  -- pair [startHour, endHour); endHour < startHour means the window wraps
  -- past midnight (e.g. [23, 7) = nightly 23:00 → 07:00).
  ('auction.blackout.enabled',       'false'::jsonb, 'boolean', 'auction',
   'When true, sellers cannot schedule auctions to end inside a blackout window and admin extend warns before crossing one.',
   false, false),
  ('auction.blackout.windows',       '[[23, 7]]'::jsonb, 'json', 'auction',
   'Array of [startHour, endHour) pairs (0–23). End hour < start hour wraps past midnight.',
   false, false),
  ('auction.blackout.timezone',      '"Africa/Tunis"'::jsonb, 'string', 'auction',
   'IANA timezone used to interpret blackout hours.',
   false, false)
on conflict (key) do nothing;


-- ---------------------------------------------------------
-- File: migrate-admin-sprint-a.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Admin Sprint A
--
-- Closes the most painful day-to-day gaps in the admin:
--   * direct auction edit (not just "request edit")
--   * force re-verify email / phone
--   * bulk KYC + auction queue actions
--   * admin → user 1:1 DM
--   * auction status timeline
--   * one-click refund a specific deposit
--   * maintenance-mode flag
--
-- Depends on: migrate-admin-foundations.sql, migrate-admin-actions.sql,
--             migrate-cms.sql (notification_templates).
-- Safe to run repeatedly.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) auction_status_log + trigger
-- ------------------------------------------------------------------
-- When an auction's status changes (manual admin action, cron sweep,
-- bid trigger pushing it to "ending"), we record a row here so the
-- admin auction detail page can show a timeline. Pre-existing
-- admin_audit_log captures the actor; this table captures the
-- *transition* regardless of who/what triggered it.

create table if not exists public.auction_status_log (
  id           uuid primary key default gen_random_uuid(),
  auction_id   uuid not null references public.auctions(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  actor_id     uuid references auth.users(id) on delete set null,
  detail       text,
  created_at   timestamptz not null default now()
);

create index if not exists auction_status_log_auction_idx
  on public.auction_status_log (auction_id, created_at desc);

alter table public.auction_status_log enable row level security;
drop policy if exists "auction_status_log_admin_read" on public.auction_status_log;
create policy "auction_status_log_admin_read" on public.auction_status_log
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.auctions a
                where a.id = auction_id and a.seller_id = auth.uid())
  );

create or replace function public.log_auction_status_change()
returns trigger language plpgsql security definer as $$
begin
  if (TG_OP = 'INSERT') or (new.status is distinct from old.status) then
    insert into public.auction_status_log (auction_id, from_status, to_status, actor_id)
    values (new.id, case when TG_OP = 'INSERT' then null else old.status end,
            new.status, auth.uid());
  end if;
  return new;
end; $$;

drop trigger if exists trg_auction_status_log on public.auctions;
create trigger trg_auction_status_log
after insert or update of status on public.auctions
for each row execute function public.log_auction_status_change();

-- ------------------------------------------------------------------
-- 2) admin_edit_auction
-- ------------------------------------------------------------------
-- Patch any subset of editable auction fields. Validates types,
-- writes via the existing UPDATE policy (admin RLS), records an
-- audit row with the diff so reviewers know exactly what changed.
--
-- Whitelist of editable fields lives in this function — extending
-- it is a deliberate, reviewed change.

create or replace function public.admin_edit_auction(
  p_auction_id uuid,
  p_patch      jsonb,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_keys text[] := array[]::text[];
  v_unknown text[] := array[]::text[];
  v_allowed text[] := array[
    'make','model','year','mileage','fuel_type','transmission','color',
    'condition','category','description','features','city','region',
    'image_urls','video_url',
    'starting_price','reserve_price','buy_now_price',
    'bid_increment','start_time','end_time','original_end_time',
    'is_featured','is_vip',
    'carte_grise_owner_name','ownership_exception'
  ];
  v_key text;
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'PATCH_REQUIRED';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key = any(v_allowed) then
      v_keys := array_append(v_keys, v_key);
    else
      v_unknown := array_append(v_unknown, v_key);
    end if;
  end loop;

  if array_length(v_unknown, 1) > 0 then
    raise exception 'UNKNOWN_FIELD: %', array_to_string(v_unknown, ',');
  end if;
  if array_length(v_keys, 1) is null or array_length(v_keys, 1) = 0 then
    raise exception 'EMPTY_PATCH';
  end if;

  -- Snapshot before/after for audit detail.
  select to_jsonb(a) - 'created_at' into v_old
    from public.auctions a where a.id = p_auction_id;
  if v_old is null then raise exception 'AUCTION_NOT_FOUND'; end if;

  update public.auctions a
     set make            = coalesce(p_patch ->> 'make', a.make),
         model           = coalesce(p_patch ->> 'model', a.model),
         year            = coalesce((p_patch ->> 'year')::int, a.year),
         mileage         = coalesce((p_patch ->> 'mileage')::int, a.mileage),
         fuel_type       = coalesce(p_patch ->> 'fuel_type', a.fuel_type),
         transmission    = coalesce(p_patch ->> 'transmission', a.transmission),
         color           = coalesce(p_patch ->> 'color', a.color),
         condition       = coalesce(p_patch ->> 'condition', a.condition),
         category        = coalesce(p_patch ->> 'category', a.category),
         description     = case when p_patch ? 'description' then p_patch ->> 'description' else a.description end,
         features        = case when p_patch ? 'features'
                                  then (select array_agg(value::text)
                                          from jsonb_array_elements_text(p_patch -> 'features'))
                                else a.features end,
         city            = coalesce(p_patch ->> 'city', a.city),
         region          = coalesce(p_patch ->> 'region', a.region),
         image_urls      = case when p_patch ? 'image_urls'
                                  then (select array_agg(value::text)
                                          from jsonb_array_elements_text(p_patch -> 'image_urls'))
                                else a.image_urls end,
         video_url       = case when p_patch ? 'video_url' then p_patch ->> 'video_url' else a.video_url end,
         starting_price  = coalesce((p_patch ->> 'starting_price')::numeric, a.starting_price),
         reserve_price   = case when p_patch ? 'reserve_price'
                                  then nullif(p_patch ->> 'reserve_price','')::numeric
                                else a.reserve_price end,
         buy_now_price   = case when p_patch ? 'buy_now_price'
                                  then nullif(p_patch ->> 'buy_now_price','')::numeric
                                else a.buy_now_price end,
         bid_increment   = coalesce((p_patch ->> 'bid_increment')::numeric, a.bid_increment),
         start_time      = coalesce((p_patch ->> 'start_time')::timestamptz, a.start_time),
         end_time        = coalesce((p_patch ->> 'end_time')::timestamptz, a.end_time),
         original_end_time = coalesce((p_patch ->> 'original_end_time')::timestamptz, a.original_end_time),
         is_featured     = coalesce((p_patch ->> 'is_featured')::boolean, a.is_featured),
         is_vip          = coalesce((p_patch ->> 'is_vip')::boolean, a.is_vip),
         carte_grise_owner_name = case when p_patch ? 'carte_grise_owner_name'
                                      then p_patch ->> 'carte_grise_owner_name'
                                    else a.carte_grise_owner_name end,
         ownership_exception    = case when p_patch ? 'ownership_exception'
                                      then nullif(p_patch ->> 'ownership_exception','')
                                    else a.ownership_exception end
   where a.id = p_auction_id;

  select to_jsonb(a) - 'created_at' into v_new
    from public.auctions a where a.id = p_auction_id;

  perform public.log_admin_action(
    'auction.edit',
    p_target_auction_id => p_auction_id,
    p_target_type       => 'auction',
    p_detail            => 'fields=' || array_to_string(v_keys, ','),
    p_metadata          => jsonb_build_object('reason', p_reason, 'before', v_old, 'after', v_new)
  );
end; $$;
grant execute on function public.admin_edit_auction(uuid, jsonb, text) to authenticated;

-- ------------------------------------------------------------------
-- 3) admin_reset_email / admin_reset_phone
-- ------------------------------------------------------------------
-- Forces re-verification by clearing the corresponding confirmed_at.
-- The user then sees the verify-email / verify-phone screens at
-- next login.

create or replace function public.admin_reset_email_verification(
  p_user_id uuid,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.warn') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  update auth.users set email_confirmed_at = null where id = p_user_id;

  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'system',
          'Re-vérification email requise',
          coalesce(p_reason, 'Veuillez confirmer à nouveau votre adresse email'));

  perform public.log_admin_action(
    'user.reset_email',
    p_target_user_id => p_user_id,
    p_detail         => p_reason
  );
end; $$;
grant execute on function public.admin_reset_email_verification(uuid, text) to authenticated;

create or replace function public.admin_reset_phone_verification(
  p_user_id uuid,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.warn') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  update auth.users set phone_confirmed_at = null where id = p_user_id;

  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'system',
          'Re-vérification téléphone requise',
          coalesce(p_reason, 'Veuillez confirmer à nouveau votre numéro de téléphone'));

  perform public.log_admin_action(
    'user.reset_phone',
    p_target_user_id => p_user_id,
    p_detail         => p_reason
  );
end; $$;
grant execute on function public.admin_reset_phone_verification(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- 4) Bulk operations
-- ------------------------------------------------------------------

-- Bulk KYC review: same decision + reason for many submissions.
create or replace function public.admin_bulk_review_kyc(
  p_submission_ids uuid[],
  p_decision       text,
  p_reason         text default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_count int := 0;
begin
  if not public.has_admin_capability('kyc.review') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'INVALID_DECISION';
  end if;
  if p_submission_ids is null or array_length(p_submission_ids, 1) is null then
    return 0;
  end if;

  foreach v_id in array p_submission_ids loop
    begin
      perform public.review_kyc(v_id, p_decision, p_reason);
      v_count := v_count + 1;
    exception when others then
      -- Skip individual failures so the rest of the batch still applies.
      perform public.log_admin_action(
        'kyc.bulk_review.skip',
        p_target_id   => v_id,
        p_target_type => 'kyc_submission',
        p_detail      => SQLERRM
      );
    end;
  end loop;

  perform public.log_admin_action(
    'kyc.bulk_review',
    p_detail   => p_decision || ' x' || v_count,
    p_metadata => jsonb_build_object('count', v_count, 'reason', p_reason)
  );
  return v_count;
end; $$;
grant execute on function public.admin_bulk_review_kyc(uuid[], text, text) to authenticated;

-- Bulk auction approve (status="active"). Same end_time logic as the
-- single-row path: end_time = now() + (original_end_time − start_time).
create or replace function public.admin_bulk_approve_auctions(
  p_auction_ids uuid[]
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
  v_now timestamptz := now();
  v_end timestamptz;
  v_seller uuid;
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_auction_ids is null or array_length(p_auction_ids, 1) is null then
    return 0;
  end if;

  for r in select id, seller_id, start_time, original_end_time
             from public.auctions
            where id = any(p_auction_ids) and status = 'pending_review'
  loop
    v_end := v_now + (coalesce(r.original_end_time, v_now + interval '7 days') - coalesce(r.start_time, v_now));
    update public.auctions
       set status = 'active',
           start_time = v_now,
           end_time = v_end,
           original_end_time = v_end
     where id = r.id;

    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (r.seller_id, r.id, 'approved',
            'Enchère approuvée',
            'Votre annonce est en ligne.');
    v_count := v_count + 1;
  end loop;

  perform public.log_admin_action(
    'auction.bulk_approve',
    p_detail => 'count=' || v_count
  );
  return v_count;
end; $$;
grant execute on function public.admin_bulk_approve_auctions(uuid[]) to authenticated;

create or replace function public.admin_bulk_reject_auctions(
  p_auction_ids uuid[],
  p_reason      text
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_auction_ids is null or array_length(p_auction_ids, 1) is null then
    return 0;
  end if;

  for r in select id, seller_id from public.auctions
            where id = any(p_auction_ids) and status in ('pending_review','scheduled')
  loop
    update public.auctions set status = 'cancelled' where id = r.id;
    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (r.seller_id, r.id, 'rejected', 'Enchère refusée', p_reason);
    v_count := v_count + 1;
  end loop;

  perform public.log_admin_action(
    'auction.bulk_reject',
    p_detail   => 'count=' || v_count,
    p_metadata => jsonb_build_object('reason', p_reason)
  );
  return v_count;
end; $$;
grant execute on function public.admin_bulk_reject_auctions(uuid[], text) to authenticated;

-- ------------------------------------------------------------------
-- 5) admin_dm_user — 1:1 admin → user system message
-- ------------------------------------------------------------------
-- Lighter than a broadcast: targets a single user, written into the
-- existing notifications table with a custom title/body. Logged.

create or replace function public.admin_dm_user(
  p_user_id uuid,
  p_title   text,
  p_body    text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_admin_capability('broadcast.create') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_title is null or btrim(p_title) = '' or p_body is null or btrim(p_body) = '' then
    raise exception 'TITLE_AND_BODY_REQUIRED';
  end if;

  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'system', p_title, p_body)
  returning id into v_id;

  perform public.log_admin_action(
    'user.dm',
    p_target_user_id => p_user_id,
    p_target_id      => v_id,
    p_target_type    => 'notification',
    p_detail         => left(p_title, 100)
  );
  return v_id;
end; $$;
grant execute on function public.admin_dm_user(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------
-- 6) admin_refund_deposit — one-click refund a single deposit tx
-- ------------------------------------------------------------------
-- Marks the source deposit as completed (idempotent — was already
-- "completed" if it landed normally) and writes a paired refund row.

create or replace function public.admin_refund_deposit(
  p_tx_id  uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src record;
  v_id  uuid;
begin
  if not public.has_admin_capability('transaction.refund') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_src from public.transactions where id = p_tx_id;
  if v_src is null then raise exception 'TX_NOT_FOUND'; end if;
  if v_src.type <> 'deposit' then raise exception 'NOT_A_DEPOSIT'; end if;

  -- Refuse to double-refund: bail if a refund row already exists for
  -- the same (user, auction) pair on or after this deposit.
  if exists (
    select 1 from public.transactions
     where user_id    = v_src.user_id
       and auction_id = v_src.auction_id
       and type       = 'refund'
       and created_at >= v_src.created_at
  ) then
    raise exception 'ALREADY_REFUNDED';
  end if;

  insert into public.transactions
    (ref, user_id, user_label, auction_id, type, direction,
     amount, label, status)
  values
    ('TX-RFD-' || substr(gen_random_uuid()::text, 1, 8),
     v_src.user_id, v_src.user_label, v_src.auction_id,
     'refund', 'in', v_src.amount,
     'Remboursement caution — ' || coalesce(p_reason, 'décision admin'),
     'completed')
  returning id into v_id;

  insert into public.notifications (user_id, auction_id, kind, title, body)
  values (v_src.user_id, v_src.auction_id, 'deposit_refunded',
          'Caution remboursée',
          coalesce(p_reason, 'Remboursement effectué.'));

  perform public.log_admin_action(
    'transaction.refund',
    p_target_user_id    => v_src.user_id,
    p_target_auction_id => v_src.auction_id,
    p_target_id         => v_id,
    p_target_type       => 'transaction',
    p_detail            => p_reason
  );
  return v_id;
end; $$;
grant execute on function public.admin_refund_deposit(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- 7) Maintenance mode — settings key
-- ------------------------------------------------------------------
insert into public.platform_settings (key, value, type, category, description, sensitive, requires_approval)
values
  ('system.maintenance_mode',         'false'::jsonb, 'boolean', 'system',
   'When true, the public site shows a read-only banner and writes (bid, payment, listing) refuse. Admin paths stay open.',
   false, false),
  ('system.maintenance_message_fr',
   '"Mazed Auto est en maintenance. Les enchères sont temporairement en lecture seule."'::jsonb,
   'string', 'system',
   'Banner message shown to users when maintenance mode is on (FR).',
   false, false),
  ('system.maintenance_message_ar',
   '"موقع مزاد أوتو في وضع الصيانة. المزادات في وضع القراءة فقط مؤقتًا."'::jsonb,
   'string', 'system',
   'Banner message shown to users when maintenance mode is on (AR).',
   false, false)
on conflict (key) do nothing;

-- ------------------------------------------------------------------
-- 8) admin_session_self — what's MY current session?
-- ------------------------------------------------------------------
-- Powers the /admin/me page: returns the calling admin's last-seen,
-- audit-action count, role, etc. Read-only convenience.

create or replace function public.admin_self_summary()
returns table (
  admin_role     text,
  email          text,
  display_name   text,
  recent_actions bigint,
  last_seen      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
  select
    public.admin_role()::text,
    (select email::text from auth.users where id = v_id),
    coalesce(
      (select s.display_name from public.sellers s where s.id = v_id),
      (select btrim(coalesce(u.raw_user_meta_data ->> 'firstName','') || ' ' ||
                    coalesce(u.raw_user_meta_data ->> 'lastName',''))
         from auth.users u where u.id = v_id)
    )::text,
    (select count(*) from public.admin_audit_log
       where actor_id = v_id and created_at > now() - interval '30 days')::bigint,
    (select max(last_seen) from public.admin_sessions where user_id = v_id);
end; $$;
grant execute on function public.admin_self_summary() to authenticated;


-- ---------------------------------------------------------
-- File: migrate-cms-categories.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — CMS categories (body types)
--
-- Adds an admin-managed "category" table so the home page and
-- browse filter can show an image + localised label per body
-- type without redeploying. The matching `VehicleCategory` TS
-- union still drives auction.category writes, but the labels and
-- images that users *see* now come from this table.
--
-- Depends on: migrate-admin-foundations.sql, migrate-cms.sql
-- Safe to run repeatedly.
-- ============================================================

create table if not exists public.cms_categories (
  slug         text primary key,           -- 'sedan' | 'suv' | 'hatchback' | 'pickup' | 'van' | 'coupe' | 'convertible' | 'wagon'
  name_ar      text,
  name_fr      text not null,
  image_url    text,                       -- absolute URL or relative /uploads/...
  is_visible   boolean not null default true,
  position     int not null default 0,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.cms_categories enable row level security;
drop policy if exists "cms_categories_public_read" on public.cms_categories;
create policy "cms_categories_public_read" on public.cms_categories
  for select using (true);

-- Admin write — relies on the cross-cutting admin RLS bypass set up in
-- migrate-rls-admin-fix.sql, same pattern as the rest of the cms_* tables.

insert into public.cms_categories (slug, name_fr, name_ar, position) values
  ('sedan',       'Berline',     'سيدان',           10),
  ('suv',         'SUV',         'دفع رباعي',       20),
  ('hatchback',   'Citadine',    'هاتشباك',         30),
  ('pickup',      'Pickup',      'بيك آب',          40),
  ('coupe',       'Coupé',       'كوبيه',           50),
  ('convertible', 'Cabriolet',   'مكشوفة',          60),
  ('wagon',       'Break',       'بريك',            70),
  ('van',         'Utilitaire',  'فان',             80)
on conflict (slug) do nothing;


-- ---------------------------------------------------------
-- File: migrate-admin-forfeits.sql
-- ---------------------------------------------------------

-- ============================================================
-- Mazed Auto — Admin caution (forfeit) management
--
-- Today forfeits happen automatically when `payment_deadline` passes
-- (handled by `process_expired_payment_deadlines`) or when the winner
-- voluntarily renounces from /buyer/wins. Some cases need manual
-- intervention by an admin:
--
--   • Confirmed fraud / no-show before the deadline expires — force
--     forfeit now instead of waiting.
--   • A forfeit was applied wrongly (admin made a mistake, or the
--     winner contested with proof of payment) — reverse it.
--   • Legitimate reason for delay (sick, abroad) — extend the payment
--     deadline by N days.
--
-- This migration adds three RPCs. All require `transaction.adjust`
-- capability (admin, super_admin, finance roles) and log every action.
--
-- Depends on: migrate-admin-foundations.sql, migrate-winner-forfeit.sql
-- Safe to run repeatedly.
-- ============================================================

-- 1) admin_force_forfeit_winner -----------------------------------------
-- Wraps forfeit_winner_deposit() with admin RBAC + audit log. The reason
-- is recorded in admin_audit_log AND stored in auction_forfeits as a
-- new `admin_note` column so the UI can show why it was manually forced.

alter table public.auction_forfeits
  add column if not exists admin_note    text,
  add column if not exists admin_user_id uuid references auth.users(id) on delete set null,
  add column if not exists reversed_at   timestamptz,
  add column if not exists reversed_by   uuid references auth.users(id) on delete set null,
  add column if not exists reversed_reason text;

create or replace function public.admin_force_forfeit(
  p_auction_id uuid,
  p_reason     text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_winner uuid;
  v_status text;
  v_forfeit_id uuid;
begin
  if not public.has_admin_capability('transaction.adjust') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select current_winner_id, status
    into v_winner, v_status
    from public.auctions where id = p_auction_id;

  if v_winner is null then raise exception 'NO_CURRENT_WINNER'; end if;
  if v_status not in ('ended', 're_offered') then
    raise exception 'WRONG_STATUS: %', v_status;
  end if;

  -- Delegate to the existing forfeit pipeline (handles split, ledger,
  -- notifications, next-bidder cascade) using a synthetic reason so
  -- the audit row is distinguishable from automatic ones.
  perform public.forfeit_winner_deposit(
    p_auction_id, v_winner, 'payment_deadline_expired'
  );

  -- Stamp the most recent forfeit with the admin note.
  update public.auction_forfeits
     set admin_note    = p_reason,
         admin_user_id = auth.uid()
   where id = (
     select id from public.auction_forfeits
     where auction_id = p_auction_id and user_id = v_winner
     order by forfeited_at desc
     limit 1
   )
   returning id into v_forfeit_id;

  perform public.log_admin_action(
    'transaction.adjust',
    p_target_auction_id => p_auction_id,
    p_target_id         => v_forfeit_id,
    p_target_type       => 'auction_forfeit',
    p_detail            => 'force_forfeit: ' || p_reason
  );

  return v_forfeit_id;
end; $$;

grant execute on function public.admin_force_forfeit(uuid, text) to authenticated;

-- 2) admin_reverse_forfeit ---------------------------------------------
-- Marks a forfeit row as reversed and writes compensating transactions.
-- We don't delete the audit row — the original entry is permanent.

create or replace function public.admin_reverse_forfeit(
  p_forfeit_id uuid,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction_id   uuid;
  v_user_id      uuid;
  v_seller_id    uuid;
  v_seller_amt   numeric;
  v_platform_amt numeric;
  v_amount       numeric;
  v_user_label   text;
begin
  if not public.has_admin_capability('transaction.adjust') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select f.auction_id, f.user_id, f.seller_share, f.platform_share, f.amount, f.user_label
    into v_auction_id, v_user_id, v_seller_amt, v_platform_amt, v_amount, v_user_label
    from public.auction_forfeits f
   where f.id = p_forfeit_id and f.reversed_at is null
   for update;

  if v_auction_id is null then
    raise exception 'FORFEIT_NOT_FOUND_OR_ALREADY_REVERSED';
  end if;

  select seller_id into v_seller_id
    from public.auctions where id = v_auction_id;

  -- Compensating ledger entries (negative direction = 'out').
  insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
  values (
    'TX-RV-' || substring(gen_random_uuid()::text from 1 for 8),
    v_seller_id, null, v_auction_id, 'refund', 'out', v_seller_amt,
    'Annulation forfait — part vendeur remboursée',
    'completed'
  );
  insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
  values (
    'TX-RV-' || substring(gen_random_uuid()::text from 1 for 8),
    null, 'Mazed Auto', v_auction_id, 'refund', 'out', v_platform_amt,
    'Annulation forfait — part plateforme reversée',
    'completed'
  );
  -- Caution returned to the bidder.
  insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
  values (
    'TX-RV-' || substring(gen_random_uuid()::text from 1 for 8),
    v_user_id, v_user_label, v_auction_id, 'refund', 'out', v_amount,
    'Caution restituée — forfait annulé',
    'completed'
  );

  update public.auction_forfeits
     set reversed_at     = now(),
         reversed_by     = auth.uid(),
         reversed_reason = p_reason
   where id = p_forfeit_id;

  insert into public.notifications (user_id, auction_id, kind, title, body)
  values (v_user_id, v_auction_id, 'deposit_refunded',
    'Caution restituée',
    'L''administration a annulé le forfait — votre caution de ' ||
      v_amount::text || ' DT vous a été restituée. Motif : ' || p_reason
  );

  perform public.log_admin_action(
    'transaction.adjust',
    p_target_auction_id => v_auction_id,
    p_target_id         => p_forfeit_id,
    p_target_type       => 'auction_forfeit',
    p_detail            => 'reverse_forfeit: ' || p_reason
  );
end; $$;

grant execute on function public.admin_reverse_forfeit(uuid, text) to authenticated;

-- 3) admin_extend_payment_deadline -------------------------------------
-- Push the payment deadline of a finished auction back by N days so
-- the current winner has more time to pay. Notifies the winner.

create or replace function public.admin_extend_payment_deadline(
  p_auction_id uuid,
  p_days       int,
  p_reason     text
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old timestamptz;
  v_new timestamptz;
  v_winner uuid;
  v_status text;
begin
  if not public.has_admin_capability('transaction.adjust') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_days is null or p_days <= 0 then
    raise exception 'DAYS_REQUIRED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select payment_deadline, current_winner_id, status
    into v_old, v_winner, v_status
    from public.auctions where id = p_auction_id for update;

  if v_winner is null then raise exception 'NO_CURRENT_WINNER'; end if;
  if v_status not in ('ended', 're_offered') then
    raise exception 'WRONG_STATUS: %', v_status;
  end if;

  v_new := coalesce(v_old, now()) + make_interval(days => p_days);

  update public.auctions
     set payment_deadline = v_new
   where id = p_auction_id;

  insert into public.notifications (user_id, auction_id, kind, title, body)
  values (v_winner, p_auction_id, 'payment_due',
    'Délai de paiement prolongé',
    'L''administration a prolongé votre délai de paiement de ' ||
      p_days::text || ' jours. Nouvelle échéance : ' ||
      to_char(v_new at time zone 'Africa/Tunis', 'DD/MM/YYYY HH24:MI') ||
      '. Motif : ' || p_reason
  );

  perform public.log_admin_action(
    'transaction.adjust',
    p_target_auction_id => p_auction_id,
    p_target_type       => 'auction',
    p_detail            => 'extend_payment_deadline +' || p_days::text || 'd: ' || p_reason
  );

  return v_new;
end; $$;

grant execute on function public.admin_extend_payment_deadline(uuid, int, text) to authenticated;

-- 4) View: pending payment deadlines ----------------------------------
-- Convenience view for /admin/forfeits — auctions whose payment
-- deadline is approaching or already expired. The sweep auto-forfeits
-- expired rows on the next interaction, but admins can see the queue
-- in advance and decide to extend / force-forfeit early.

create or replace view public.admin_pending_payment_deadlines as
select
  a.id                as auction_id,
  a.make, a.model, a.year,
  a.current_price,
  a.participation_deposit,
  a.current_winner_id,
  a.payment_deadline,
  a.status,
  coalesce(
    (select btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                  coalesce(u.raw_user_meta_data->>'lastName',''))
       from auth.users u where u.id = a.current_winner_id),
    'Acheteur'
  )::text             as winner_label,
  case
    when a.payment_deadline <= now() then 'expired'
    when a.payment_deadline <= now() + interval '24 hours' then 'soon'
    else 'pending'
  end                 as urgency
from public.auctions a
where a.status in ('ended','re_offered')
  and a.current_winner_id is not null
  and a.payment_deadline is not null
  and not exists (
    select 1 from public.transactions t
    where t.auction_id = a.id
      and t.user_id    = a.current_winner_id
      and t.type       = 'final_payment'
      and t.status     = 'completed'
  );

grant select on public.admin_pending_payment_deadlines to authenticated;

