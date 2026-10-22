-- ============================================================================
-- Shop statistics, the rest of the audit trail, and the admin's two doors.
--
-- STATISTICS (brief: « vues et clics par jour et par annonce », never sales).
-- `listing_views` (0173) keeps one row per (annonce, viewer) — the right shape
-- for « how many people », but it cannot say WHEN. `shop_lead_events` is the
-- daily trace for shops: one row per viewer, per thing, per day —
--   shop_view       the storefront was opened,
--   listing_view    one of the shop's annonces was opened,
--   phone_reveal    the shop's number was asked for (storefront),
--   whatsapp_click  the WhatsApp button was used (storefront).
-- A refresh, or ten, is the same row: the unique index makes « once a day » a
-- rule of the table, not of the route. The viewer is md5 of the key the routes
-- already compute (a user id, or a salted IP hash) — never an address. The
-- shop's own members are not their audience and are not counted. Numbers
-- revealed from an ANNONCE are already one row each in `contact_reveals`;
-- `shop_stats()` reads them there rather than counting them twice.
-- Kept 400 days, then pruned.
--
-- AUDIT. 0185/0188 trace shops and periods. Added here: a document's review,
-- and the status of a shop's annonces (moderation, pause, expiry), so an
-- admin can answer « why is this annonce offline? » from one timeline.
--
-- ADMIN. `admin_review_shop_document()` and `admin_grant_subscription()`
-- check is_admin() themselves and run on the admin's own session, so the
-- audit rows carry who decided.
--
-- NOT HERE: `invoices`. Receipts, not invoices, until the fiscal questions of
-- D-P6 are settled; an empty table would only be one more thing to keep.
-- ============================================================================

-- ── The events ──────────────────────────────────────────────────────────────

create table if not exists public.shop_lead_events (
  id          bigint generated always as identity primary key,
  shop_id     uuid not null references public.shops(id) on delete cascade,
  listing_id  uuid references public.listings(id) on delete cascade,
  kind        text not null check (kind in ('shop_view', 'listing_view', 'phone_reveal', 'whatsapp_click')),
  viewer_hash text not null,
  day         date not null default ((now() at time zone 'Africa/Tunis')::date),
  created_at  timestamptz not null default now()
);

create unique index if not exists shop_lead_events_once_a_day
  on public.shop_lead_events
  (shop_id, coalesce(listing_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, viewer_hash, day);
create index if not exists shop_lead_events_shop_day on public.shop_lead_events (shop_id, day);
create index if not exists shop_lead_events_listing on public.shop_lead_events (listing_id, day) where listing_id is not null;

alter table public.shop_lead_events enable row level security;
revoke all on public.shop_lead_events from anon, authenticated;
grant all on public.shop_lead_events to service_role;

create or replace function public.record_shop_event(
  p_shop       uuid,
  p_listing    uuid,
  p_kind       text,
  p_viewer_key text,
  p_user       uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_shop is null or coalesce(p_viewer_key, '') = '' then
    return false;
  end if;
  if p_user is not null
     and exists (select 1 from public.shop_members where shop_id = p_shop and user_id = p_user) then
    return false;                       -- a shop is not its own audience
  end if;
  insert into public.shop_lead_events (shop_id, listing_id, kind, viewer_hash)
  values (p_shop, p_listing, p_kind, md5(p_viewer_key))
  on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.record_shop_event(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_shop_event(uuid, uuid, text, text, uuid) to service_role;

-- record_listing_view (0173), unchanged, plus one line: an annonce filed under
-- a shop also leaves a daily `listing_view` for that shop.
create or replace function public.record_listing_view(
  p_listing    uuid,
  p_viewer_key text,
  p_user       uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now        timestamptz := now();
  v_seller     uuid;
  v_shop       uuid;
  v_prev_seen  timestamptz;
  v_new_visit  boolean;
begin
  if p_listing is null or coalesce(p_viewer_key, '') = '' then
    return;
  end if;

  select seller_id, shop_id into v_seller, v_shop from public.listings where id = p_listing;
  if v_seller is null then
    return;                                   -- listing deleted mid-request
  end if;
  if p_user is not null and p_user = v_seller then
    return;                                   -- a seller is not their own audience
  end if;

  select last_seen_at into v_prev_seen
    from public.listing_views
   where listing_id = p_listing and viewer_key = p_viewer_key;

  -- New person, or the same person back after a real gap. A refresh two seconds
  -- later is the same visit and must not count twice.
  v_new_visit := v_prev_seen is null or v_prev_seen < v_now - interval '30 minutes';

  insert into public.listing_views as lv
         (listing_id, viewer_key, user_id, first_seen_at, last_seen_at, view_count)
  values (p_listing, p_viewer_key, p_user, v_now, v_now, 1)
  on conflict (listing_id, viewer_key) do update
     set last_seen_at = v_now,
         -- A viewer who signs in later stops being anonymous to us.
         user_id      = coalesce(lv.user_id, excluded.user_id),
         view_count   = lv.view_count + case when v_new_visit then 1 else 0 end;

  -- listings.view_count stays the running total, so every screen already
  -- reading it starts telling the truth instead of showing zero.
  if v_new_visit then
    update public.listings set view_count = view_count + 1 where id = p_listing;
  end if;

  if v_shop is not null then
    perform public.record_shop_event(v_shop, p_listing, 'listing_view', p_viewer_key, p_user);
  end if;
end;
$$;

revoke all on function public.record_listing_view(uuid, text, uuid) from public;
grant execute on function public.record_listing_view(uuid, text, uuid) to service_role;

-- ── What the owner sees ─────────────────────────────────────────────────────
-- Daily counts for the last p_days days (zeros included, Tunis calendar), and
-- one line per annonce for the same window plus its lifetime totals. Read by
-- the dashboard with the service role, after it has checked membership.

create or replace function public.shop_stats(p_shop uuid, p_days int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select (now() at time zone 'Africa/Tunis')::date as today,
           (now() at time zone 'Africa/Tunis')::date - (least(greatest(coalesce(p_days, 30), 1), 366) - 1) as first
  ),
  days as (
    select d::date as day from bounds, generate_series(bounds.first, bounds.today, interval '1 day') d
  ),
  ev as (
    select e.day, e.kind, count(*)::int as n
      from public.shop_lead_events e, bounds
     where e.shop_id = p_shop and e.day >= bounds.first
     group by 1, 2
  ),
  rev as (
    -- Numbers revealed from the shop's annonces: one per person, per annonce, per day.
    select (cr.created_at at time zone 'Africa/Tunis')::date as day,
           count(distinct (cr.listing_id::text || ':' || coalesce(cr.user_id::text, cr.ip_hash, cr.id::text)))::int as n
      from public.contact_reveals cr
      join public.listings l on l.id = cr.listing_id, bounds
     where l.shop_id = p_shop
       and cr.created_at >= (bounds.first::timestamp at time zone 'Africa/Tunis')
       and (cr.user_id is null or not exists (
             select 1 from public.shop_members m where m.shop_id = p_shop and m.user_id = cr.user_id))
     group by 1
  ),
  per_listing as (
    select l.id, l.title, l.status::text as status, l.view_count, l.contact_reveal_count,
           (select count(*) from public.shop_lead_events e, bounds
             where e.listing_id = l.id and e.kind = 'listing_view' and e.day >= bounds.first)::int as views,
           (select count(distinct coalesce(cr.user_id::text, cr.ip_hash, cr.id::text))
              from public.contact_reveals cr, bounds
             where cr.listing_id = l.id
               and cr.created_at >= (bounds.first::timestamp at time zone 'Africa/Tunis'))::int as reveals,
           (select count(*) from public.watchlist w where w.listing_id = l.id)::int as favourites
      from public.listings l
     where l.shop_id = p_shop and l.status::text <> 'draft'
  )
  select jsonb_build_object(
    'from', (select first from bounds),
    'to',   (select today from bounds),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', d.day,
               'shop_views',      coalesce((select n from ev where ev.day = d.day and ev.kind = 'shop_view'), 0),
               'listing_views',   coalesce((select n from ev where ev.day = d.day and ev.kind = 'listing_view'), 0),
               'phone_reveals',   coalesce((select n from ev where ev.day = d.day and ev.kind = 'phone_reveal'), 0)
                                  + coalesce((select n from rev where rev.day = d.day), 0),
               'whatsapp_clicks', coalesce((select n from ev where ev.day = d.day and ev.kind = 'whatsapp_click'), 0)
             ) order by d.day)
        from days d), '[]'::jsonb),
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'title', title, 'status', status,
               'views', views, 'reveals', reveals, 'favourites', favourites,
               'total_views', view_count, 'total_reveals', contact_reveal_count
             ) order by views desc, reveals desc, title)
        from per_listing), '[]'::jsonb)
  );
$$;

revoke all on function public.shop_stats(uuid, int) from public, anon, authenticated;
grant execute on function public.shop_stats(uuid, int) to service_role;

-- ── Audit: documents and the shop's annonces ───────────────────────────────

create or replace function public._audit_shop_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, entity, entity_id, action, after)
    values (auth.uid(), 'shop_document', new.id, 'submitted',
            jsonb_build_object('shop_id', new.shop_id, 'kind', new.kind, 'status', new.status));
  elsif new.status is distinct from old.status then
    insert into public.audit_logs (actor_id, entity, entity_id, action, before, after, reason)
    values (coalesce(auth.uid(), new.reviewed_by), 'shop_document', new.id, 'reviewed',
            jsonb_build_object('status', old.status),
            jsonb_build_object('shop_id', new.shop_id, 'kind', new.kind, 'status', new.status),
            new.note);
  end if;
  return new;
end;
$$;

drop trigger if exists _audit_shop_document on public.shop_documents;
create trigger _audit_shop_document
  after insert or update on public.shop_documents
  for each row execute function public._audit_shop_document();

create or replace function public._audit_shop_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.shop_id is not null and new.status is distinct from old.status then
    insert into public.audit_logs (actor_id, entity, entity_id, action, before, after, reason)
    values (auth.uid(), 'listing', new.id, 'status_changed',
            jsonb_build_object('status', old.status::text),
            jsonb_build_object('status', new.status::text, 'shop_id', new.shop_id,
                               'paused_reason', new.paused_reason),
            case when new.status::text = 'rejected' then new.rejection_reason end);
  end if;
  return new;
end;
$$;

drop trigger if exists _audit_shop_listing on public.listings;
create trigger _audit_shop_listing
  after update of status on public.listings
  for each row execute function public._audit_shop_listing();

-- ── The admin's doors ───────────────────────────────────────────────────────

create or replace function public.admin_review_shop_document(
  p_doc    uuid,
  p_status text,
  p_note   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('accepted', 'rejected') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if p_status = 'rejected' and coalesce(btrim(p_note), '') = '' then
    raise exception 'reason_required'
      using errcode = 'P0001', hint = 'A refused document needs a reason the owner can read.';
  end if;

  update public.shop_documents
     set status      = p_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         note        = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_doc
  returning shop_id into v_shop;
  if v_shop is null then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;
  return v_shop;
end;
$$;

revoke all on function public.admin_review_shop_document(uuid, text, text) from public, anon, service_role;
grant execute on function public.admin_review_shop_document(uuid, text, text) to authenticated;

-- A period given, not sold: a commercial gesture, a transfer received outside
-- the site, a correction. It follows the same rules as a paid one (0191): it
-- starts when the current period ends, gets the plan's limits and the grace
-- days, opens a new shop and brings paused annonces back. The reason is
-- required; who gave it is recorded on the period and in audit_logs.
create or replace function public.admin_grant_subscription(
  p_shop      uuid,
  p_plan_code text,
  p_days      int,
  p_reason    text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
  v_grace   int;
  v_last    timestamptz;
  v_start   timestamptz;
  v_id      uuid;
  v_owner   uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if p_days is null or p_days < 1 or p_days > 366 then
    raise exception 'invalid_days' using errcode = '22023';
  end if;

  select * into v_product from public.products
   where plan_code = p_plan_code and kind = 'subscription';
  if v_product.id is null then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.shops where id = p_shop and status not in ('closed', 'rejected') for update;
  if not found then
    raise exception 'shop_not_found' using errcode = 'P0002';
  end if;

  select coalesce((value #>> '{}')::int, 7) into v_grace from public.app_settings where key = 'pro_grace_days';
  v_grace := coalesce(v_grace, 7);
  select max(ends_at) into v_last
    from public.subscriptions
   where shop_id = p_shop and status in ('active', 'grace') and ends_at > now();
  v_start := greatest(now(), coalesce(v_last, now()));

  insert into public.subscriptions
    (shop_id, product_id, limits, status, starts_at, ends_at, grace_ends_at, granted_by, reason)
  values
    (p_shop, v_product.id, v_product.limits, 'active', v_start,
     v_start + make_interval(days => p_days),
     v_start + make_interval(days => p_days + v_grace),
     auth.uid(), btrim(p_reason))
  returning id into v_id;

  perform set_config('mazed.shop_admin', 'on', true);
  update public.shops set status = 'active'
   where id = p_shop and status in ('draft', 'pending_review');
  perform set_config('mazed.shop_admin', 'off', true);

  perform public._resume_shop_listings(p_shop);

  select owner_id into v_owner from public.shops where id = p_shop;
  begin
    perform public.enqueue_notification(
      v_owner, 'subscription_active', 'Période offerte',
      format('Notre équipe vous a offert %s jours de formule %s.', p_days, v_product.name_fr),
      '/pro/dashboard/abonnement');
  exception when others then null;
  end;
  return v_id;
end;
$$;

revoke all on function public.admin_grant_subscription(uuid, text, int, text) from public, anon, service_role;
grant execute on function public.admin_grant_subscription(uuid, text, int, text) to authenticated;

-- ── Housekeeping ────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('prune_shop_lead_events')
      where exists (select 1 from cron.job where jobname = 'prune_shop_lead_events');
    perform cron.schedule('prune_shop_lead_events', '41 3 * * *',
      $job$delete from public.shop_lead_events where day < (now() at time zone 'Africa/Tunis')::date - 400$job$);
  end if;
end $$;

notify pgrst, 'reload schema';
