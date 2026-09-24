-- ============================================================================
-- Let a public client actually read listing photos.
--
-- THE BUG. `listing_photos_read` is written as
--
--     EXISTS (SELECT 1 FROM listings l
--              WHERE l.id = listing_photos.listing_id
--                AND (l.status = 'published' OR l.seller_id = auth.uid()
--                     OR is_admin()))
--
-- and an RLS policy is evaluated with the CALLER's privileges. The subquery
-- touches `l.seller_id`, and `anon` has no grant on that column — `listings`
-- is granted column by column precisely so `contact_phone`, `seller_id` and
-- the fee bookkeeping stay private. So Postgres refuses the policy itself and
-- the whole request fails:
--
--     42501  permission denied for table listings
--     hint:  GRANT SELECT ON public.listings TO anon
--
-- The result is that `anon` cannot read ONE row of `listing_photos`, ever.
-- Not a filtered result — a hard 401 on any query that touches the table,
-- including an embed like `listings(... , listing_photos(...))`.
--
-- WHY NOBODY NOTICED. Every surface that renders a photo today is a Next.js
-- Server Component holding the service-role key, which bypasses RLS and never
-- evaluates this policy. The first client to authenticate as `anon` — the
-- native app — hits it on its very first screen, and it presents as "no
-- photos" or, because the embed fails the whole select, as an empty catalogue.
--
-- WHAT NOT TO DO. `GRANT SELECT ON public.listings TO anon` would satisfy the
-- hint and undo the column grants in one line, handing every seller's phone
-- number to anyone with the anon key. The hint is Postgres describing the
-- mechanism, not advice.
--
-- THE FIX. Move the decision into a SECURITY DEFINER function. It runs as its
-- owner, so evaluating it needs no grant on `listings` from the caller, and it
-- returns a boolean — it cannot be used to read a column it did not intend to
-- expose. The policy then asks a question instead of running a join.
-- ============================================================================

create or replace function public.listing_photo_visible(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.listings l
     where l.id = p_listing
       and (
         l.status = 'published'::listing_status
         or l.seller_id = auth.uid()
         or public.is_admin()
       )
  );
$$;

revoke all on function public.listing_photo_visible(uuid) from public;
grant execute on function public.listing_photo_visible(uuid) to anon, authenticated;

comment on function public.listing_photo_visible(uuid) is
  'Whether the caller may see a listing''s photos. SECURITY DEFINER so the RLS policy on listing_photos does not require the caller to hold SELECT on listings.seller_id — anon deliberately does not.';

drop policy if exists listing_photos_read on public.listing_photos;

create policy listing_photos_read
  on public.listing_photos
  for select
  using (public.listing_photo_visible(listing_id));

notify pgrst, 'reload schema';
