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
