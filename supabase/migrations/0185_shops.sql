-- ============================================================================
-- Boutiques professionnelles — the shop itself.
--
-- A shop is not a second kind of account. The person behind it keeps their one
-- `profiles` row, their phone, their personal annonces; the shop is a separate
-- entity they own, so personal and professional data never share a column.
--
--   shops            the public face: name, slug, activity, logo, hours, and
--                    two statuses that only an admin moves (see the guard)
--   shop_members     who may act for it (owner / manager / staff)
--   shop_private     legal identity — never readable by anon, never rendered
--   shop_documents   the justificatifs, stored in a PRIVATE bucket
--   audit_logs       every status and verification decision, append-only
--
-- WRITES. None of these tables is writable by anon or authenticated. Lot 0
-- (0183) was a whole migration spent closing a table a seller's token could
-- write; these start closed. Every change goes through a server route that
-- checks membership itself (service role) or through a SECURITY DEFINER
-- function.
--
-- THE TWO STATUSES.
--   status               draft → pending_review → active | rejected,
--                        suspended, closed. Is the shop's page public?
--   verification_status  unverified → pending → verified | rejected.
--                        Has an admin checked the business? This, and only
--                        this, is the « vérifié » badge. It is never bought.
-- `_guard_shop_state` lets the owner's routes do the owner's moves (submit for
-- review, send documents, close) and refuses everything an admin decides
-- unless the call came through `admin_set_shop_state()`.
-- ============================================================================

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.shops (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete restrict,
  activity_type       text not null
                        check (activity_type in ('vente_auto', 'location_auto', 'pieces_auto')),
  slug                text not null
                        check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$'),
  name                text not null check (char_length(btrim(name)) between 2 and 80),
  description         text check (description is null or char_length(description) <= 2000),
  logo_path           text,
  banner_path         text,
  governorate         text not null,
  city                text,
  address             text,
  phone               text,          -- business line, revealed on click, like a listing's
  whatsapp            text,
  opening_hours       jsonb not null default '{}'::jsonb,
  status              text not null default 'draft'
                        check (status in ('draft', 'pending_review', 'active', 'rejected', 'suspended', 'closed')),
  verification_status text not null default 'unverified'
                        check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  verified_at         timestamptz,
  verified_by         uuid references public.profiles(id),
  rejection_reason    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint shops_verified_has_stamp
    check (verification_status <> 'verified' or verified_at is not null)
);

create unique index if not exists shops_slug_uniq on public.shops (slug);
-- One open shop per account (D, V1). A closed shop does not block a new one.
create unique index if not exists shops_one_per_owner on public.shops (owner_id) where status <> 'closed';
create index if not exists shops_directory_idx on public.shops (activity_type, governorate) where status = 'active';

create table if not exists public.shop_members (
  shop_id    uuid not null references public.shops(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index if not exists shop_members_user_idx on public.shop_members (user_id);

create table if not exists public.shop_private (
  shop_id       uuid primary key references public.shops(id) on delete cascade,
  legal_name    text,
  tax_id        text,            -- matricule fiscal
  rne_number    text,
  legal_address text,
  contact_email text,
  updated_at    timestamptz not null default now()
);

create table if not exists public.shop_documents (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  kind         text not null check (kind in ('rne', 'patente', 'cin_gerant', 'autre')),
  storage_path text not null,             -- bucket shop-documents (private)
  status       text not null default 'submitted' check (status in ('submitted', 'accepted', 'rejected')),
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists shop_documents_shop_idx on public.shop_documents (shop_id, created_at desc);

-- Decisions outlive the rows they are about, so references are kept BY VALUE
-- (no foreign keys), as in credit_ledger (0159): an append-only table cannot
-- honour an ON DELETE action.
create table if not exists public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid,
  entity     text not null,
  entity_id  uuid not null,
  action     text not null,
  before     jsonb,
  after      jsonb,
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity, entity_id, created_at desc);

create or replace function public._audit_logs_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs_append_only'
    using errcode = 'P0001', hint = 'Audit entries are never edited or deleted.';
end;
$$;

drop trigger if exists _audit_logs_append_only on public.audit_logs;
create trigger _audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public._audit_logs_append_only();

drop trigger if exists _touch_shops on public.shops;
create trigger _touch_shops before update on public.shops
  for each row execute function public._touch_updated_at();

drop trigger if exists _touch_shop_private on public.shop_private;
create trigger _touch_shop_private before update on public.shop_private
  for each row execute function public._touch_updated_at();

-- ── Membership ──────────────────────────────────────────────────────────────

create or replace function public.is_shop_member(p_shop uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shop_members m
     where m.shop_id = p_shop
       and m.user_id = auth.uid()
       and (p_roles is null or m.role = any (p_roles))
  );
$$;

revoke all on function public.is_shop_member(uuid, text[]) from public;
grant execute on function public.is_shop_member(uuid, text[]) to anon, authenticated, service_role;

-- ── The state guard ───────────────────────────────────────────────────────────

create or replace function public._guard_shop_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The caller, read from `role` and not `current_user` (see 0183, §5).
  v_role  text := coalesce(nullif(current_setting('role', true), ''), 'none');
  v_admin boolean := coalesce(current_setting('mazed.shop_admin', true), '') = 'on';
begin
  if v_role = 'none' or v_admin then
    return new;                         -- the database itself, or admin_set_shop_state()
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending_review')
       or new.verification_status not in ('unverified', 'pending')
       or new.verified_at is not null
       or new.verified_by is not null then
      raise exception 'shop_state_admin_only'
        using errcode = 'P0001', hint = 'A new shop starts as a draft, unverified.';
    end if;
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.rejection_reason is distinct from old.rejection_reason
     -- The owner may only ask for verification, never answer it.
     or (new.verification_status is distinct from old.verification_status
         and not (old.verification_status in ('unverified', 'rejected')
                  and new.verification_status = 'pending'))
     -- The owner may submit, resubmit and close; an admin decides the rest.
     or (new.status is distinct from old.status
         and not ((old.status in ('draft', 'rejected') and new.status = 'pending_review')
                  or (old.status = 'pending_review' and new.status = 'draft')
                  or (old.status not in ('suspended', 'closed') and new.status = 'closed')))
     -- Activity and slug are frozen once the shop has been submitted: listings
     -- are filed against the first, links point at the second.
     or (old.status <> 'draft'
         and (new.activity_type is distinct from old.activity_type
              or new.slug is distinct from old.slug)) then
    raise exception 'shop_state_admin_only'
      using errcode = 'P0001',
            hint = 'Only an admin decides a shop''s status, verification and ownership.';
  end if;
  return new;
end;
$$;

drop trigger if exists _guard_shop_state on public.shops;
create trigger _guard_shop_state
  before insert or update on public.shops
  for each row execute function public._guard_shop_state();

-- ── Audit ─────────────────────────────────────────────────────────────────────

create or replace function public._audit_shop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, entity, entity_id, action, after)
    values (auth.uid(), 'shop', new.id, 'created',
            jsonb_build_object('status', new.status, 'verification_status', new.verification_status,
                               'activity_type', new.activity_type, 'owner_id', new.owner_id));
  elsif new.status is distinct from old.status
        or new.verification_status is distinct from old.verification_status then
    insert into public.audit_logs (actor_id, entity, entity_id, action, before, after, reason)
    values (auth.uid(), 'shop', new.id, 'state_changed',
            jsonb_build_object('status', old.status, 'verification_status', old.verification_status),
            jsonb_build_object('status', new.status, 'verification_status', new.verification_status),
            new.rejection_reason);
  end if;
  return new;
end;
$$;

drop trigger if exists _audit_shop on public.shops;
create trigger _audit_shop
  after insert or update on public.shops
  for each row execute function public._audit_shop();

-- ── The admin's door ────────────────────────────────────────────────────────

create or replace function public.admin_set_shop_state(
  p_shop         uuid,
  p_status       text default null,
  p_verification text default null,
  p_reason       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.shops%rowtype;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (p_status = 'rejected' or p_verification = 'rejected' or p_status = 'suspended')
     and coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required'
      using errcode = 'P0001', hint = 'A refusal or a suspension needs a reason the owner can read.';
  end if;

  perform 1 from public.shops where id = p_shop for update;
  if not found then
    raise exception 'shop_not_found' using errcode = 'P0002';
  end if;

  perform set_config('mazed.shop_admin', 'on', true);
  update public.shops
     set status              = coalesce(p_status, status),
         verification_status = coalesce(p_verification, verification_status),
         verified_at         = case
                                 when p_verification = 'verified' then now()
                                 when p_verification is not null then null
                                 else verified_at
                               end,
         verified_by         = case
                                 when p_verification = 'verified' then auth.uid()
                                 when p_verification is not null then null
                                 else verified_by
                               end,
         rejection_reason    = case
                                 when p_reason is not null then btrim(p_reason)
                                 when p_status = 'active' or p_verification = 'verified' then null
                                 else rejection_reason
                               end
   where id = p_shop
  returning * into v_row;
  perform set_config('mazed.shop_admin', 'off', true);

  return jsonb_build_object(
    'id', v_row.id, 'status', v_row.status,
    'verification_status', v_row.verification_status, 'verified_at', v_row.verified_at
  );
end;
$$;

revoke all on function public.admin_set_shop_state(uuid, text, text, text) from public;
grant execute on function public.admin_set_shop_state(uuid, text, text, text) to authenticated;

-- ── Grants and RLS ──────────────────────────────────────────────────────────

alter table public.shops          enable row level security;
alter table public.shop_members   enable row level security;
alter table public.shop_private   enable row level security;
alter table public.shop_documents enable row level security;
alter table public.audit_logs     enable row level security;

revoke all on public.shops, public.shop_members, public.shop_private,
              public.shop_documents, public.audit_logs
  from anon, authenticated;

-- What a visitor may read of a shop. Not the phone or WhatsApp (revealed on
-- click, counted and rate-limited, like a listing's), not the owner's account
-- id, not the rejection text.
grant select (
  id, activity_type, slug, name, description, logo_path, banner_path,
  governorate, city, address, opening_hours, status, verification_status,
  verified_at, created_at, updated_at
) on public.shops to anon, authenticated;

grant select on public.shop_members to authenticated;
grant select on public.shop_private to authenticated;
grant select on public.shop_documents to authenticated;

drop policy if exists shops_read on public.shops;
create policy shops_read on public.shops
  for select
  using (status = 'active' or public.is_shop_member(id) or public.is_admin());

drop policy if exists shop_members_read on public.shop_members;
create policy shop_members_read on public.shop_members
  for select to authenticated
  using (public.is_shop_member(shop_id) or public.is_admin());

drop policy if exists shop_private_read on public.shop_private;
create policy shop_private_read on public.shop_private
  for select to authenticated
  using (public.is_shop_member(shop_id, array['owner', 'manager']) or public.is_admin());

drop policy if exists shop_documents_read on public.shop_documents;
create policy shop_documents_read on public.shop_documents
  for select to authenticated
  using (public.is_shop_member(shop_id, array['owner', 'manager']) or public.is_admin());

drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read on public.audit_logs
  for select to authenticated
  using (public.is_admin());
grant select on public.audit_logs to authenticated;

-- ── Storage ─────────────────────────────────────────────────────────────────
-- Uploads go through signed upload URLs minted by the server, so neither bucket
-- needs a write policy. The limits are enforced by Storage itself — the browser
-- compression in front of them is a convenience, not a control (see 0183 §2.4).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('shop-media', 'shop-media', true, 5242880,
     array['image/jpeg', 'image/png', 'image/webp']),
  ('shop-documents', 'shop-documents', false, 10485760,
     array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
