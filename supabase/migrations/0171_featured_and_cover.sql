-- ============================================================================
-- Who is on the home page, and which photo represents an annonce.
--
-- Today neither is a decision anyone makes:
--
--   • "À LA UNE" is `order by published_at desc limit 12`. It means "posted
--     most recently", nothing more. The admin curation that exists
--     (/admin/home, promo_home_featured) writes to `properties` — the
--     auction-era table — so it cannot touch a single listing.
--   • The card image is `photos[sort_order][0]`, the seller's first upload.
--     On the imported catalogue that is usually the dashboard shot, which is
--     why a brake-pad advert shows an odometer.
--
-- Two columns fix both, and both are admin-settable:
--
--   listings.featured_rank   -- null = not featured; lower sorts first
--   listings.featured_until  -- when the placement lapses on its own
--   listing_photos.is_cover  -- the one photo that represents the annonce
--
-- A partial unique index keeps "one cover per listing" true in the database
-- rather than in whichever code path happens to write it.
-- ============================================================================

alter table public.listings
  add column if not exists featured_rank  integer,
  add column if not exists featured_until timestamptz;

-- Featured listings are read on every home render: index the sort.
create index if not exists listings_featured_idx
  on public.listings (featured_rank, featured_until)
  where featured_rank is not null;

alter table public.listing_photos
  add column if not exists is_cover boolean not null default false;

-- At most one cover per listing.
drop index if exists listing_photos_one_cover;
create unique index listing_photos_one_cover
  on public.listing_photos (listing_id)
  where is_cover;

/**
 * Choosing a cover is "this one, and no other" — two writes that must not be
 * separable, or a listing ends up with none (or two, which the index refuses).
 * Admin-only: featuring and cover art are editorial decisions.
 */
create or replace function public.admin_set_listing_cover(
  p_listing uuid,
  p_photo   uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  update public.listing_photos set is_cover = false
   where listing_id = p_listing and is_cover;
  update public.listing_photos set is_cover = true
   where id = p_photo and listing_id = p_listing;
  if not found then
    raise exception 'photo_not_in_listing' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_set_listing_cover(uuid, uuid) from public;
grant execute on function public.admin_set_listing_cover(uuid, uuid) to authenticated, service_role;

-- How the home page is composed, so the shape of it is an admin setting and
-- not a number buried in a component. Read by the home query; safe defaults
-- if the row is missing.
insert into public.app_settings (key, value)
values ('home_layout', '{"hero_slots": 1, "side_slots": 3, "fallback": "recent"}'::jsonb)
on conflict (key) do nothing;

-- Public read: the home page is rendered for signed-out visitors, so the
-- layout numbers must be readable without a session. They are not secret.
drop policy if exists app_settings_home_layout_read on public.app_settings;
create policy app_settings_home_layout_read on public.app_settings
  for select using (key = 'home_layout');

notify pgrst, 'reload schema';
