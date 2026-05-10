-- ============================================================
-- Mazed Auto — Database Schema
-- Paste this into Supabase SQL Editor (Project → SQL → New Query)
-- ============================================================

-- 1) Sellers (auction-side identity, decoupled from auth users so
--    seed data works without real signups)
create table if not exists public.sellers (
  id                  uuid primary key default gen_random_uuid(),
  username            text unique not null,
  display_name        text not null,
  avatar_url          text,
  trust_score         int not null default 0,
  trust_level         text not null default 'new',
  verified_kyc        boolean not null default false,
  verified_ownership  boolean not null default false,
  successful_deals    int not null default 0,
  rating_average      numeric(3,2) not null default 0,
  rating_count        int not null default 0,
  account_age_months  int not null default 0,
  city                text not null,
  is_pro              boolean not null default false,
  created_at          timestamptz not null default now()
);

-- 2) Auctions (vehicle fields denormalized into the auction row
--    for simplicity and faster reads)
create table if not exists public.auctions (
  id                      uuid primary key default gen_random_uuid(),
  seller_id               uuid not null references public.sellers(id) on delete cascade,
  -- vehicle
  make                    text not null,
  model                   text not null,
  year                    int not null,
  mileage                 int not null,
  fuel_type               text not null check (fuel_type in ('gasoline','diesel','hybrid','electric')),
  transmission            text not null check (transmission in ('manual','automatic')),
  color                   text not null,
  condition               text not null check (condition in ('new','excellent','good','fair','damaged')),
  category                text not null,
  description             text,
  features                text[] not null default '{}',
  city                    text not null,
  region                  text not null,
  image_urls              text[] not null default '{}',
  video_url               text,
  -- auction
  starting_price          numeric not null,
  reserve_price           numeric,
  buy_now_price           numeric,
  current_price           numeric not null,
  participation_deposit   numeric not null,
  bid_increment           numeric not null,
  start_time              timestamptz not null,
  end_time                timestamptz not null,
  original_end_time       timestamptz not null,
  status                  text not null default 'active' check (status in ('scheduled','active','ending','ended','cancelled','reserve_not_met','pending_review')),
  reserve_met             boolean not null default false,
  total_bids              int not null default 0,
  total_participants      int not null default 0,
  is_featured             boolean not null default false,
  is_vip                  boolean not null default false,
  alerts                  jsonb not null default '[]'::jsonb,
  created_at              timestamptz not null default now()
);

create index if not exists auctions_status_end_idx on public.auctions (status, end_time);
create index if not exists auctions_featured_idx on public.auctions (is_featured) where is_featured;
create index if not exists auctions_seller_idx on public.auctions (seller_id);

-- 3) Bids
create table if not exists public.bids (
  id            uuid primary key default gen_random_uuid(),
  auction_id    uuid not null references public.auctions(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  bidder_label  text,
  amount        numeric not null,
  is_auto_bid   boolean not null default false,
  placed_at     timestamptz not null default now()
);

create index if not exists bids_auction_idx on public.bids (auction_id, placed_at desc);

-- 4) Seller ratings (left by buyers after a deal)
create table if not exists public.seller_ratings (
  id          uuid primary key default gen_random_uuid(),
  seller_id   uuid not null references public.sellers(id) on delete cascade,
  buyer_label text not null,
  rating      int not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);

create index if not exists ratings_seller_idx on public.seller_ratings (seller_id, created_at desc);

-- 5) Watchlist (favorites)
create table if not exists public.watchlist (
  user_id     uuid not null references auth.users(id) on delete cascade,
  auction_id  uuid not null references public.auctions(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, auction_id)
);

-- 7a) Notifications (per-user, realtime feed)
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

-- 7b) Reports (buyer-side flag → admin queue)
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

-- 8) Transactions ledger
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

-- 8) Platform stats (single row)
create table if not exists public.platform_stats (
  id                  int primary key default 1 check (id = 1),
  active_auctions     int not null default 0,
  completed_deals     int not null default 0,
  verified_sellers    int not null default 0,
  satisfaction        numeric(3,2) not null default 0
);

-- ============================================================
-- Realtime — broadcast auction & bid changes
-- Wrap each in DO/exception so a re-run doesn't 42710 on the
-- "already member of publication" check.
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table public.auctions;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.bids;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

-- ============================================================
-- Trigger: when a bid is inserted, bump the auction's
-- current_price + total_bids and recompute total_participants.
-- This is what makes the bid page truly realtime.
-- ============================================================
create or replace function public.handle_new_bid()
returns trigger
language plpgsql
security definer
as $$
declare
  v_participants int;
  v_reserve numeric;
  v_make text;
  v_model text;
  v_year int;
  v_prev_bidder uuid;
begin
  select count(distinct coalesce(user_id::text, bidder_label))
    into v_participants
    from public.bids
   where auction_id = new.auction_id;

  select reserve_price, make, model, year
    into v_reserve, v_make, v_model, v_year
    from public.auctions where id = new.auction_id;

  -- Find the previous high bidder so we can ping them
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
         reserve_met = (v_reserve is null or new.amount >= v_reserve)
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
end;
$$;

drop trigger if exists trg_new_bid on public.bids;
create trigger trg_new_bid
after insert on public.bids
for each row execute function public.handle_new_bid();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.sellers         enable row level security;
alter table public.auctions        enable row level security;
alter table public.bids            enable row level security;
alter table public.watchlist       enable row level security;
alter table public.platform_stats  enable row level security;
alter table public.seller_ratings  enable row level security;
alter table public.transactions    enable row level security;
alter table public.notifications   enable row level security;
alter table public.reports         enable row level security;

-- Public read for catalog data
drop policy if exists "sellers_public_read"   on public.sellers;
drop policy if exists "auctions_public_read"  on public.auctions;
drop policy if exists "bids_public_read"      on public.bids;
drop policy if exists "stats_public_read"     on public.platform_stats;
drop policy if exists "ratings_public_read"   on public.seller_ratings;

create policy "sellers_public_read"  on public.sellers        for select using (true);
create policy "auctions_public_read" on public.auctions       for select using (true);
create policy "bids_public_read"     on public.bids           for select using (true);
create policy "stats_public_read"    on public.platform_stats for select using (true);
create policy "ratings_public_read"  on public.seller_ratings for select using (true);

-- Transactions:
--  - Authenticated users see their own rows
--  - Demo/system rows (user_id is null) are publicly readable so the
--    admin page works out of the box; replace with role-based policies once
--    real admin auth is in place.
drop policy if exists "tx_owner_read" on public.transactions;
drop policy if exists "tx_demo_public_read" on public.transactions;
create policy "tx_owner_read" on public.transactions
  for select
  to authenticated
  using (auth.uid() = user_id);
create policy "tx_demo_public_read" on public.transactions
  for select
  using (user_id is null);

-- Bids: any authenticated user can place a bid (for their own user_id)
drop policy if exists "bids_insert_authed" on public.bids;
create policy "bids_insert_authed" on public.bids
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Watchlist: users see/manage only their own rows
drop policy if exists "watchlist_owner" on public.watchlist;
create policy "watchlist_owner" on public.watchlist
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Notifications: users see/update their own
drop policy if exists "notifs_owner_read" on public.notifications;
drop policy if exists "notifs_owner_update" on public.notifications;
create policy "notifs_owner_read" on public.notifications
  for select to authenticated using (auth.uid() = user_id);
create policy "notifs_owner_update" on public.notifications
  for update to authenticated using (auth.uid() = user_id);

-- Reports: anyone authed can file; the reporter sees their own;
-- demo policy: public read so admin pages work without role gating yet.
drop policy if exists "reports_insert_authed" on public.reports;
drop policy if exists "reports_public_read"   on public.reports;
create policy "reports_insert_authed" on public.reports
  for insert to authenticated with check (auth.uid() = reporter_id);
create policy "reports_public_read" on public.reports for select using (true);

-- Sellers: a logged-in user can create/update their own seller profile
-- (the seller_id matches their auth.uid()).
drop policy if exists "sellers_owner_write" on public.sellers;
create policy "sellers_owner_write" on public.sellers
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auctions: a logged-in user can create/update their own auctions.
drop policy if exists "auctions_owner_write" on public.auctions;
create policy "auctions_owner_write" on public.auctions
  for all to authenticated
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);
