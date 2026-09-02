-- ============================================================================
-- PHASE 0 OF THE v3 PIVOT — no new auctions, ever again.
--
-- The platform stops being an auction house (see PIVOT-PLAN.md). Bidding is
-- being replaced by fixed-price annonces where the buyer calls the seller.
-- Before any of that is built, the first job is to stop the old model from
-- growing: a lot created today would still be running weeks into the
-- migration, holding cautions we no longer want to custody.
--
-- WHAT THIS DOES
--   * Rejects every INSERT into public.auctions from a real user.
--   * Leaves UPDATE alone, so the 50 live and 10 scheduled lots run to their
--     natural end and tick_auctions can still close them.
--
-- WHAT IT DOES NOT DO
--   * It does not drop anything. Deletion is Phase 6, after the data is
--     archived — see PIVOT-PLAN.md §7.
--   * service_role is exempt, matching the 0132 precedent: seed scripts, RPC
--     fixtures and admin tooling keep working. A seller can never hold that
--     key, so the product rule still holds for every real path.
--
-- Reversing it (if the pivot is ever called off): drop the trigger.
--   drop trigger _freeze_auction_creation on public.auctions;
-- ============================================================================

create or replace function public._freeze_auction_creation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role'
     or current_user = 'service_role' then
    return new;
  end if;

  raise exception 'auctions_closed'
    using errcode = 'P0001',
          hint = 'Mazed no longer creates auctions — publish an annonce instead.';
end;
$$;

drop trigger if exists _freeze_auction_creation on public.auctions;
create trigger _freeze_auction_creation
  before insert on public.auctions
  for each row execute function public._freeze_auction_creation();

notify pgrst, 'reload schema';
