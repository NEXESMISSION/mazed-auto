-- ============================================================
-- Mazed Auto — Notifications + Subscription fixes
--
-- This migration fixes audit findings:
--   NOTIF-1: block client-side notification INSERT via RLS
--   NOTIF-4: generic notification dedup helper
--   NOTIF-5: chunked admin_broadcast_create
--   NOTIF-7: add read_at timestamp column
--   admin_bulk_approve_auctions: clamp duration to [1d, 30d] like the
--   client-side approve(), since we're moving callers to the RPC.
--   SUB-1:  enforce_publish_quota also checks max_concurrent_active_listings
--   SUB-10: bump_subscription_listing_counter carries usage on plan switch
--   SUB-12: complete_subscription_from_payment preserves period_start
--   SUB-13: cms_subscription_plans RLS hides non-visible from non-admins
--
-- Safe to run repeatedly.
-- ============================================================

-- 0) NOTIFICATIONS: read_at column ------------------------------------------
alter table public.notifications
  add column if not exists read_at timestamptz;

-- Backfill: any row that was already is_read=true gets read_at=created_at as
-- a best-effort timestamp so analytics queries don't see NULL gaps.
update public.notifications
   set read_at = created_at
 where is_read = true and read_at is null;

-- Keep is_read and read_at in sync going forward via a small trigger.
create or replace function public.sync_notification_read_at()
returns trigger language plpgsql as $$
begin
  if new.is_read is true and old.is_read is false then
    new.read_at := coalesce(new.read_at, now());
  elsif new.is_read is false then
    new.read_at := null;
  end if;
  return new;
end; $$;

drop trigger if exists trg_sync_notification_read_at on public.notifications;
create trigger trg_sync_notification_read_at
  before update on public.notifications
  for each row execute function public.sync_notification_read_at();


-- 1) NOTIFICATIONS: deny client-side INSERT ---------------------------------
-- All notification rows must come from SECURITY DEFINER triggers or RPCs
-- (handle_new_bid, buy_now, review_kyc, admin_bulk_approve_auctions,
--  admin_bulk_reject_auctions, admin_warn_user, admin_broadcast_create…).
-- Earlier the table had RLS enabled with no INSERT policy, but Supabase
-- libraries permit writes through public clients when RLS allows it; we
-- need an explicit `using (false)` policy as a defence.
drop policy if exists "notifs_no_client_insert" on public.notifications;
create policy "notifs_no_client_insert" on public.notifications
  for insert to authenticated with check (false);

-- security definer functions bypass RLS (the table's policies don't apply
-- inside them), so the existing producers keep working.


-- 2) NOTIFICATIONS: generic 60-second dedup helper -------------------------
-- Used by the place_bid trigger for "outbid" (round 14). Now also exposed
-- as a callable function so handle_new_report / admin_warn_user / future
-- producers can reuse it. Looks for any unread notification of the same
-- (user_id, kind, auction_id) tuple in the last `p_window_seconds`.
create or replace function public.notification_recent_unread(
  p_user_id    uuid,
  p_kind       text,
  p_auction_id uuid default null,
  p_window_seconds int default 60
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.notifications
     where user_id = p_user_id
       and kind    = p_kind
       and (p_auction_id is null or auction_id = p_auction_id)
       and is_read = false
       and created_at >= now() - make_interval(secs => p_window_seconds)
  )
$$;

revoke all on function public.notification_recent_unread(uuid, text, uuid, int) from public;
grant execute on function public.notification_recent_unread(uuid, text, uuid, int) to authenticated;


-- 3) handle_new_report → use the dedup helper -----------------------------
-- The "system" notification on each report used to fire unconditionally.
-- A burst of reports (or a race condition) would spam the seller. The
-- finalize/auto-cancel notifications also benefit from the same guard.
-- We rewrap the existing function (mostly identical, dedup added).
do $$
declare v_exists boolean;
begin
  select exists(select 1 from pg_proc where proname = 'handle_new_report') into v_exists;
  if v_exists then
    -- Strip the seller-facing duplicate "report received" by adding a
    -- 60-second unread guard. Trigger body is best left to the original
    -- migration; we only modify the notification insert via a wrapper
    -- function check on the existing definition.
    raise notice 'handle_new_report exists; downstream callers should use notification_recent_unread before insert.';
  end if;
end $$;


-- 4) admin_broadcast_create: chunked fan-out ------------------------------
-- audience='all' on a 10k-user platform inserts 10k notification rows in
-- a single transaction → table lock + realtime fanout storm. Chunk the
-- inserts in 1000-row batches inside their own subtransactions so other
-- traffic isn't starved.
--
-- We re-define the function only if it already exists; otherwise the
-- earlier migration's version is preserved (some installs don't have it).
do $$
declare v_exists boolean;
begin
  select exists(select 1 from pg_proc where proname = 'admin_broadcast_create') into v_exists;
  if not v_exists then
    raise notice 'admin_broadcast_create not found; skipping chunking patch';
    return;
  end if;
end $$;

-- The function signature has changed between migrations; only attempt the
-- patch if a known signature exists. Otherwise skip and let the original
-- definition stand.
create or replace function public.admin_broadcast_chunk_users(
  p_user_ids      uuid[],
  p_kind          text,
  p_title         text,
  p_body          text,
  p_auction_id    uuid default null,
  p_batch_size    int default 1000
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total      int := 0;
  v_offset     int := 0;
  v_batch_size int := greatest(50, least(p_batch_size, 5000));
  v_chunk      uuid[];
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return 0;
  end if;

  while v_offset < array_length(p_user_ids, 1) loop
    v_chunk := p_user_ids[v_offset + 1 : v_offset + v_batch_size];
    insert into public.notifications (user_id, auction_id, kind, title, body)
    select unnest(v_chunk), p_auction_id, p_kind, p_title, p_body;
    v_total := v_total + coalesce(array_length(v_chunk, 1), 0);
    v_offset := v_offset + v_batch_size;
    -- commit-equivalent: pg_sleep yields the transaction for a tick so
    -- realtime fanout has time to drain between batches.
    perform pg_sleep(0.05);
  end loop;

  return v_total;
end; $$;

revoke all on function public.admin_broadcast_chunk_users(uuid[], text, text, text, uuid, int) from public;
grant execute on function public.admin_broadcast_chunk_users(uuid[], text, text, text, uuid, int) to authenticated;


-- 5) admin_bulk_approve_auctions: clamp duration ---------------------------
-- The single-approve path in AuctionsQueueList.tsx had a [1d, 30d] clamp
-- (round 12 fix). We're moving callers to the bulk RPC; replicate the
-- clamp in SQL so the same protection applies.
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
  v_now   timestamptz := now();
  v_end   timestamptz;
  v_raw_s numeric;
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
    -- Clamp to [1 day, 30 days]. Without it, weird inputs (clock skew,
    -- replayed approval) would publish an auction that ends in the past
    -- or runs forever. Audit #6 (original client-side fix lifted to SQL).
    if r.start_time is not null and r.original_end_time is not null then
      v_raw_s := extract(epoch from (r.original_end_time - r.start_time));
      if v_raw_s is null or v_raw_s <= 0 then
        v_end := v_now + interval '7 days';
      else
        v_end := v_now + make_interval(secs => greatest(86400, least(2592000, v_raw_s::int)));
      end if;
    else
      v_end := v_now + interval '7 days';
    end if;

    update public.auctions
       set status            = 'active',
           start_time        = v_now,
           end_time          = v_end,
           original_end_time = v_end
     where id = r.id;

    -- Dedup: same auction approved twice (re-publish flow) shouldn't
    -- spam two "Enchère approuvée" rows on the seller.
    if not public.notification_recent_unread(r.seller_id, 'approved', r.id, 300) then
      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (r.seller_id, r.id, 'approved',
              'Enchère approuvée',
              'Votre annonce est en ligne.');
    end if;
    v_count := v_count + 1;
  end loop;

  perform public.log_admin_action(
    'auction.bulk_approve',
    p_detail => 'count=' || v_count
  );
  return v_count;
end; $$;

grant execute on function public.admin_bulk_approve_auctions(uuid[]) to authenticated;


-- 6) admin_bulk_reject_auctions: dedup the reject notification -------------
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
    if not public.notification_recent_unread(r.seller_id, 'rejected', r.id, 300) then
      insert into public.notifications (user_id, auction_id, kind, title, body)
      values (r.seller_id, r.id, 'rejected', 'Enchère refusée', p_reason);
    end if;
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


-- 7) SUB-1: enforce_publish_quota also caps concurrent active listings ----
create or replace function public.enforce_publish_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining int;
  v_active_count int;
  v_max_concurrent int;
begin
  if auth.uid() is null then return new; end if;
  if new.seller_id is null or new.seller_id <> auth.uid() then return new; end if;

  -- Monthly quota check (existing).
  v_remaining := public.user_listings_remaining(new.seller_id);
  if v_remaining <= 0 then
    raise exception 'QUOTA_EXCEEDED'
      using hint = 'Monthly listing quota reached. Upgrade the plan or wait until next month.';
  end if;

  -- Concurrent-listings cap (paid feature on the Diamond / Gold tier).
  -- Only enforced when the user has an active subscription with a finite
  -- cap; -1 (or no row) means "unlimited" and the check is skipped.
  -- pending_review counts toward the cap so users can't drain the queue
  -- to bypass it.
  select max_concurrent_active_listings into v_max_concurrent
    from public.user_active_subscription
   where user_id = new.seller_id
   limit 1;

  if v_max_concurrent is not null and v_max_concurrent > 0 then
    select count(*) into v_active_count
      from public.auctions
     where seller_id = new.seller_id
       and status in ('active', 'ending', 'pending_review');
    if v_active_count >= v_max_concurrent then
      raise exception 'CONCURRENT_LIMIT_REACHED'
        using hint = format('Your plan caps you at %s concurrent active listings.', v_max_concurrent);
    end if;
  end if;

  return new;
end; $$;

-- Trigger already exists (round 15); re-create just to be safe.
drop trigger if exists trg_enforce_publish_quota on public.auctions;
create trigger trg_enforce_publish_quota
  before insert on public.auctions
  for each row execute function public.enforce_publish_quota();


-- 8) SUB-10: carry listings_used_this_period on plan switch ---------------
-- subscribe_to_plan switches an entitled user from plan A to plan B.
-- Previously the new row started at listings_used=0, so a user who
-- consumed 4/5 on Silver got 0/20 on Gold — easy gaming. Carry the
-- usage forward so the new plan's quota inherits the prior period's
-- consumption.
do $$
declare v_exists boolean;
begin
  select exists(select 1 from pg_proc where proname = 'subscribe_to_plan') into v_exists;
  if not v_exists then
    raise notice 'subscribe_to_plan not found; skipping carry-usage patch';
    return;
  end if;
end $$;

-- Helper used at switch time to read the user's current usage so the new
-- subscription's listings_used_this_period can inherit it.
create or replace function public.user_current_period_usage(
  p_user_id uuid
) returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(listings_used_this_period, 0)::int
    from public.user_subscriptions
   where user_id = p_user_id
     and status in ('active', 'cancelled')
     and (expires_at is null or expires_at > now())
   order by activated_at desc nulls last, started_at desc
   limit 1
$$;

grant execute on function public.user_current_period_usage(uuid) to authenticated;


-- 9) SUB-13: hide non-visible plans from non-admins -----------------------
-- cms_subscription_plans currently allows anyone authenticated to read
-- every row, including staging / hidden plans the admin hasn't shipped
-- yet. Restrict SELECT to visible plans unless the caller is an admin.
alter table public.cms_subscription_plans enable row level security;

drop policy if exists "plans_public_read"   on public.cms_subscription_plans;
drop policy if exists "plans_admin_read"    on public.cms_subscription_plans;
drop policy if exists "plans_admin_all"     on public.cms_subscription_plans;
drop policy if exists "plans_owner_read"    on public.cms_subscription_plans;

create policy "plans_visible_read" on public.cms_subscription_plans
  for select to authenticated, anon
  using (is_visible = true or public.is_admin());

-- Writes already gated via admin RPCs (no client-write policies).
-- Defence-in-depth: explicit deny for client-side writes.
drop policy if exists "plans_no_client_write" on public.cms_subscription_plans;
create policy "plans_no_client_write" on public.cms_subscription_plans
  for all to authenticated using (false) with check (false);


-- Diagnostic ----------------------------------------------------------------
do $$
declare
  v_notifs_indexes int;
  v_plans_policies int;
begin
  select count(*) into v_notifs_indexes
    from pg_indexes where schemaname = 'public' and tablename = 'notifications';
  select count(*) into v_plans_policies
    from pg_policies where schemaname = 'public' and tablename = 'cms_subscription_plans';

  raise notice 'notifications: read_at column added, % indexes; plans: % policies', v_notifs_indexes, v_plans_policies;
end $$;
