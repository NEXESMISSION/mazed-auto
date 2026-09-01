-- ============================================================================
-- ONE AUCTION FORMAT — the platform runs ascending ("English") auctions only.
--
-- 0130 introduced admin-gated formats (Dutch / Sealed off by default) and 0132
-- narrowed the guard to real sellers. The product has since dropped the idea of
-- multiple formats entirely: the schedule form has no format picker, no screen
-- names a format, and the admin settings page no longer carries the toggles.
--
-- This migration makes the database agree with that:
--   1) _guard_auction_type_enabled rejects anything but 'english' for a real
--      seller. The app_settings('auction_types') lookup is gone — there is no
--      setting left to consult, so an orphaned row can never re-open a format.
--   2) The now-unused 'auction_types' settings row is deleted.
--
-- NOT changed on purpose:
--   • The auction_type ENUM keeps its legacy 'sealed' / 'dutch' labels. Dropping
--     an enum value is a rewrite of every dependent function signature for zero
--     product benefit, and no row uses them (verified: 668 english, 0 others).
--   • The service-role bypass from 0132 stays, so RPC fixtures and seed scripts
--     keep working. A seller can never obtain that key.
--
-- Idempotent (create or replace + delete ... where).
-- ============================================================================

create or replace function public._guard_auction_type_enabled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only gate real sellers (authenticated via PostgREST). Admin/service-role,
  -- seeders, migrations and SECURITY DEFINER callers pass freely — same
  -- posture as 0132.
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  -- System relists (tick_auctions re-inserting an unsold lot) carry a format
  -- that was already valid when it was first created.
  if new.relisted_from_id is not null then
    return new;
  end if;
  if new.type = 'english' then
    return new;
  end if;
  raise exception 'auction_type_disabled' using errcode = '23514';
end;
$$;

-- The trigger created in 0130 still points at this function; nothing to re-wire.

delete from public.app_settings where key = 'auction_types';

notify pgrst, 'reload schema';
