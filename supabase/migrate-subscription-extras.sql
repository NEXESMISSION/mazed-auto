-- ============================================================
-- Mazed Auto — Subscription extras
--
-- - admin_list_subscriptions()  → joined list for /admin/subscriptions
-- - cancel_my_subscription()    → user self-serve cancel
-- - admin_list_subscription_history(user_id) → past + current rows
--
-- Depends on: migrate-cms-plans.sql, migrate-admin-foundations.sql
-- Safe to run repeatedly.
-- ============================================================

-- 1) Admin overview list. Includes cancelled / expired rows when
--    p_include_inactive is true so the admin can audit churn.

create or replace function public.admin_list_subscriptions(
  p_plan_slug         text default null,
  p_include_inactive  boolean default false,
  p_search            text default null,
  p_limit             int default 200
) returns table (
  subscription_id            uuid,
  user_id                    uuid,
  user_label                 text,
  user_email                 text,
  plan_slug                  text,
  plan_name                  text,
  monthly_price              numeric,
  listings_per_month         int,
  listings_used_this_period  int,
  status                     text,
  started_at                 timestamptz,
  current_period_end         timestamptz,
  expires_at                 timestamptz,
  payment_provider           text
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
    us.id,
    us.user_id,
    coalesce(
      (select btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                    coalesce(u.raw_user_meta_data->>'lastName',''))
         from auth.users u where u.id = us.user_id),
      ''
    )::text  as user_label,
    coalesce(
      (select u.email::text from auth.users u where u.id = us.user_id),
      ''
    )::text  as user_email,
    us.plan_slug,
    p.name_fr,
    p.monthly_price,
    p.listings_per_month,
    us.listings_used_this_period,
    us.status,
    us.started_at,
    us.current_period_end,
    us.expires_at,
    us.payment_provider
  from public.user_subscriptions us
  join public.cms_subscription_plans p on p.slug = us.plan_slug
  where (p_plan_slug is null or us.plan_slug = p_plan_slug)
    and (p_include_inactive or us.status in ('active','cancelled'))
    and (
      p_search is null
      or coalesce(
           (select u.email::text from auth.users u where u.id = us.user_id),
           ''
         ) ilike '%' || p_search || '%'
      or coalesce(
           (select btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                         coalesce(u.raw_user_meta_data->>'lastName',''))
              from auth.users u where u.id = us.user_id),
           ''
         ) ilike '%' || p_search || '%'
    )
  order by
    case us.status when 'active' then 0 when 'cancelled' then 1 when 'past_due' then 2 else 3 end,
    us.started_at desc
  limit greatest(0, p_limit);
end; $$;

-- Drop the old 3-arg signature so callers don't accidentally hit a stale
-- overload that lacks the search parameter.
drop function if exists public.admin_list_subscriptions(text, boolean, int);
grant execute on function public.admin_list_subscriptions(text, boolean, text, int) to authenticated;

-- 2) Self-serve cancel for the signed-in user. We don't refund
--    the period — the user keeps the perks until current_period_end.

-- Replace v1's subscribe_to_plan with a version that handles
-- re-subscribe-after-cancel cleanly. Three branches:
--   1) User already has an entitled (active OR cancelled-but-period-active)
--      sub on the same plan → un-cancel it and extend expires_at by 30 days
--      from max(now, expires_at). Preserves any leftover time.
--   2) User has any other entitled sub on a different plan → expire it
--      immediately so the user never has two entitlements at once.
--   3) Otherwise → insert a new active row.

create or replace function public.subscribe_to_plan(
  p_plan_slug text,
  p_payment_provider_ref text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_plan record;
  v_existing record;
  v_sub_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_plan from public.cms_subscription_plans
    where slug = p_plan_slug and is_visible = true;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;

  -- Look for any sub on this same plan that's still entitled (active or
  -- cancelled-but-not-yet-expired).
  select id, status, current_period_end, expires_at
    into v_existing
    from public.user_subscriptions
   where user_id = v_user
     and plan_slug = p_plan_slug
     and status in ('active','cancelled')
     and (expires_at is null or expires_at > now())
   order by started_at desc limit 1;

  if found then
    -- Branch 1: re-activate / extend the same plan.
    update public.user_subscriptions
       set status             = 'active',
           current_period_end = greatest(coalesce(current_period_end, now()), now()) + interval '30 days',
           expires_at         = greatest(coalesce(expires_at, now()), now()) + interval '30 days',
           payment_provider_ref = coalesce(p_payment_provider_ref, payment_provider_ref),
           updated_at         = now()
     where id = v_existing.id
     returning id into v_sub_id;
  else
    -- Branch 2: expire any other entitled subscription so the user
    -- never has two plans active at once.
    update public.user_subscriptions
       set status     = 'expired',
           expires_at = now(),
           updated_at = now()
     where user_id = v_user
       and status in ('active','cancelled')
       and (expires_at is null or expires_at > now());

    -- Branch 3: insert a fresh active row.
    insert into public.user_subscriptions (
      user_id, plan_slug, status, started_at,
      current_period_start, current_period_end, expires_at,
      payment_provider, payment_provider_ref, created_by
    ) values (
      v_user, p_plan_slug, 'active', now(),
      now(), now() + interval '30 days', now() + interval '30 days',
      'simulation', p_payment_provider_ref, v_user
    ) returning id into v_sub_id;
  end if;

  -- Reflect on the seller profile (back-compat with is_pro flag).
  update public.sellers set is_pro = true where id = v_user;

  -- Ledger row so the subscription appears in /transactions.
  insert into public.transactions (ref, user_id, auction_id, type, direction, amount, label, status)
  values (
    'TX-SUB-' || substring(gen_random_uuid()::text from 1 for 8),
    v_user, null, 'commission', 'in', v_plan.monthly_price,
    'Abonnement ' || v_plan.name_fr || ' (30 jours)',
    'completed'
  );

  return v_sub_id;
end; $$;

grant execute on function public.subscribe_to_plan(text, text) to authenticated;

create or replace function public.cancel_my_subscription()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_sub_id uuid;
  v_plan_name text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select us.id, p.name_fr
    into v_sub_id, v_plan_name
    from public.user_subscriptions us
    join public.cms_subscription_plans p on p.slug = us.plan_slug
   where us.user_id = v_user and us.status = 'active'
   order by us.started_at desc limit 1;

  if v_sub_id is null then return; end if;

  update public.user_subscriptions
     set status = 'cancelled',
         expires_at = least(coalesce(expires_at, current_period_end), current_period_end),
         updated_at = now()
   where id = v_sub_id;

  insert into public.notifications (user_id, kind, title, body)
  values (v_user, 'system',
    'Abonnement annulé',
    'Votre plan ' || v_plan_name ||
    ' a été annulé. Vous conservez les avantages jusqu''à la fin de la période en cours.');
end; $$;

grant execute on function public.cancel_my_subscription() to authenticated;

-- 3) Per-user subscription history (used on /profile/subscription).
create or replace function public.user_subscription_history(p_user_id uuid default null)
returns table (
  subscription_id           uuid,
  plan_slug                 text,
  plan_name                 text,
  monthly_price             numeric,
  status                    text,
  started_at                timestamptz,
  current_period_end        timestamptz,
  expires_at                timestamptz,
  payment_provider          text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
begin
  if v_user is null then return; end if;
  -- Non-admins can only read their own history.
  if v_user <> auth.uid() and not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select
    us.id,
    us.plan_slug,
    p.name_fr,
    p.monthly_price,
    us.status,
    us.started_at,
    us.current_period_end,
    us.expires_at,
    us.payment_provider
  from public.user_subscriptions us
  join public.cms_subscription_plans p on p.slug = us.plan_slug
  where us.user_id = v_user
  order by us.started_at desc;
end; $$;

grant execute on function public.user_subscription_history(uuid) to authenticated;

-- 4) Aggregate stats for /admin/subscriptions header.
create or replace function public.admin_subscription_stats()
returns table (
  active_count             bigint,
  mrr                      numeric,
  expiring_within_7_days   bigint,
  cancelled_last_30_days   bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.view') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select
    (select count(*) from public.user_subscriptions where status = 'active'),
    (select coalesce(sum(p.monthly_price), 0)
       from public.user_subscriptions us
       join public.cms_subscription_plans p on p.slug = us.plan_slug
      where us.status = 'active'),
    (select count(*) from public.user_subscriptions
      where status = 'active'
        and expires_at is not null
        and expires_at <= now() + interval '7 days'),
    (select count(*) from public.user_subscriptions
      where status = 'cancelled'
        and updated_at >= now() - interval '30 days');
end; $$;

grant execute on function public.admin_subscription_stats() to authenticated;
