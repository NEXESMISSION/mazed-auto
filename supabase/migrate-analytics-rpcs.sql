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
