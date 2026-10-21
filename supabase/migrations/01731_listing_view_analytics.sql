-- ============================================================================
-- 0173 — Listing analytics: who looked, how often, and what they did next.
--
-- `listings.view_count` has existed since 0154 and NOTHING has ever written to
-- it. Every annonce on the site reports zero views, and the admin has no way to
-- tell a listing nobody opened from one that fifty people opened and none of
-- them called. That is the difference between "lower the price" and "the photos
-- are bad", and today it cannot be seen.
--
-- WHAT A "VIEW" IS. One row per (listing, viewer), not one row per page load:
--
--   * unique viewers   = count(*)          — how many different people
--   * total views      = sum(view_count)   — including their return visits
--   * returning        = count(view_count > 1)
--
-- A viewer is a signed-in user where we have one, and a salted IP hash where we
-- do not — most buyers browse without an account, and the popup_views table
-- (0053), which this follows in shape, throws those away by requiring a user_id.
-- Here that would discard nearly all of the data.
--
-- A RETURN VISIT IS NOT A REFRESH. Reloading the page, or bouncing back from the
-- photos, must not read as fresh interest. A repeat only counts once the last
-- one is more than 30 minutes old, so `view_count` means "came back", which is
-- the number worth showing.
--
-- The seller's own visits are not counted at all. A seller refreshing their own
-- ad to see how it looks would otherwise be its best audience.
-- ============================================================================

-- ── The table ───────────────────────────────────────────────────────────────
create table if not exists public.listing_views (
  listing_id    uuid not null references public.listings(id) on delete cascade,
  -- 'u:<user uuid>' when signed in, 'a:<salted ip hash>' when not. Prefixed so
  -- the two spaces can never collide, and so a row's kind is readable.
  viewer_key    text not null,
  user_id       uuid references public.profiles(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  view_count    int not null default 1,
  primary key (listing_id, viewer_key)
);

create index if not exists listing_views_listing_idx
  on public.listing_views (listing_id, last_seen_at desc);
create index if not exists listing_views_recent_idx
  on public.listing_views (last_seen_at desc);
create index if not exists listing_views_user_idx
  on public.listing_views (user_id) where user_id is not null;

alter table public.listing_views enable row level security;

-- Admins read it; nobody else touches it. Writes go through the function below,
-- which runs as its owner.
drop policy if exists listing_views_admin_read on public.listing_views;
create policy listing_views_admin_read on public.listing_views
  for select to authenticated
  using (public.is_admin());

grant all on public.listing_views to service_role;

-- ── Recording a view ────────────────────────────────────────────────────────
create or replace function public.record_listing_view(
  p_listing    uuid,
  p_viewer_key text,
  p_user       uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now        timestamptz := now();
  v_seller     uuid;
  v_prev_seen  timestamptz;
  v_new_visit  boolean;
begin
  if p_listing is null or coalesce(p_viewer_key, '') = '' then
    return;
  end if;

  select seller_id into v_seller from public.listings where id = p_listing;
  if v_seller is null then
    return;                                   -- listing deleted mid-request
  end if;
  if p_user is not null and p_user = v_seller then
    return;                                   -- a seller is not their own audience
  end if;

  select last_seen_at into v_prev_seen
    from public.listing_views
   where listing_id = p_listing and viewer_key = p_viewer_key;

  -- New person, or the same person back after a real gap. A refresh two seconds
  -- later is the same visit and must not count twice.
  v_new_visit := v_prev_seen is null or v_prev_seen < v_now - interval '30 minutes';

  insert into public.listing_views as lv
         (listing_id, viewer_key, user_id, first_seen_at, last_seen_at, view_count)
  values (p_listing, p_viewer_key, p_user, v_now, v_now, 1)
  on conflict (listing_id, viewer_key) do update
     set last_seen_at = v_now,
         -- A viewer who signs in later stops being anonymous to us.
         user_id      = coalesce(lv.user_id, excluded.user_id),
         view_count   = lv.view_count + case when v_new_visit then 1 else 0 end;

  -- listings.view_count stays the running total, so every screen already
  -- reading it starts telling the truth instead of showing zero.
  if v_new_visit then
    update public.listings set view_count = view_count + 1 where id = p_listing;
  end if;
end;
$$;

revoke all on function public.record_listing_view(uuid, text, uuid) from public;
grant execute on function public.record_listing_view(uuid, text, uuid) to service_role;

-- ── One row of numbers per annonce ──────────────────────────────────────────
-- Views, favourites and contact reveals live in three tables. The admin wants
-- them on one line, so the join is written once here rather than in the page.
create or replace view public.listing_analytics as
select
  l.id                                as listing_id,
  coalesce(v.unique_viewers, 0)::int  as unique_viewers,
  coalesce(v.total_views, 0)::int     as total_views,
  coalesce(v.returning_viewers, 0)::int as returning_viewers,
  v.last_view_at,
  coalesce(f.favourites, 0)::int      as favourites,
  coalesce(r.reveals, 0)::int         as reveals,
  coalesce(r.unique_revealers, 0)::int as unique_revealers
from public.listings l
left join (
  select listing_id,
         count(*)                               as unique_viewers,
         sum(view_count)                        as total_views,
         count(*) filter (where view_count > 1) as returning_viewers,
         max(last_seen_at)                      as last_view_at
    from public.listing_views
   group by listing_id
) v on v.listing_id = l.id
left join (
  select listing_id, count(*) as favourites
    from public.watchlist
   where listing_id is not null
   group by listing_id
) f on f.listing_id = l.id
left join (
  select listing_id,
         count(*)                                          as reveals,
         count(distinct coalesce(user_id::text, ip_hash))  as unique_revealers
    from public.contact_reveals
   group by listing_id
) r on r.listing_id = l.id;

-- security_invoker so the view carries the caller's own permissions rather than
-- its owner's: it must never become a way to read these tables without rights.
alter view public.listing_analytics set (security_invoker = on);

grant select on public.listing_analytics to service_role;
