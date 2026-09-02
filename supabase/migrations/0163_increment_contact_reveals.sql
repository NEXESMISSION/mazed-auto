-- ============================================================================
-- The reveal counter, incremented atomically.
--
-- /api/annonces/[id]/contact tried to bump `listings.contact_reveal_count`
-- through an RPC that did not exist, with a read-modify-write fallback in the
-- rejection handler. supabase-js does not REJECT on a missing function — it
-- RESOLVES with { error } — so the fallback never ran and the counter sat at 0
-- while contact_reveals filled up correctly. Silent, and only visible by
-- checking the number against the log.
--
-- A function fixes both halves: one statement, no race, and a failure the
-- caller can actually see.
--
-- contact_reveals stays the source of truth; this is the cheap number rendered
-- on the listing ("X personnes l'ont demandé") and on the seller's dashboard.
-- ============================================================================

create or replace function public.increment_contact_reveals(p_listing uuid)
returns int
language sql
security definer
set search_path = public
as $$
  update public.listings
     set contact_reveal_count = contact_reveal_count + 1
   where id = p_listing
  returning contact_reveal_count;
$$;

revoke all on function public.increment_contact_reveals(uuid) from public, anon, authenticated;
grant execute on function public.increment_contact_reveals(uuid) to service_role;

-- Backfill what the broken path missed, so the number matches the log today.
update public.listings l
   set contact_reveal_count = r.n
  from (select listing_id, count(*) n from public.contact_reveals group by 1) r
 where r.listing_id = l.id and l.contact_reveal_count <> r.n;

notify pgrst, 'reload schema';
