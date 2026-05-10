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
