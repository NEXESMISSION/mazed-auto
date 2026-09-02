-- ============================================================================
-- Favourites follow the catalog.
--
-- `watchlist` is keyed to auction_id, so a buyer cannot save an annonce — the
-- one thing there is to save now. The heart on a listing card had nowhere to
-- write.
--
-- Same shape as the diagnostics fix (0165): both columns nullable, exactly one
-- set. v2 rows keep watching their auction until Phase 6b; v3 rows point at a
-- listing. The composite primary key on (user_id, auction_id) is replaced by
-- partial unique indexes, one per subject, so "saved twice" is still
-- impossible either way.
-- ============================================================================

alter table public.watchlist
  add column if not exists listing_id uuid references public.listings(id) on delete cascade;

-- Drop the old PK: it required auction_id to be present.
do $$
declare v_pk text;
begin
  select conname into v_pk
    from pg_constraint
   where conrelid = 'public.watchlist'::regclass and contype = 'p';
  if v_pk is not null then
    execute format('alter table public.watchlist drop constraint %I', v_pk);
  end if;
end $$;

alter table public.watchlist alter column auction_id drop not null;

alter table public.watchlist
  add column if not exists id uuid primary key default gen_random_uuid();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'watchlist_one_subject') then
    alter table public.watchlist
      add constraint watchlist_one_subject
      check (num_nonnulls(auction_id, listing_id) = 1);
  end if;
end $$;

create unique index if not exists watchlist_user_auction_uniq
  on public.watchlist(user_id, auction_id) where auction_id is not null;
create unique index if not exists watchlist_user_listing_uniq
  on public.watchlist(user_id, listing_id) where listing_id is not null;
create index if not exists watchlist_listing_idx on public.watchlist(listing_id);

notify pgrst, 'reload schema';
