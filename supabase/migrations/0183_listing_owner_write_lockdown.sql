-- ============================================================================
-- A seller may write the CONTENT of their own unpublished annonce. Nothing else.
--
-- WHAT WAS OPEN. `authenticated` held INSERT and UPDATE on every column of
-- `listings`, and `listings_owner_update` only asked `seller_id = auth.uid()`.
-- The single trigger guard, `_listings_guard_publish`, refuses the jump to
-- 'published' and nothing more. So with the public anon key and their own JWT,
-- straight through the REST API and around every route, a seller could:
--
--   * send a draft to 'pending_review' without paying for it;
--   * push `expires_at` on a published annonce years out — renewal for free;
--   * set `featured_rank` / `boost` on it and pin it to the home cover;
--   * stamp `fee_waived_reason`, `seller_credit_id`, `view_count`,
--     `contact_reveal_count` (which feeds the home ranking) — anything;
--   * edit the title, text and photos of an annonce AFTER moderation approved
--     it, since the update policy did not look at the status at all.
--
-- None of it needed the web app. The routes were careful; the table was not.
--
-- WHAT IS CLOSED.
--
--   1. Column grants. INSERT and UPDATE are revoked from anon and
--      authenticated, then granted back to authenticated on the content
--      columns only. Status, dates, money, ranking, moderation and counters are
--      written by the service role (the routes) and by SECURITY DEFINER
--      functions, never by the seller's own token.
--
--   2. Status-aware row policies. An owner may insert a draft, and update or
--      re-photograph an annonce only while it is 'draft', 'rejected' or
--      'pending_payment' — the same three states the web route already
--      allowed. Once it is in review or live, the seller's edits go through a
--      route or not at all.
--
--   3. Fitments get the photo treatment from 0181/0182: the old FOR ALL write
--      policy touched `l.seller_id`, which `anon` cannot read, so it also made
--      every anonymous read of `listing_fitments` fail with 42501. Reads go
--      through `listing_photo_visible()`; writes through a definer helper.
--
--   4. A banned account cannot put an annonce in front of buyers. `banned_at`
--      was only ever checked by the v2 bid/deposit triggers; a banned seller
--      could still submit, pay for and renew annonces. The trigger blocks the
--      transition into any submission state, for the service role too —
--      because the routes ARE the service role acting for the seller.
--
--   5. `_listings_guard_publish` (0154/0161) never fired. It is SECURITY
--      DEFINER, and its exemption list tested `current_user = 'postgres'` —
--      but inside a definer function `current_user` IS the owner, postgres,
--      for every caller. Combined with (1) and (2) above, a seller's own token
--      could set `status = 'published'` (plus `published_at`, `expires_at`,
--      `contact_phone`, an attestation version and `featured_rank`) and go
--      live on the home cover with no payment and no moderation. Reproduced
--      on a local stack with the pre-0183 grants before writing this. The
--      guard now reads the caller from the `role` setting, which PostgREST
--      sets per request and a definer function does not change.
--
-- What it does NOT change: reads, the web app's own write paths (all
-- service-role), existing rows, existing statuses. A client that INSERTs a
-- draft without naming `status` and edits its content keeps working. A client
-- that names `status`, or any other closed column, now gets 42501 — which is
-- the point.
-- ============================================================================

-- 1 · Column grants ---------------------------------------------------------

-- Drop every column-level INSERT/UPDATE grant first (a table-level REVOKE does
-- not remove column-level ones), then the table-level ones.
do $$
declare
  r record;
begin
  for r in
    select column_name
      from information_schema.columns
     where table_schema = 'public' and table_name = 'listings'
  loop
    execute format(
      'revoke insert (%1$I), update (%1$I) on public.listings from anon, authenticated',
      r.column_name
    );
  end loop;
end
$$;

revoke insert, update on public.listings from anon, authenticated;

grant insert (
  id, seller_id, category_id,
  title, description, price, negotiable, price_on_request, condition,
  governorate, delegation, address, lat, lng, attributes,
  contact_name, contact_phone, contact_whatsapp, show_phone,
  seller_attestation_version, search_text
) on public.listings to authenticated;

grant update (
  category_id,
  title, description, price, negotiable, price_on_request, condition,
  governorate, delegation, address, lat, lng, attributes,
  contact_name, contact_phone, contact_whatsapp, show_phone,
  seller_attestation_version, search_text
) on public.listings to authenticated;

-- 2 · Status-aware owner policies --------------------------------------------

drop policy if exists listings_owner_insert on public.listings;
create policy listings_owner_insert on public.listings
  for insert to authenticated
  with check (seller_id = auth.uid() and status = 'draft');

drop policy if exists listings_owner_update on public.listings;
create policy listings_owner_update on public.listings
  for update to authenticated
  using      (seller_id = auth.uid() and status in ('draft', 'rejected', 'pending_payment'))
  with check (seller_id = auth.uid() and status in ('draft', 'rejected', 'pending_payment'));

-- The same rule, callable from photo and fitment policies. SECURITY DEFINER so
-- it reads `listings` without needing the caller's column grants (see 0181).
create or replace function public.listing_editable_by_caller(p_listing uuid)
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
         public.is_admin()
         or (l.seller_id = auth.uid()
             and l.status in ('draft', 'rejected', 'pending_payment'))
       )
  );
$$;

revoke all on function public.listing_editable_by_caller(uuid) from public;
grant execute on function public.listing_editable_by_caller(uuid) to authenticated;

comment on function public.listing_editable_by_caller(uuid) is
  'True when the caller may change this annonce''s photos or fitments: an admin, or its seller while it is draft / rejected / pending_payment.';

-- Photos: the three owner policies from 0182, now status-aware.
drop policy if exists listing_photos_owner_insert on public.listing_photos;
create policy listing_photos_owner_insert on public.listing_photos
  for insert to authenticated
  with check (public.listing_editable_by_caller(listing_id));

drop policy if exists listing_photos_owner_update on public.listing_photos;
create policy listing_photos_owner_update on public.listing_photos
  for update to authenticated
  using      (public.listing_editable_by_caller(listing_id))
  with check (public.listing_editable_by_caller(listing_id));

drop policy if exists listing_photos_owner_delete on public.listing_photos;
create policy listing_photos_owner_delete on public.listing_photos
  for delete to authenticated
  using (public.listing_editable_by_caller(listing_id));

-- 3 · Fitments ----------------------------------------------------------------

drop policy if exists listing_fitments_owner_write on public.listing_fitments;
drop policy if exists listing_fitments_read on public.listing_fitments;

create policy listing_fitments_read on public.listing_fitments
  for select
  using (public.listing_photo_visible(listing_id));

create policy listing_fitments_owner_insert on public.listing_fitments
  for insert to authenticated
  with check (public.listing_editable_by_caller(listing_id));

create policy listing_fitments_owner_update on public.listing_fitments
  for update to authenticated
  using      (public.listing_editable_by_caller(listing_id))
  with check (public.listing_editable_by_caller(listing_id));

create policy listing_fitments_owner_delete on public.listing_fitments
  for delete to authenticated
  using (public.listing_editable_by_caller(listing_id));

-- `listing_photo_visible` was granted to anon + authenticated in 0181; the
-- fitments read policy now depends on that too.
grant execute on function public.listing_photo_visible(uuid) to anon, authenticated;

-- 4 · Banned sellers ------------------------------------------------------------

create or replace function public._listings_block_banned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('pending_payment', 'pending_review', 'published')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and exists (
       select 1 from public.profiles p
        where p.id = new.seller_id
          and p.banned_at is not null
     )
     -- An admin acting by hand, or the database itself, may still move a row.
     -- The service role may not: it is how the routes act FOR the seller.
     --
     -- The caller is read from the `role` setting, NOT `current_user`: inside a
     -- SECURITY DEFINER function `current_user` is the function's owner
     -- (postgres), so a `current_user` test is true for everyone. PostgREST
     -- sets `role` to anon / authenticated / service_role for each request; a
     -- direct database session leaves it at 'none'.
     and coalesce(nullif(current_setting('role', true), ''), 'none')
           in ('anon', 'authenticated', 'service_role')
     and not public.is_admin() then
    raise exception 'seller_banned'
      using errcode = 'P0001',
            hint = 'This account is suspended and cannot submit, pay for or renew annonces.';
  end if;
  return new;
end;
$$;

drop trigger if exists _listings_block_banned on public.listings;
create trigger _listings_block_banned
  before insert or update on public.listings
  for each row execute function public._listings_block_banned();

-- 5 · The publish guard, made real ------------------------------------------------

create or replace function public._listings_guard_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the paid / credited / admin paths may make an annonce live: the
  -- service role (the routes), an admin, or the database itself. A request
  -- arriving as anon or authenticated may not, whatever its grants say.
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and coalesce(nullif(current_setting('role', true), ''), 'none')
           in ('anon', 'authenticated')
     and not public.is_admin() then
    raise exception 'publication_requires_payment'
      using errcode = 'P0001',
            hint = 'A listing is published by the payment/credit path, by an admin, or by the database owner.';
  end if;
  return new;
end;
$$;
