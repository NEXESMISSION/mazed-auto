-- ============================================================================
-- Reveal a seller's phone to a buyer who asked for it — without granting the
-- column.
--
-- `listings.contact_phone` is REVOKED at column level for `anon`, which is
-- right: the catalogue select would otherwise ship every seller's number to
-- anyone who scrolls, and that is how a classifieds site's sellers end up on a
-- spam list. A buyer who taps « Afficher le numéro » still has to get it.
--
-- The web app solved this with a Next route holding the service-role key. The
-- native app cannot: it has no server of its own, and the route is same-origin
-- only. A SECURITY DEFINER function is the version that works for both — the
-- column stays revoked, the disclosure happens on an explicit call, and both
-- clients go through the same door.
--
-- WHAT IT WILL NOT DO. It refuses anything that is not `published`. A draft, a
-- listing awaiting payment or a rejected one has a phone on it too, and
-- without that guard this function would hand out the numbers of sellers whose
-- annonce is not even live — a strictly worse leak than the one the column
-- grant was protecting against, and reachable by anyone who can guess a uuid.
--
-- The reveal is counted on the way through. `contact_reveal_count` already
-- feeds the home ranking, so the signal has to keep meaning "a buyer wanted
-- this number", whichever client asked.
-- ============================================================================

create or replace function public.reveal_listing_contact(p_listing uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_phone text;
begin
  select contact_name, contact_phone
    into v_name, v_phone
    from public.listings
   where id = p_listing
     and status = 'published';

  if not found then
    -- The same answer for "no such listing" and "not published", so the
    -- function cannot be used to discover which drafts exist.
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  -- Best effort: a counter that fails must never cost the buyer the number
  -- they asked for.
  begin
    update public.listings
       set contact_reveal_count = coalesce(contact_reveal_count, 0) + 1
     where id = p_listing;
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true, 'name', v_name, 'phone', v_phone);
end;
$$;

revoke all on function public.reveal_listing_contact(uuid) from public;
grant execute on function public.reveal_listing_contact(uuid) to anon, authenticated;

comment on function public.reveal_listing_contact(uuid) is
  'Returns a PUBLISHED listing''s contact name and phone and counts the reveal. Exists because contact_phone is revoked at column level for anon; this is the only sanctioned way for a client to obtain it.';

notify pgrst, 'reload schema';
