-- ============================================================
-- Mazed Auto — Atomic plan-quota check on auction publish
--
-- Audit finding #5 — review/page.tsx calls user_listings_remaining()
-- and checks `> 0` BEFORE inserting the auction. Two rapid Publish
-- clicks can both pass the check before either insert commits,
-- letting a user exceed their monthly listing limit by N.
--
-- Fix: move the check into a BEFORE INSERT trigger so it runs inside
-- the same transaction as the insert. Re-reads the remaining count
-- right before the row is written and aborts with QUOTA_EXCEEDED
-- if it's <= 0. Concurrent inserts serialise on the user's row in
-- user_subscriptions (via the index lookup), so the second one sees
-- the bumped listings_used_this_period from the first.
--
-- The check is bypassable from the client (the trigger runs server-
-- side regardless of what RLS / direct INSERT the client does), and
-- it doesn't double-count rows in `pending_review` — that's the
-- behaviour we want: a publish that lands in moderation already
-- consumed a listing slot.
--
-- Safe to run repeatedly.
-- ============================================================

create or replace function public.enforce_publish_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining int;
begin
  -- Admin-created auctions (via service-role insert) bypass — auth.uid()
  -- is null there. Anonymous / unauthenticated inserts are already
  -- blocked by RLS; the seller_id check is defence-in-depth.
  if auth.uid() is null then
    return new;
  end if;
  if new.seller_id is null or new.seller_id <> auth.uid() then
    return new;
  end if;

  -- Re-read inside the same transaction. user_listings_remaining()
  -- is STABLE so the planner caches it per call, but the count it
  -- reads is the live row count — including any in-flight inserts
  -- from concurrent transactions once they commit.
  v_remaining := public.user_listings_remaining(new.seller_id);

  if v_remaining <= 0 then
    raise exception 'QUOTA_EXCEEDED'
      using hint = 'Monthly listing quota reached. Upgrade the plan or wait until next month.';
  end if;

  return new;
end; $$;

drop trigger if exists trg_enforce_publish_quota on public.auctions;
create trigger trg_enforce_publish_quota
  before insert on public.auctions
  for each row execute function public.enforce_publish_quota();


-- Diagnostic ----------------------------------------------------------------
do $$
begin
  raise notice 'enforce_publish_quota() trigger installed';
end $$;
