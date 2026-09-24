-- ============================================================================
-- The second half of 0181.
--
-- 0181 rewrote `listing_photos_read` to ask a SECURITY DEFINER function
-- instead of joining `listings`, and `anon` still could not read a photo.
--
-- Because `listing_photos_owner_write` is declared `FOR ALL`, and ALL includes
-- SELECT. Postgres evaluates every permissive policy that applies to the
-- command before OR-ing the results, so the owner policy's USING clause — which
-- reads `listings.seller_id` — is evaluated for an anonymous reader too, and
-- fails on the missing column grant before the read policy is ever consulted.
--
-- A policy that exists to authorise WRITES should not be evaluated on reads.
-- Splitting it into INSERT / UPDATE / DELETE removes it from the SELECT path
-- entirely, and the ownership test moves into a SECURITY DEFINER function for
-- the same reason as 0181: the caller must not need a grant on `seller_id` to
-- be told whether they own the row.
-- ============================================================================

create or replace function public.listing_photo_owned(p_listing uuid)
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
       and (l.seller_id = auth.uid() or public.is_admin())
  );
$$;

revoke all on function public.listing_photo_owned(uuid) from public;
grant execute on function public.listing_photo_owned(uuid) to authenticated;

comment on function public.listing_photo_owned(uuid) is
  'Whether the caller owns (or administers) a listing. SECURITY DEFINER so the write policies on listing_photos need no grant on listings.seller_id.';

drop policy if exists listing_photos_owner_write on public.listing_photos;

create policy listing_photos_owner_insert
  on public.listing_photos for insert to authenticated
  with check (public.listing_photo_owned(listing_id));

create policy listing_photos_owner_update
  on public.listing_photos for update to authenticated
  using (public.listing_photo_owned(listing_id))
  with check (public.listing_photo_owned(listing_id));

create policy listing_photos_owner_delete
  on public.listing_photos for delete to authenticated
  using (public.listing_photo_owned(listing_id));

notify pgrst, 'reload schema';
