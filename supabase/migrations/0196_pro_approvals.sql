-- ============================================================================
-- 0196 — Pro approvals: the back office approves a shop's opening and its
-- choice of plan before anything is paid (lot A, decisions D-A1…D-A6).
--
-- WHAT NEEDS AN APPROVAL is a setting the back office edits,
-- `app_settings.pro_approvals` (D-A3, D-A4):
--   opening      a shop's first plan — its opening              on
--   plan_change  a plan other than the shop's latest one        on
--   renewal      the same plan again                            off
--   boost        a 7-day boost on one of the shop's annonces    off
-- An account itself never needs one (D-A1): buying, publishing within the
-- personal limits and asking to open a shop stay open to everyone.
--
-- THE ORDER (D-A2): request → an admin approves, or refuses with a reason →
-- the seller pays → the capture opens the shop / starts the period exactly as
-- before (0191, unchanged). Nobody pays for something that is then refused,
-- so nothing ever has to be refunded for a refusal.
--
-- WHERE IT IS ENFORCED. Not in the routes alone: a payment row for a plan or
-- a boost cannot be INSERTED without an approved request for exactly that shop
-- and product whenever the setting asks for one (`_payments_need_approval`).
-- The checkout route asks first and turns a missing approval into a request;
-- the trigger is what makes skipping that step impossible. It runs on INSERT
-- only, so payments already open when this ships keep their course (D-A6),
-- and the shops already open stay open.
--
-- WHO DECIDES. `admin_decide_pro_request()` checks is_admin() itself and is
-- called with the admin's own session, so the audit row carries who decided.
-- Only it may move a request out of `pending` to approved / refused
-- (`mazed.pro_admin`, the same pattern as `mazed.shop_admin` in 0185). The
-- seller is told by notification, with the reason on a refusal.
-- ============================================================================

-- ── The setting ─────────────────────────────────────────────────────────────

insert into public.app_settings (key, value)
values ('pro_approvals', '{"opening": true, "plan_change": true, "renewal": false, "boost": false}'::jsonb)
on conflict (key) do nothing;

-- ── Requests ────────────────────────────────────────────────────────────────

create table if not exists public.pro_requests (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  kind          text not null check (kind in ('opening', 'plan_change', 'renewal', 'boost')),
  product_id    uuid not null references public.products(id) on delete restrict,
  listing_id    uuid references public.listings(id) on delete cascade,
  requested_by  uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
  -- The admin's words on a refusal or a withdrawn approval; the seller reads them.
  reason        text,
  decided_by    uuid references public.profiles(id) on delete set null,
  decided_at    timestamptz,
  payment_id    uuid references public.payments(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint pro_requests_boost_listing check ((kind = 'boost') = (listing_id is not null)),
  constraint pro_requests_refusal_reason check (status <> 'rejected' or coalesce(btrim(reason), '') <> '')
);

-- One open plan request per shop, one open boost request per annonce: a
-- second click is the same request, not a second one for an admin to read.
create unique index if not exists pro_requests_open_plan
  on public.pro_requests (shop_id) where status in ('pending', 'approved') and kind <> 'boost';
create unique index if not exists pro_requests_open_boost
  on public.pro_requests (listing_id) where status in ('pending', 'approved') and kind = 'boost';
create index if not exists pro_requests_queue on public.pro_requests (status, created_at);
create index if not exists pro_requests_by_shop on public.pro_requests (shop_id, created_at desc);

-- ── The rules ───────────────────────────────────────────────────────────────

-- Does this kind of purchase need an admin first? A missing setting falls back
-- to the defaults above, never to « no approval ».
create or replace function public.pro_approval_required(p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case when jsonb_typeof(value -> p_kind) = 'boolean' then (value ->> p_kind)::boolean end
       from public.app_settings where key = 'pro_approvals'),
    p_kind in ('opening', 'plan_change'));
$$;

-- What buying this product would be for this shop: its opening (it never had
-- a period), the same plan again, another plan, or a boost. Null when the
-- product is neither a plan nor the boost.
create or replace function public.pro_request_kind(p_shop uuid, p_product uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_product public.products;
  v_last    text;
begin
  select * into v_product from public.products where id = p_product;
  if v_product.id is null then
    return null;
  end if;
  if v_product.kind <> 'subscription' then
    return case when v_product.slug = 'boost-7j' then 'boost' end;
  end if;
  if v_product.plan_code is null then
    return null;
  end if;

  select p.plan_code into v_last
    from public.subscriptions s
    join public.products p on p.id = s.product_id
   where s.shop_id = p_shop and s.status <> 'cancelled'
   order by s.starts_at desc
   limit 1;
  if not found then
    return 'opening';
  end if;
  return case when v_last is not distinct from v_product.plan_code then 'renewal' else 'plan_change' end;
end;
$$;

-- A new request: the database says what kind it is, checks it can be asked
-- for, and puts a shop asking to open into review.
create or replace function public._pro_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop    public.shops;
  v_product public.products;
  v_kind    text;
begin
  select * into v_shop from public.shops where id = new.shop_id for update;
  if v_shop.id is null then
    raise exception 'shop_not_found' using errcode = 'P0002';
  end if;
  select * into v_product from public.products where id = new.product_id;
  if v_product.id is null or not v_product.is_active then
    raise exception 'not_for_sale' using errcode = 'P0001';
  end if;

  -- The kind is the database's to say, not the caller's.
  v_kind := public.pro_request_kind(new.shop_id, new.product_id);
  if v_kind is null then
    raise exception 'not_for_sale' using errcode = 'P0001';
  end if;
  if v_shop.status in ('suspended', 'closed')
     or (v_shop.status = 'rejected' and v_kind <> 'opening') then
    raise exception 'shop_not_allowed' using errcode = 'P0001';
  end if;
  if v_kind = 'boost' then
    perform 1 from public.listings
     where id = new.listing_id and shop_id = new.shop_id and status = 'published';
    if not found then
      raise exception 'not_published' using errcode = 'P0001';
    end if;
  else
    new.listing_id := null;
  end if;

  new.kind       := v_kind;
  new.status     := 'pending';
  new.reason     := null;
  new.decided_by := null;
  new.decided_at := null;
  new.payment_id := null;
  new.created_at := now();
  new.updated_at := now();

  -- Asking to open puts the shop in review: a draft, or a refused shop asking
  -- again (its old reason goes with the new request).
  if v_kind = 'opening' and v_shop.status in ('draft', 'rejected') then
    perform set_config('mazed.shop_admin', 'on', true);
    update public.shops set status = 'pending_review', rejection_reason = null where id = new.shop_id;
    perform set_config('mazed.shop_admin', 'off', true);
  end if;
  return new;
end;
$$;

drop trigger if exists _pro_request_insert on public.pro_requests;
create trigger _pro_request_insert
  before insert on public.pro_requests
  for each row execute function public._pro_request_insert();

-- What a request may become, and who may make it so. A request is frozen
-- once asked; only its status, the decision and the payment move.
create or replace function public._pro_request_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.shop_id is distinct from old.shop_id
     or new.product_id is distinct from old.product_id
     or new.kind is distinct from old.kind
     or new.listing_id is distinct from old.listing_id
     or new.requested_by is distinct from old.requested_by
     or new.created_at is distinct from old.created_at then
    raise exception 'request_frozen' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    if not ((old.status = 'pending' and new.status in ('approved', 'rejected', 'cancelled'))
            or (old.status = 'approved' and new.status in ('completed', 'cancelled'))) then
      raise exception 'invalid_transition'
        using errcode = 'P0001', detail = format('%s → %s', old.status, new.status);
    end if;
    -- Approving and refusing are an admin's, through admin_decide_pro_request().
    if new.status in ('approved', 'rejected')
       and coalesce(current_setting('mazed.pro_admin', true), '') <> 'on' then
      raise exception 'admin_only' using errcode = '42501';
    end if;
  elsif new.decided_by is distinct from old.decided_by
        or new.decided_at is distinct from old.decided_at
        or new.reason is distinct from old.reason then
    raise exception 'request_frozen' using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists _pro_request_transition on public.pro_requests;
create trigger _pro_request_transition
  before update on public.pro_requests
  for each row execute function public._pro_request_transition();

-- An opening request that is withdrawn (by the seller, or an admin taking an
-- approval back) leaves the shop a draft again, ready to ask anew.
create or replace function public._pro_request_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and new.kind = 'opening' then
    perform set_config('mazed.shop_admin', 'on', true);
    update public.shops set status = 'draft'
     where id = new.shop_id and status = 'pending_review';
    perform set_config('mazed.shop_admin', 'off', true);
  end if;
  return new;
end;
$$;

drop trigger if exists _pro_request_after on public.pro_requests;
create trigger _pro_request_after
  after update of status on public.pro_requests
  for each row execute function public._pro_request_after();

create or replace function public._audit_pro_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.audit_logs (actor_id, entity, entity_id, action, before, after, reason)
    values (auth.uid(), 'pro_request', new.id,
            case when tg_op = 'INSERT' then 'created' else 'status_changed' end,
            case when tg_op = 'INSERT' then null else jsonb_build_object('status', old.status) end,
            jsonb_build_object('status', new.status, 'kind', new.kind, 'shop_id', new.shop_id,
                               'product_id', new.product_id, 'listing_id', new.listing_id,
                               'payment_id', new.payment_id),
            new.reason);
  end if;
  return new;
end;
$$;

drop trigger if exists _audit_pro_request on public.pro_requests;
create trigger _audit_pro_request
  after insert or update on public.pro_requests
  for each row execute function public._audit_pro_request();

-- ── The admin's decision ────────────────────────────────────────────────────

--   approve  pending  → approved   the seller may now pay
--   reject   pending  → rejected   with a reason; a refused opening refuses the shop
--   revoke   approved → cancelled  an approval taken back before it was paid
create or replace function public.admin_decide_pro_request(
  p_request  uuid,
  p_decision text,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req     public.pro_requests;
  v_product public.products;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject', 'revoke') then
    raise exception 'bad_decision' using errcode = '22023';
  end if;
  if p_decision in ('reject', 'revoke') and v_reason is null then
    raise exception 'reason_required'
      using errcode = 'P0001', hint = 'A refusal needs a reason the seller can read.';
  end if;

  select * into v_req from public.pro_requests where id = p_request for update;
  if v_req.id is null then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if (p_decision in ('approve', 'reject') and v_req.status <> 'pending')
     or (p_decision = 'revoke' and v_req.status <> 'approved') then
    raise exception 'request_already_decided' using errcode = 'P0001';
  end if;
  -- Taking an approval back while its money may be on its way would leave a
  -- payment with nothing to show for it: a receipt sent, or a Konnect page
  -- opened in the last two hours. That payment is the thing to decide then.
  -- An order left at « à régler » with no receipt is simply dropped below.
  if p_decision = 'revoke' and exists (
       select 1 from public.payments
        where metadata ->> 'request_id' = v_req.id::text
          and (status = 'pending_review'
               or (status = 'pending' and provider = 'konnect' and created_at > now() - interval '2 hours'))) then
    raise exception 'payment_in_progress' using errcode = 'P0001';
  end if;
  select * into v_product from public.products where id = v_req.product_id;

  perform set_config('mazed.pro_admin', 'on', true);
  update public.pro_requests
     set status     = case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'cancelled' end,
         reason     = case when p_decision = 'approve' then null else v_reason end,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_request
  returning * into v_req;
  perform set_config('mazed.pro_admin', 'off', true);

  if p_decision = 'revoke' then
    update public.payments
       set status = 'failed', admin_notes = 'Validation de la demande retirée'
     where metadata ->> 'request_id' = v_req.id::text and status = 'pending';
  end if;

  -- A refused opening: the shop says so, with the reason, until they ask again.
  if p_decision = 'reject' and v_req.kind = 'opening' then
    perform set_config('mazed.shop_admin', 'on', true);
    update public.shops set status = 'rejected', rejection_reason = v_reason
     where id = v_req.shop_id and status = 'pending_review';
    perform set_config('mazed.shop_admin', 'off', true);
  end if;

  -- Stored in French, the product name quoted and the reason after « Motif : »,
  -- so an Arabic reader gets it re-worded (src/lib/notifications/localize.ts).
  begin
    if p_decision = 'approve' then
      perform public.enqueue_notification(
        v_req.requested_by, 'pro_request_approved', 'Demande acceptée',
        format('Votre demande « %s » est acceptée : vous pouvez payer pour l''activer.', v_product.name_fr),
        '/pro/dashboard/abonnement');
    elsif p_decision = 'reject' then
      perform public.enqueue_notification(
        v_req.requested_by, 'pro_request_rejected', 'Demande refusée',
        format('Votre demande « %s » n''a pas été acceptée. Motif : %s', v_product.name_fr, v_reason),
        '/pro/dashboard/abonnement');
    else
      perform public.enqueue_notification(
        v_req.requested_by, 'pro_request_revoked', 'Validation retirée',
        format('La validation de votre demande « %s » a été retirée. Motif : %s', v_product.name_fr, v_reason),
        '/pro/dashboard/abonnement');
    end if;
  exception when others then null;
  end;

  return jsonb_build_object('id', v_req.id, 'status', v_req.status, 'kind', v_req.kind, 'shop_id', v_req.shop_id);
end;
$$;

-- ── Payments wait for the approval ──────────────────────────────────────────

create or replace function public._payments_need_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product uuid;
  v_kind    text;
  v_req     public.pro_requests;
begin
  if new.kind not in ('subscription', 'promo') then
    return new;
  end if;
  begin
    v_product := (new.metadata ->> 'product_id')::uuid;
  exception when others then
    v_product := null;
  end;
  if v_product is null then
    return new;   -- an old promo from before boosts: it grants nothing (0191)
  end if;

  if new.kind = 'subscription' then
    if new.shop_id is null then
      return new; -- refused at capture anyway (0191, subscription_order_invalid)
    end if;
    v_kind := public.pro_request_kind(new.shop_id, v_product);
  else
    v_kind := public.pro_request_kind(new.shop_id, v_product);
    if v_kind is distinct from 'boost' then
      return new;
    end if;
  end if;
  if v_kind is null or not public.pro_approval_required(v_kind) then
    return new;
  end if;

  begin
    select * into v_req from public.pro_requests where id = (new.metadata ->> 'request_id')::uuid;
  exception when others then
    v_req := null;
  end;
  if v_req.id is null
     or v_req.status <> 'approved'
     or v_req.product_id <> v_product
     or v_req.shop_id is distinct from new.shop_id
     or (v_kind = 'boost' and v_req.listing_id::text is distinct from new.metadata ->> 'listing_id') then
    raise exception 'approval_required'
      using errcode = 'P0001', hint = 'This purchase needs a request approved by an admin first.';
  end if;
  return new;
end;
$$;

drop trigger if exists _payments_need_approval on public.payments;
create trigger _payments_need_approval
  before insert on public.payments
  for each row execute function public._payments_need_approval();

-- A captured payment completes the request it paid for.
create or replace function public._pro_request_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if new.status <> 'captured'
     or (tg_op = 'UPDATE' and old.status = 'captured')
     or not (new.metadata ? 'request_id') then
    return new;
  end if;
  begin
    v_id := (new.metadata ->> 'request_id')::uuid;
  exception when others then
    return new;
  end;
  update public.pro_requests
     set status = 'completed', payment_id = new.id
   where id = v_id and status = 'approved';
  return new;
end;
$$;

drop trigger if exists _pro_request_paid on public.payments;
create trigger _pro_request_paid
  after insert or update of status on public.payments
  for each row execute function public._pro_request_paid();

-- ── Grants and RLS ──────────────────────────────────────────────────────────

alter table public.pro_requests enable row level security;
revoke all on public.pro_requests from anon, authenticated;
grant select on public.pro_requests to authenticated;

drop policy if exists pro_requests_read on public.pro_requests;
create policy pro_requests_read on public.pro_requests for select to authenticated
  using (public.is_admin() or public.is_shop_member(shop_id));

revoke all on function public.pro_approval_required(text) from public, anon, authenticated;
grant execute on function public.pro_approval_required(text) to service_role;
revoke all on function public.pro_request_kind(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pro_request_kind(uuid, uuid) to service_role;
revoke all on function public.admin_decide_pro_request(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_pro_request(uuid, text, text) to authenticated;
revoke all on function public._pro_request_insert() from public, anon, authenticated;
revoke all on function public._pro_request_transition() from public, anon, authenticated;
revoke all on function public._pro_request_after() from public, anon, authenticated;
revoke all on function public._audit_pro_request() from public, anon, authenticated;
revoke all on function public._payments_need_approval() from public, anon, authenticated;
revoke all on function public._pro_request_paid() from public, anon, authenticated;

notify pgrst, 'reload schema';
