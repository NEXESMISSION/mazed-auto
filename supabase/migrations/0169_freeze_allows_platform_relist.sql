-- ============================================================================
-- The auction freeze was also stopping auctions from ENDING.
--
-- 0152 froze auction CREATION for the v3 pivot, and said so explicitly:
-- "Leaves UPDATE alone, so the 50 live and 10 scheduled lots run to their
-- natural end and tick_auctions can still close them." The trigger is indeed
-- `before insert` only — but `tick_auctions` does not only update. When a lot
-- ends unsold it INSERTS a relist (0071), and that insert hits the freeze,
-- raises `auctions_closed`, and takes the whole tick transaction down with it.
--
-- The tick is one transaction for every lot, so a single unsold relist stops
-- ALL closings. Measured on the live database: `select tick_auctions_cron()`
-- → `auctions_closed` raised from _freeze_auction_creation, and 15 auctions
-- sitting past their ends_at, the oldest by two days. Those lots never close,
-- no winner is recorded, and every caution on them stays locked.
--
-- The exemption in 0152 cannot fire either. It tests
-- `current_setting('request.jwt.claim.role') = 'service_role' or current_user
-- = 'service_role'`, but the insert happens inside tick_auctions, which is
-- SECURITY DEFINER: `current_user` there is the function owner, never the
-- caller. So even the cron path — service-role key, via PostgREST — is refused.
--
-- The discriminator that actually separates "a person creating an auction"
-- from "the platform maintaining one" is auth.uid(): a real session always
-- carries a sub claim, and the cron/service context never does. Adding that
-- keeps the product rule exactly as strict for every human path — a seller
-- still cannot create an auction — while letting the engine finish the lots
-- that are already running.
-- ============================================================================

create or replace function public._freeze_auction_creation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Platform maintenance: cron, service-role tooling, migrations. No end user
  -- reaches this branch — every authenticated request carries auth.uid().
  if auth.uid() is null then
    return new;
  end if;

  if current_setting('request.jwt.claim.role', true) = 'service_role'
     or current_user = 'service_role' then
    return new;
  end if;

  raise exception 'auctions_closed'
    using errcode = 'P0001',
          hint = 'Mazed no longer creates auctions — publish an annonce instead.';
end;
$$;

notify pgrst, 'reload schema';
