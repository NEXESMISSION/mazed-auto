-- ============================================================
-- Mazed Auto — Subscription plans (Silver / Gold / Diamond)
--
-- Implements the Pro/Business tiers from the project workflows
-- (mazed_auto_workflows.html §15). Personal users browse + sell
-- with a small free quota; agencies/dealerships pay monthly to
-- unlock more listings + showroom + analytics + API.
--
-- Schema:
--   cms_subscription_plans  — admin-managed catalogue (price, quotas, perks)
--   user_subscriptions      — one active row per user_id, per period
--
-- Depends on: migrate-admin-foundations.sql, migrate-cms.sql
-- Safe to run repeatedly.
-- ============================================================

-- 1) cms_subscription_plans ------------------------------------
create table if not exists public.cms_subscription_plans (
  slug                  text primary key,             -- 'silver' | 'gold' | 'diamond' | 'custom'
  name_ar               text,
  name_fr               text not null,
  tagline_ar            text,
  tagline_fr            text,
  monthly_price         numeric not null,             -- DT
  listings_per_month    int not null,                 -- -1 = unlimited
  search_priority_pct   int not null default 0,       -- 0, 10, 25
  has_custom_showroom   boolean not null default false,
  has_branded_showroom  boolean not null default false,
  has_advanced_analytics boolean not null default false,
  has_analytics_export  boolean not null default false,
  -- has_api_access lived here in the original v1; v2 drops it. The
  -- column is intentionally NOT declared anymore so that re-running
  -- the bundle never re-creates the dropped column.
  support_level         text not null default 'email' check (support_level in ('email','chat','dedicated')),
  features              jsonb not null default '[]'::jsonb,  -- bullet list shown on /pricing
  badge_tone            text not null default 'silver' check (badge_tone in ('silver','gold','diamond','custom')),
  is_visible            boolean not null default true,
  position              int not null default 0,
  updated_by            uuid references auth.users(id) on delete set null,
  updated_at            timestamptz not null default now()
);

alter table public.cms_subscription_plans enable row level security;
drop policy if exists "cms_plans_public_read" on public.cms_subscription_plans;
create policy "cms_plans_public_read" on public.cms_subscription_plans
  for select using (true);

insert into public.cms_subscription_plans (
  slug, name_fr, name_ar, tagline_fr, tagline_ar,
  monthly_price, listings_per_month, search_priority_pct,
  has_custom_showroom, has_branded_showroom,
  has_advanced_analytics, has_analytics_export,
  support_level, features, badge_tone, position
) values
  ('silver',  'Silver',  'فضي',  'Pour démarrer',           'للبدء',           29,  5,  0,
   false, false, false, false,
   'email',
   '["5 mises en ligne / mois","Page boutique standard","Analytiques de base","Support par email"]'::jsonb,
   'silver', 10),

  ('gold',    'Gold',    'ذهبي', 'Le meilleur rapport',     'الأفضل قيمةً',    89,  25, 10,
   true,  false, true,  false,
   'chat',
   '["25 mises en ligne / mois","Page boutique personnalisée","Analytiques avancées","Priorité de recherche +10%","Support email + chat"]'::jsonb,
   'gold',   20),

  ('diamond', 'Diamond', 'ماسي', 'Pour les acteurs majeurs','للوكالات الكبرى', 249, -1, 25,
   true,  true,  true,  true,
   'dedicated',
   '["Mises en ligne illimitées","Page boutique brandée","Analytiques avancées + export","Priorité de recherche +25%","Chargé de compte dédié"]'::jsonb,
   'diamond', 30)
on conflict (slug) do nothing;

-- 2) user_subscriptions ---------------------------------------
create table if not exists public.user_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  plan_slug                text not null references public.cms_subscription_plans(slug),
  status                   text not null default 'active'
                           check (status in ('active','past_due','cancelled','expired')),
  started_at               timestamptz not null default now(),
  expires_at               timestamptz,                     -- null = no end (unusual, admin-granted)
  current_period_start     timestamptz not null default now(),
  current_period_end       timestamptz not null default (now() + interval '30 days'),
  listings_used_this_period int not null default 0,
  payment_provider         text,                            -- 'simulation' | 'konnect' | 'clictopay' | 'admin_grant'
  payment_provider_ref     text,
  created_by               uuid references auth.users(id) on delete set null,  -- self or admin
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists user_subscriptions_user_active_idx
  on public.user_subscriptions (user_id) where status = 'active';
create index if not exists user_subscriptions_expires_idx
  on public.user_subscriptions (expires_at) where status = 'active';

alter table public.user_subscriptions enable row level security;

drop policy if exists "user_subscriptions_self_read" on public.user_subscriptions;
create policy "user_subscriptions_self_read" on public.user_subscriptions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- INSERT/UPDATE go through RPCs; no direct policy.

-- 3) Helper view: current active subscription per user --------
-- v2 recreates this view with more columns. Keep the v1 definition
-- minimal (no has_api_access) so re-running the bundle never tries
-- to add a column the v2 file already removed.
drop view if exists public.user_active_subscription;
create view public.user_active_subscription as
select distinct on (us.user_id)
  us.user_id,
  us.id          as subscription_id,
  us.plan_slug,
  p.name_fr      as plan_name,
  p.listings_per_month,
  p.search_priority_pct,
  p.has_branded_showroom,
  us.status,
  us.current_period_start,
  us.current_period_end,
  us.listings_used_this_period,
  case
    when p.listings_per_month = -1 then 999999
    else greatest(0, p.listings_per_month - us.listings_used_this_period)
  end as listings_remaining,
  us.expires_at
from public.user_subscriptions us
join public.cms_subscription_plans p on p.slug = us.plan_slug
where us.status = 'active'
  and (us.expires_at is null or us.expires_at > now())
order by us.user_id, us.started_at desc;

grant select on public.user_active_subscription to authenticated;

-- 4) RPC: subscribe (self-serve via simulation provider) ------
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
  v_sub_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_plan from public.cms_subscription_plans
    where slug = p_plan_slug and is_visible = true;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;

  -- Cancel any other active subscription before activating a new one.
  update public.user_subscriptions
     set status = 'cancelled', updated_at = now()
   where user_id = v_user and status = 'active' and plan_slug <> p_plan_slug;

  -- Upgrade in-place if already on this plan: extend by 30 days.
  if exists (
    select 1 from public.user_subscriptions
    where user_id = v_user and plan_slug = p_plan_slug and status = 'active'
  ) then
    update public.user_subscriptions
       set current_period_end = greatest(current_period_end, now()) + interval '30 days',
           expires_at         = greatest(coalesce(expires_at, now()), now()) + interval '30 days',
           updated_at         = now()
     where user_id = v_user and plan_slug = p_plan_slug and status = 'active'
     returning id into v_sub_id;
  else
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

  -- Reflect on the seller profile (back-compat with is_pro flag + UI badges).
  update public.sellers set is_pro = true where id = v_user;

  -- Ledger row so the subscription appears in /transactions and /admin/payouts.
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

-- 5) RPC: admin grants a subscription -------------------------
create or replace function public.admin_set_user_subscription(
  p_user_id    uuid,
  p_plan_slug  text,
  p_days       int,
  p_reason     text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_id uuid;
  v_plan_exists boolean;
begin
  if not public.has_admin_capability('user.warn') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_days is null or p_days <= 0 then
    raise exception 'DAYS_REQUIRED';
  end if;

  select exists(select 1 from public.cms_subscription_plans where slug = p_plan_slug)
    into v_plan_exists;
  if not v_plan_exists then raise exception 'PLAN_NOT_FOUND'; end if;

  -- Cancel existing active subs for this user.
  update public.user_subscriptions
     set status = 'cancelled', updated_at = now()
   where user_id = p_user_id and status = 'active';

  insert into public.user_subscriptions (
    user_id, plan_slug, status, started_at,
    current_period_start, current_period_end, expires_at,
    payment_provider, created_by
  ) values (
    p_user_id, p_plan_slug, 'active', now(),
    now(), now() + make_interval(days => p_days), now() + make_interval(days => p_days),
    'admin_grant', auth.uid()
  ) returning id into v_sub_id;

  update public.sellers set is_pro = true where id = p_user_id;

  perform public.log_admin_action(
    'user.warn',
    p_target_user_id => p_user_id,
    p_target_id      => v_sub_id,
    p_target_type    => 'user_subscription',
    p_detail         => 'set_subscription plan=' || p_plan_slug || ' days=' || p_days::text || ': ' || p_reason
  );

  return v_sub_id;
end; $$;

grant execute on function public.admin_set_user_subscription(uuid, text, int, text) to authenticated;

-- 6) RPC: admin revokes a subscription ------------------------
create or replace function public.admin_cancel_user_subscription(
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

  update public.user_subscriptions
     set status = 'cancelled', updated_at = now()
   where user_id = p_user_id and status = 'active';

  update public.sellers set is_pro = false where id = p_user_id;

  perform public.log_admin_action(
    'user.warn',
    p_target_user_id => p_user_id,
    p_target_type    => 'user_subscription',
    p_detail         => 'cancel_subscription: ' || p_reason
  );
end; $$;

grant execute on function public.admin_cancel_user_subscription(uuid, text) to authenticated;

-- 7) RPC used by seller wizard: can the user create a new auction? ----
-- Returns the number of listings remaining in the current billing period.
-- For users with no active subscription, returns the free quota
-- (`listing.free_per_month` platform setting, default 1).

create or replace function public.user_listings_remaining(p_user_id uuid default null)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_remaining int;
  v_free_quota int;
  v_used_this_month int;
begin
  if v_user is null then return 0; end if;

  -- Active subscription path
  select case
           when listings_per_month = -1 then 999999
           else greatest(0, listings_per_month - listings_used_this_period)
         end
    into v_remaining
    from public.user_active_subscription
   where user_id = v_user
   limit 1;

  if v_remaining is not null then return v_remaining; end if;

  -- No active subscription: free quota applies.
  v_free_quota := public.get_setting_num('listing.free_per_month', 1)::int;

  select count(*)::int into v_used_this_month
    from public.auctions
   where seller_id = v_user
     and created_at >= date_trunc('month', now());

  return greatest(0, v_free_quota - v_used_this_month);
end; $$;

grant execute on function public.user_listings_remaining(uuid) to authenticated;

-- 8) Listing counter: trigger to bump `listings_used_this_period` on insert
-- The auction publish step also calls user_listings_remaining() defensively
-- so a stale row never lets someone exceed their cap.

create or replace function public.bump_subscription_listing_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.seller_id is null then return new; end if;
  update public.user_subscriptions
     set listings_used_this_period = listings_used_this_period + 1,
         updated_at = now()
   where user_id = new.seller_id
     and status = 'active'
     and current_period_start <= now()
     and current_period_end   >  now();
  return new;
end; $$;

drop trigger if exists trg_bump_subscription_listings on public.auctions;
create trigger trg_bump_subscription_listings
after insert on public.auctions
for each row execute function public.bump_subscription_listing_counter();

-- 9) Period rollover --------------------------------------------
-- Reset the counter and shift the period when current_period_end passes.
-- Called lazily from listing checks, no cron required.

create or replace function public.roll_subscription_periods()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_subscriptions
     set current_period_start = current_period_end,
         current_period_end   = current_period_end + interval '30 days',
         listings_used_this_period = 0,
         updated_at = now()
   where status = 'active'
     and current_period_end <= now()
     and (expires_at is null or expires_at > now());

  -- Mark expired subscriptions.
  update public.user_subscriptions
     set status = 'expired', updated_at = now()
   where status = 'active'
     and expires_at is not null
     and expires_at <= now();
end; $$;

grant execute on function public.roll_subscription_periods() to authenticated;
