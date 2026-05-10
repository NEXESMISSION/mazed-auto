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
