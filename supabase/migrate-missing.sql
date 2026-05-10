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
