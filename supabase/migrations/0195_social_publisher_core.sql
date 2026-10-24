-- ============================================================================
-- Social Publisher, lot S1 — the core: connected accounts, publication
-- requests, the content per network, the jobs that publish it, what each
-- attempt returned, and the consents. See SOCIAL-PUBLISHER-PLAN.md.
--
-- THE RULES LIVE HERE, not in the screens (same choice as the shops):
--   * a job moves only along the brief's state machine
--       draft → pending_approval → scheduled → publishing → published
--       (+ failed, manual_action_required, cancelled)
--     and any other move is refused, whoever asks;
--   * no job without a consent given by the person, for that request and that
--     network (brief: « refus de publication sans consentement »);
--   * one publication per idempotency key, and a job is claimed for publishing
--     atomically, so a double click or two workers can never publish twice;
--   * an annonce that leaves « published » (sold, withdrawn, expired, paused)
--     cancels every job not yet run, and no new request can be made for it;
--   * the tokens are encrypted by the application (D-S3) and their column is
--     never granted to a client.
-- Behind `app_settings.social_publisher` (off): until it is switched on, only
-- admins see the module.
-- ============================================================================

insert into public.app_settings (key, value, description)
values ('social_publisher', '{"enabled": false}',
        'Social Publisher : visible par les boutiques (true) ou par les admins seulement (false).')
on conflict (key) do nothing;

-- The pictures as the networks receive them. Annonce photos are WebP and
-- Instagram takes JPEG only, so each publication gets JPEG copies, public
-- because Meta fetches them by URL. Written by the server only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-media', 'social-media', true, 8388608, array['image/jpeg'])
on conflict (id) do nothing;

-- ── Connected accounts ──────────────────────────────────────────────────────

create table if not exists public.social_accounts (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid references public.shops(id) on delete cascade,   -- null: MAZED's own (lot S3)
  network           text not null check (network in ('facebook', 'instagram')),
  external_id       text not null,
  name              text not null,
  username          text,
  picture_url       text,
  -- An Instagram professional account is reached through the Facebook Page it
  -- is linked to; this points at that Page's row.
  parent_account_id uuid references public.social_accounts(id) on delete cascade,
  token_ciphertext  text,
  token_expires_at  timestamptz,
  status            text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  last_error        text,
  connected_by      uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists social_accounts_once
  on public.social_accounts (coalesce(shop_id, '00000000-0000-0000-0000-000000000000'::uuid), network, external_id);

-- ── Requests, content, consents ─────────────────────────────────────────────

create table if not exists public.social_publication_requests (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  shop_id      uuid references public.shops(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  language     text not null default 'fr' check (language in ('fr', 'tn')),
  networks     text[] not null check (cardinality(networks) > 0 and networks <@ array['facebook', 'instagram']),
  status       text not null default 'draft' check (status in ('draft', 'submitted', 'cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists social_requests_listing on public.social_publication_requests (listing_id);
create index if not exists social_requests_shop on public.social_publication_requests (shop_id, created_at desc);

create table if not exists public.social_content_variants (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.social_publication_requests(id) on delete cascade,
  network      text not null check (network in ('facebook', 'instagram')),
  body         text not null check (char_length(body) between 1 and 2200),
  hashtags     text[] not null default '{}',
  media        jsonb not null default '[]'::jsonb,
  link_url     text not null,
  source       text not null check (source in ('ai', 'template', 'edited')),
  model        text,
  version      int not null default 1,
  validated_at timestamptz,
  validated_by uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (request_id, network)
);

-- A consent is a record that must outlive what it was about: no foreign key
-- that a deleted annonce could take down with it, and it cannot be changed.
create table if not exists public.social_consent_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  request_id   uuid not null,
  listing_id   uuid not null,
  scope        text not null check (scope in ('own_accounts', 'mazed_official')),
  networks     text[] not null check (cardinality(networks) > 0),
  text_version text not null,
  created_at   timestamptz not null default now()
);
create index if not exists social_consents_request on public.social_consent_logs (request_id);

drop trigger if exists _social_consents_append_only on public.social_consent_logs;
create trigger _social_consents_append_only
  before update or delete on public.social_consent_logs
  for each row execute function public._audit_logs_append_only();

-- ── Jobs and their results ──────────────────────────────────────────────────

create table if not exists public.social_publication_jobs (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references public.social_publication_requests(id) on delete cascade,
  variant_id         uuid not null references public.social_content_variants(id) on delete cascade,
  account_id         uuid not null references public.social_accounts(id),
  consent_id         uuid not null references public.social_consent_logs(id),
  network            text not null check (network in ('facebook', 'instagram')),
  status             text not null default 'draft' check (status in (
                       'draft', 'pending_approval', 'scheduled', 'publishing', 'published',
                       'failed', 'manual_action_required', 'cancelled')),
  idempotency_key    text not null unique,
  scheduled_at       timestamptz not null default now(),
  attempts           int not null default 0,
  needs_remote_check boolean not null default false,
  external_id        text,
  external_url       text,
  published_at       timestamptz,
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists social_jobs_external_once
  on public.social_publication_jobs (network, external_id) where external_id is not null;
create index if not exists social_jobs_due
  on public.social_publication_jobs (scheduled_at) where status = 'scheduled';
create index if not exists social_jobs_request on public.social_publication_jobs (request_id);

create table if not exists public.social_publication_results (
  id            bigint generated always as identity primary key,
  job_id        uuid not null references public.social_publication_jobs(id) on delete cascade,
  attempt       int not null,
  outcome       text not null check (outcome in (
                  'published', 'failed', 'ambiguous', 'remote_found', 'remote_absent',
                  'token_invalid', 'rate_limited', 'cancelled')),
  http_status   int,
  error_code    text,
  error_message text,
  external_id   text,
  detail        jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists social_results_job on public.social_publication_results (job_id, id);

-- ── Guards ──────────────────────────────────────────────────────────────────

-- A request is for an annonce that is online, and filed under the same shop.
create or replace function public._social_request_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
begin
  select * into v_listing from public.listings where id = new.listing_id;
  if v_listing.id is null or v_listing.status::text <> 'published' then
    raise exception 'listing_not_published' using errcode = 'P0001';
  end if;
  if new.shop_id is distinct from v_listing.shop_id then
    raise exception 'listing_not_in_shop' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists _social_request_guard on public.social_publication_requests;
create trigger _social_request_guard
  before insert on public.social_publication_requests
  for each row execute function public._social_request_guard();

-- A job runs under a consent given for its request and its network, on an
-- account of the request's shop, for an annonce that is online.
create or replace function public._social_job_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req     public.social_publication_requests;
  v_consent public.social_consent_logs;
  v_account public.social_accounts;
begin
  select * into v_req from public.social_publication_requests where id = new.request_id;
  select * into v_consent from public.social_consent_logs where id = new.consent_id;
  if v_consent.id is null or v_consent.request_id <> new.request_id
     or not (new.network = any (v_consent.networks)) then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  select * into v_account from public.social_accounts where id = new.account_id;
  if v_account.id is null or v_account.network <> new.network
     or v_account.shop_id is distinct from v_req.shop_id then
    raise exception 'account_not_allowed' using errcode = 'P0001';
  end if;
  if v_account.status <> 'active' then
    raise exception 'account_not_active' using errcode = 'P0001';
  end if;
  -- The text that goes out is the one the person read and validated (brief §5).
  if not exists (select 1 from public.social_content_variants v
                  where v.id = new.variant_id and v.request_id = new.request_id
                    and v.network = new.network and v.validated_at is not null) then
    raise exception 'variant_not_validated' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.listings where id = v_req.listing_id and status::text = 'published') then
    raise exception 'listing_not_published' using errcode = 'P0001';
  end if;
  if v_req.status = 'cancelled' then
    raise exception 'request_cancelled' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists _social_job_insert_guard on public.social_publication_jobs;
create trigger _social_job_insert_guard
  before insert on public.social_publication_jobs
  for each row execute function public._social_job_insert_guard();

-- The state machine. Terminal: published, cancelled.
create or replace function public._social_job_transition_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'draft'                  and new.status in ('pending_approval', 'scheduled', 'cancelled'))
    or (old.status = 'pending_approval'       and new.status in ('scheduled', 'cancelled'))
    or (old.status = 'scheduled'              and new.status in ('publishing', 'cancelled'))
    or (old.status = 'publishing'             and new.status in ('published', 'failed', 'manual_action_required', 'scheduled'))
    or (old.status = 'failed'                 and new.status in ('scheduled', 'cancelled'))
    or (old.status = 'manual_action_required' and new.status in ('scheduled', 'cancelled'))
  ) then
    raise exception 'invalid_transition'
      using errcode = 'P0001', detail = format('%s → %s', old.status, new.status);
  end if;
  if new.status = 'published' and new.external_id is null then
    raise exception 'published_without_external_id' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists _social_job_transition_guard on public.social_publication_jobs;
create trigger _social_job_transition_guard
  before update on public.social_publication_jobs
  for each row execute function public._social_job_transition_guard();

-- Every move of a job is traced.
create or replace function public._audit_social_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.audit_logs (actor_id, entity, entity_id, action, before, after, reason)
    values (auth.uid(), 'social_job', new.id,
            case when tg_op = 'INSERT' then 'created' else 'status_changed' end,
            case when tg_op = 'INSERT' then null else jsonb_build_object('status', old.status) end,
            jsonb_build_object('status', new.status, 'network', new.network,
                               'request_id', new.request_id, 'external_id', new.external_id),
            new.last_error);
  end if;
  return new;
end;
$$;

drop trigger if exists _audit_social_job on public.social_publication_jobs;
create trigger _audit_social_job
  after insert or update on public.social_publication_jobs
  for each row execute function public._audit_social_job();

-- An annonce that goes offline takes its unrun publications with it (brief §11).
create or replace function public._social_cancel_on_listing_offline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status::text = 'published' and new.status::text <> 'published' then
    update public.social_publication_jobs j
       set status = 'cancelled',
           last_error = format('Annonce %s : publication annulée.', new.status::text)
      from public.social_publication_requests r
     where r.id = j.request_id
       and r.listing_id = new.id
       and j.status in ('draft', 'pending_approval', 'scheduled', 'failed', 'manual_action_required');
  end if;
  return new;
end;
$$;

drop trigger if exists _social_cancel_on_listing_offline on public.listings;
create trigger _social_cancel_on_listing_offline
  after update of status on public.listings
  for each row execute function public._social_cancel_on_listing_offline();

-- ── Claiming a job for publishing ───────────────────────────────────────────
-- The only way into « publishing »: one statement that succeeds for exactly one
-- caller. The route publishing now and the worker (S2) both go through it.

create or replace function public.social_claim_job(p_job uuid)
returns public.social_publication_jobs
language sql
security definer
set search_path = public
as $$
  update public.social_publication_jobs
     set status = 'publishing', attempts = attempts + 1
   where id = p_job and status = 'scheduled' and scheduled_at <= now()
  returning *;
$$;

create or replace function public.social_claim_due_jobs(p_limit int default 10)
returns setof public.social_publication_jobs
language sql
security definer
set search_path = public
as $$
  update public.social_publication_jobs j
     set status = 'publishing', attempts = j.attempts + 1
   where j.id in (
     select id from public.social_publication_jobs
      where status = 'scheduled' and scheduled_at <= now()
      order by scheduled_at
      limit greatest(1, least(coalesce(p_limit, 10), 50))
      for update skip locked
   )
  returning j.*;
$$;

-- Back in line, due NOW by the database's clock. Times are never taken from
-- the application server: a few seconds between the two clocks would leave a
-- job « in the future » that nobody may claim.
create or replace function public.social_requeue_job(p_job uuid)
returns public.social_publication_jobs
language sql
security definer
set search_path = public
as $$
  update public.social_publication_jobs
     set status = 'scheduled', scheduled_at = now(), needs_remote_check = false
   where id = p_job
     and (status in ('failed', 'manual_action_required', 'scheduled')
          or (status = 'publishing' and needs_remote_check))
  returning *;
$$;

revoke all on function public.social_claim_job(uuid) from public, anon, authenticated;
revoke all on function public.social_claim_due_jobs(int) from public, anon, authenticated;
revoke all on function public.social_requeue_job(uuid) from public, anon, authenticated;
grant execute on function public.social_claim_job(uuid) to service_role;
grant execute on function public.social_claim_due_jobs(int) to service_role;
grant execute on function public.social_requeue_job(uuid) to service_role;

-- ── Grants and RLS ──────────────────────────────────────────────────────────
-- Writes go through the server (service role). Members of a shop read their
-- own shop's rows; never a token.

alter table public.social_accounts            enable row level security;
alter table public.social_publication_requests enable row level security;
alter table public.social_content_variants    enable row level security;
alter table public.social_consent_logs        enable row level security;
alter table public.social_publication_jobs    enable row level security;
alter table public.social_publication_results enable row level security;

revoke all on public.social_accounts, public.social_publication_requests, public.social_content_variants,
              public.social_consent_logs, public.social_publication_jobs, public.social_publication_results
  from anon, authenticated;
grant all on public.social_accounts, public.social_publication_requests, public.social_content_variants,
             public.social_consent_logs, public.social_publication_jobs, public.social_publication_results
  to service_role;

grant select (id, shop_id, network, external_id, name, username, picture_url, parent_account_id,
              token_expires_at, status, last_error, created_at, updated_at)
  on public.social_accounts to authenticated;
grant select on public.social_publication_requests, public.social_content_variants,
                public.social_publication_jobs, public.social_publication_results
  to authenticated;

drop policy if exists social_accounts_read on public.social_accounts;
create policy social_accounts_read on public.social_accounts for select to authenticated
  using (public.is_admin() or (shop_id is not null and public.is_shop_member(shop_id)));

drop policy if exists social_requests_read on public.social_publication_requests;
create policy social_requests_read on public.social_publication_requests for select to authenticated
  using (public.is_admin() or (shop_id is not null and public.is_shop_member(shop_id)));

drop policy if exists social_variants_read on public.social_content_variants;
create policy social_variants_read on public.social_content_variants for select to authenticated
  using (exists (select 1 from public.social_publication_requests r
                  where r.id = request_id
                    and (public.is_admin() or (r.shop_id is not null and public.is_shop_member(r.shop_id)))));

drop policy if exists social_jobs_read on public.social_publication_jobs;
create policy social_jobs_read on public.social_publication_jobs for select to authenticated
  using (exists (select 1 from public.social_publication_requests r
                  where r.id = request_id
                    and (public.is_admin() or (r.shop_id is not null and public.is_shop_member(r.shop_id)))));

drop policy if exists social_results_read on public.social_publication_results;
create policy social_results_read on public.social_publication_results for select to authenticated
  using (exists (select 1 from public.social_publication_jobs j
                   join public.social_publication_requests r on r.id = j.request_id
                  where j.id = job_id
                    and (public.is_admin() or (r.shop_id is not null and public.is_shop_member(r.shop_id)))));

notify pgrst, 'reload schema';
