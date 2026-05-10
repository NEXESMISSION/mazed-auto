-- ============================================================
-- Mazed Auto — Admin action tables + RPCs
--
-- Tables:
--   user_warnings           — formal warnings issued to a user
--   user_bans               — graduated bans (temp suspend / permanent)
--   auction_edit_requests   — admin asks seller to fix something
--   contact_messages        — /contact form submissions inbox
--   admin_broadcasts        — broadcast notifications target audiences
--
-- RPCs:
--   admin_warn_user, admin_dismiss_warning
--   admin_ban_user, admin_unban_user
--   admin_request_auction_edit, admin_resolve_edit_request
--   admin_force_cancel_auction, admin_force_seller_decision
--   admin_force_end_auction, admin_extend_auction_end
--   admin_set_auction_featured, admin_set_auction_vip
--   admin_invalidate_bid
--   admin_reset_kyc, admin_set_ownership_verified, admin_set_pro
--   admin_void_transaction, admin_create_transaction
--   admin_broadcast_create
--
-- Depends on: migrate-admin-foundations.sql (admin_role, log_admin_action)
-- Safe to run repeatedly.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) user_warnings
-- ------------------------------------------------------------------
create table if not exists public.user_warnings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  severity     text not null check (severity in ('info','warning','severe')),
  body         text not null,
  related_auction_id uuid references public.auctions(id) on delete set null,
  related_report_id  uuid references public.reports(id) on delete set null,
  issued_by    uuid references auth.users(id) on delete set null,
  issued_at    timestamptz not null default now(),
  acknowledged_at timestamptz,
  dismissed_at    timestamptz
);

create index if not exists user_warnings_user_idx
  on public.user_warnings (user_id, issued_at desc);
create index if not exists user_warnings_active_idx
  on public.user_warnings (user_id) where dismissed_at is null;

alter table public.user_warnings enable row level security;
drop policy if exists "warnings_self_read" on public.user_warnings;
create policy "warnings_self_read" on public.user_warnings
  for select to authenticated using (
    user_id = auth.uid() or public.is_admin()
  );
drop policy if exists "warnings_self_ack" on public.user_warnings;
create policy "warnings_self_ack" on public.user_warnings
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------------
-- 2) user_bans
-- ------------------------------------------------------------------
-- Replaces the binary `sellers.is_active` flag with a graduated, audit-
-- friendly model. A user is "banned" if any active row exists here
-- with banned_until in the future (or null = permanent).
create table if not exists public.user_bans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  reason       text not null,
  scope        text not null default 'full'
                 check (scope in ('full','bidding','selling','messaging')),
  banned_at    timestamptz not null default now(),
  banned_until timestamptz, -- null = permanent
  banned_by    uuid references auth.users(id) on delete set null,
  lifted_at    timestamptz,
  lifted_by    uuid references auth.users(id) on delete set null,
  lift_reason  text
);

create index if not exists user_bans_user_idx
  on public.user_bans (user_id, banned_at desc);
-- Partial index on un-lifted bans only. We deliberately don't include
-- `banned_until > now()` in the predicate — index predicates require
-- IMMUTABLE expressions and now() is STABLE (42P17). Postgres can still
-- use this index for the lifted_at filter and apply the time check at
-- scan time, which is fine for a few rows per user.
create index if not exists user_bans_active_idx
  on public.user_bans (user_id, banned_until)
  where lifted_at is null;

alter table public.user_bans enable row level security;
drop policy if exists "bans_self_read" on public.user_bans;
create policy "bans_self_read" on public.user_bans
  for select to authenticated using (
    user_id = auth.uid() or public.is_admin()
  );

-- Convenience: is_user_banned(uuid) returns true if any active full ban row.
create or replace function public.is_user_banned(p_user_id uuid)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.user_bans
     where user_id = p_user_id
       and lifted_at is null
       and (banned_until is null or banned_until > now())
  );
$$;
grant execute on function public.is_user_banned(uuid) to authenticated, anon;

-- ------------------------------------------------------------------
-- 3) auction_edit_requests
-- ------------------------------------------------------------------
create table if not exists public.auction_edit_requests (
  id           uuid primary key default gen_random_uuid(),
  auction_id   uuid not null references public.auctions(id) on delete cascade,
  fields       text[] not null default '{}',
  message      text not null,
  status       text not null default 'open'
                 check (status in ('open','resolved','cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users(id) on delete set null
);

create index if not exists auction_edit_requests_auction_idx
  on public.auction_edit_requests (auction_id, requested_at desc);
create index if not exists auction_edit_requests_open_idx
  on public.auction_edit_requests (auction_id) where status = 'open';

alter table public.auction_edit_requests enable row level security;
drop policy if exists "edit_req_seller_read" on public.auction_edit_requests;
create policy "edit_req_seller_read" on public.auction_edit_requests
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.auctions a
      where a.id = auction_id and a.seller_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------
-- 4) contact_messages
-- ------------------------------------------------------------------
-- /contact form was previously mocked. This table backs an admin
-- inbox so support agents can triage contact form submissions.
create table if not exists public.contact_messages (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null,
  topic        text not null,
  body         text not null,
  user_id      uuid references auth.users(id) on delete set null,
  ip_address   inet,
  status       text not null default 'open'
                 check (status in ('open','reading','replied','closed')),
  reply_body   text,
  replied_by   uuid references auth.users(id) on delete set null,
  replied_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists contact_status_idx
  on public.contact_messages (status, created_at desc);

alter table public.contact_messages enable row level security;
drop policy if exists "contact_admin_read" on public.contact_messages;
create policy "contact_admin_read" on public.contact_messages
  for select to authenticated using (public.is_admin());
drop policy if exists "contact_public_insert" on public.contact_messages;
create policy "contact_public_insert" on public.contact_messages
  for insert with check (true);

-- ------------------------------------------------------------------
-- 5) admin_broadcasts
-- ------------------------------------------------------------------
-- Recorded broadcast messages. Sending fans out into the existing
-- `notifications` table (one row per recipient). audience filter is
-- captured for audit; recipient_count materialises the size at send
-- time so we don't recompute later.
create table if not exists public.admin_broadcasts (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  body            text not null,
  kind            text not null default 'system',
  audience        text not null default 'all'
                    check (audience in ('all','buyers','sellers','admins',
                                        'auction_bidders','custom')),
  audience_filter jsonb,
  recipient_count int not null default 0,
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.admin_broadcasts enable row level security;
drop policy if exists "broadcasts_admin_read" on public.admin_broadcasts;
create policy "broadcasts_admin_read" on public.admin_broadcasts
  for select to authenticated using (public.is_admin());

-- ============================================================
-- RPCs
-- ============================================================

-- ------------------------------------------------------------------
-- admin_warn_user
-- ------------------------------------------------------------------
create or replace function public.admin_warn_user(
  p_user_id           uuid,
  p_severity          text,
  p_body              text,
  p_related_auction_id uuid default null,
  p_related_report_id  uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_admin_capability('user.warn') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_severity not in ('info','warning','severe') then
    raise exception 'INVALID_SEVERITY';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'BODY_REQUIRED';
  end if;

  insert into public.user_warnings
    (user_id, severity, body, related_auction_id, related_report_id, issued_by)
  values
    (p_user_id, p_severity, p_body, p_related_auction_id, p_related_report_id, auth.uid())
  returning id into v_id;

  -- Push an in-app notification so the user sees it immediately.
  insert into public.notifications (user_id, kind, title, body, auction_id)
  values (p_user_id, 'system',
          case p_severity
            when 'severe' then 'Avertissement sévère'
            when 'warning' then 'Avertissement'
            else 'Information importante'
          end,
          p_body, p_related_auction_id);

  perform public.log_admin_action(
    'user.warn',
    p_target_user_id => p_user_id,
    p_target_id      => v_id,
    p_target_type    => 'user_warning',
    p_detail         => p_severity,
    p_metadata       => jsonb_build_object('body', p_body)
  );
  return v_id;
end; $$;
grant execute on function public.admin_warn_user(uuid, text, text, uuid, uuid)
  to authenticated;

-- ------------------------------------------------------------------
-- admin_ban_user / admin_unban_user
-- ------------------------------------------------------------------
create or replace function public.admin_ban_user(
  p_user_id      uuid,
  p_reason       text,
  p_scope        text default 'full',
  p_duration_days int default null  -- null = permanent
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_until timestamptz;
begin
  if not public.has_admin_capability('user.suspend') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_scope not in ('full','bidding','selling','messaging') then
    raise exception 'INVALID_SCOPE';
  end if;

  v_until := case
    when p_duration_days is null then null
    else now() + (p_duration_days || ' days')::interval
  end;

  insert into public.user_bans (user_id, reason, scope, banned_until, banned_by)
  values (p_user_id, p_reason, p_scope, v_until, auth.uid())
  returning id into v_id;

  -- Mirror to the legacy is_active flag for full bans so the existing
  -- code paths keep working (RLS on auctions/bids checks is_active in places).
  if p_scope = 'full' then
    update public.sellers set is_active = false where id = p_user_id;
  end if;

  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'system',
          case when v_until is null then 'Compte suspendu définitivement'
               else 'Compte suspendu temporairement' end,
          p_reason);

  perform public.log_admin_action(
    'user.ban',
    p_target_user_id => p_user_id,
    p_target_id      => v_id,
    p_target_type    => 'user_ban',
    p_detail         => p_scope || coalesce(' until ' || v_until::text, ' (permanent)'),
    p_metadata       => jsonb_build_object('reason', p_reason, 'duration_days', p_duration_days)
  );
  return v_id;
end; $$;
grant execute on function public.admin_ban_user(uuid, text, text, int) to authenticated;

create or replace function public.admin_unban_user(
  p_user_id uuid,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.suspend') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.user_bans
     set lifted_at = now(),
         lifted_by = auth.uid(),
         lift_reason = p_reason
   where user_id = p_user_id
     and lifted_at is null
     and (banned_until is null or banned_until > now());

  update public.sellers set is_active = true where id = p_user_id;

  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'system', 'Compte réactivé', coalesce(p_reason, 'Votre compte a été réactivé'));

  perform public.log_admin_action(
    'user.unban',
    p_target_user_id => p_user_id,
    p_detail         => p_reason
  );
end; $$;
grant execute on function public.admin_unban_user(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- admin_request_auction_edit / admin_resolve_edit_request
-- ------------------------------------------------------------------
create or replace function public.admin_request_auction_edit(
  p_auction_id uuid,
  p_fields     text[],
  p_message    text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_seller  uuid;
begin
  if not public.has_admin_capability('auction.edit_request') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_message is null or btrim(p_message) = '' then
    raise exception 'MESSAGE_REQUIRED';
  end if;

  select seller_id into v_seller from public.auctions where id = p_auction_id;
  if v_seller is null then
    raise exception 'AUCTION_NOT_FOUND';
  end if;

  insert into public.auction_edit_requests (auction_id, fields, message, requested_by)
  values (p_auction_id, coalesce(p_fields, '{}'), p_message, auth.uid())
  returning id into v_id;

  -- Send the seller back to pending_review-ish state so they can edit.
  -- We use a dedicated 'needs_changes' isn't in the existing CHECK so
  -- we keep status unchanged and rely on the open edit_request to
  -- surface the request in /seller/auctions.

  insert into public.notifications (user_id, kind, title, body, auction_id)
  values (v_seller, 'rejected',
          'Modification demandée par l''administration',
          p_message, p_auction_id);

  perform public.log_admin_action(
    'auction.edit_request',
    p_target_user_id    => v_seller,
    p_target_auction_id => p_auction_id,
    p_target_id         => v_id,
    p_target_type       => 'auction_edit_request',
    p_detail            => left(p_message, 200),
    p_metadata          => jsonb_build_object('fields', p_fields)
  );
  return v_id;
end; $$;
grant execute on function public.admin_request_auction_edit(uuid, text[], text)
  to authenticated;

create or replace function public.admin_resolve_edit_request(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('auction.edit_request') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.auction_edit_requests
     set status = 'resolved',
         resolved_at = now(),
         resolved_by = auth.uid()
   where id = p_request_id;
  perform public.log_admin_action(
    'auction.edit_request.resolve',
    p_target_id   => p_request_id,
    p_target_type => 'auction_edit_request'
  );
end; $$;
grant execute on function public.admin_resolve_edit_request(uuid) to authenticated;

-- ------------------------------------------------------------------
-- admin_force_cancel_auction
-- ------------------------------------------------------------------
-- Cancels an auction that already has bids. All deposits are flipped to
-- refunds, every bidder gets a "lost" / refund notif, and the audit log
-- captures who/why.
create or replace function public.admin_force_cancel_auction(
  p_auction_id uuid,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_dep    uuid;
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select seller_id into v_seller from public.auctions where id = p_auction_id;
  if v_seller is null then
    raise exception 'AUCTION_NOT_FOUND';
  end if;

  update public.auctions
     set status = 'cancelled',
         end_time = least(end_time, now())
   where id = p_auction_id;

  -- Refund every completed deposit on this auction.
  for v_dep in
    select id from public.transactions
     where auction_id = p_auction_id
       and type = 'deposit'
       and status = 'completed'
  loop
    insert into public.transactions
      (ref, user_id, user_label, auction_id, type, direction,
       amount, label, status)
    select 'TX-RFD-' || substr(gen_random_uuid()::text, 1, 8),
           t.user_id, t.user_label, t.auction_id,
           'refund', 'out', t.amount,
           'Remboursement caution (annulation par administration)',
           'completed'
      from public.transactions t where t.id = v_dep;
  end loop;

  -- Notify all bidders + the seller.
  insert into public.notifications (user_id, kind, title, body, auction_id)
  select distinct b.user_id, 'lost'::text,
         'Enchère annulée', p_reason, p_auction_id
    from public.bids b where b.auction_id = p_auction_id;

  insert into public.notifications (user_id, kind, title, body, auction_id)
  values (v_seller, 'rejected', 'Enchère annulée par l''administration',
          p_reason, p_auction_id);

  perform public.log_admin_action(
    'auction.force_cancel',
    p_target_user_id    => v_seller,
    p_target_auction_id => p_auction_id,
    p_detail            => p_reason
  );
end; $$;
grant execute on function public.admin_force_cancel_auction(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- admin_force_seller_decision
-- ------------------------------------------------------------------
-- Resolve a pending_seller_decision auction on the seller's behalf.
-- Choice: 'accept' or 'reject'. On accept, runs the same flow as
-- finalize_auction (winner gets payment_deadline, losers refunded).
-- On reject, all deposits refunded, status flipped to reserve_not_met.
create or replace function public.admin_force_seller_decision(
  p_auction_id uuid,
  p_choice     text,  -- 'accept' or 'reject'
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_choice not in ('accept','reject') then
    raise exception 'INVALID_CHOICE';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select seller_id into v_seller from public.auctions
   where id = p_auction_id and status = 'pending_seller_decision';
  if v_seller is null then
    raise exception 'NOT_PENDING_DECISION';
  end if;

  if p_choice = 'accept' then
    update public.auctions set status = 'ended' where id = p_auction_id;
    -- finalize_auction may already exist from migrate-auction-lifecycle;
    -- call it if so, otherwise the cron will pick it up.
    begin
      perform public.finalize_auction(p_auction_id);
    exception when undefined_function then
      null;
    end;
  else
    update public.auctions set status = 'reserve_not_met' where id = p_auction_id;

    -- Refund every completed deposit (rejection means nobody buys).
    insert into public.transactions
      (ref, user_id, user_label, auction_id, type, direction,
       amount, label, status)
    select 'TX-RFD-' || substr(gen_random_uuid()::text, 1, 8),
           t.user_id, t.user_label, t.auction_id,
           'refund', 'out', t.amount,
           'Remboursement caution (réserve non atteinte)',
           'completed'
      from public.transactions t
     where t.auction_id = p_auction_id
       and t.type = 'deposit'
       and t.status = 'completed';
  end if;

  insert into public.notifications (user_id, kind, title, body, auction_id)
  values (v_seller, 'system',
          'Décision finale prise par l''administration',
          coalesce(p_reason, p_choice), p_auction_id);

  perform public.log_admin_action(
    'auction.force_seller_decision',
    p_target_user_id    => v_seller,
    p_target_auction_id => p_auction_id,
    p_detail            => p_choice,
    p_metadata          => jsonb_build_object('reason', p_reason)
  );
end; $$;
grant execute on function public.admin_force_seller_decision(uuid, text, text)
  to authenticated;

-- ------------------------------------------------------------------
-- admin_force_end_auction / admin_extend_auction_end
-- ------------------------------------------------------------------
create or replace function public.admin_force_end_auction(
  p_auction_id uuid,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.auctions
     set end_time = now(),
         status = case when total_bids > 0 then 'ended' else 'cancelled' end
   where id = p_auction_id;
  perform public.log_admin_action(
    'auction.force_end',
    p_target_auction_id => p_auction_id,
    p_detail            => p_reason
  );
end; $$;
grant execute on function public.admin_force_end_auction(uuid, text) to authenticated;

create or replace function public.admin_extend_auction_end(
  p_auction_id uuid,
  p_minutes    int,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_minutes is null or p_minutes <= 0 then
    raise exception 'INVALID_MINUTES';
  end if;
  update public.auctions
     set end_time = end_time + make_interval(mins => p_minutes)
   where id = p_auction_id;
  perform public.log_admin_action(
    'auction.extend_end',
    p_target_auction_id => p_auction_id,
    p_detail            => p_minutes::text || ' minutes',
    p_metadata          => jsonb_build_object('reason', p_reason)
  );
end; $$;
grant execute on function public.admin_extend_auction_end(uuid, int, text) to authenticated;

-- ------------------------------------------------------------------
-- admin_set_auction_featured / vip
-- ------------------------------------------------------------------
create or replace function public.admin_set_auction_featured(
  p_auction_id uuid,
  p_featured   boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.auctions set is_featured = p_featured where id = p_auction_id;
  perform public.log_admin_action(
    'auction.set_featured',
    p_target_auction_id => p_auction_id,
    p_detail            => case when p_featured then 'on' else 'off' end
  );
end; $$;
grant execute on function public.admin_set_auction_featured(uuid, boolean) to authenticated;

create or replace function public.admin_set_auction_vip(
  p_auction_id uuid,
  p_vip        boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.auctions set is_vip = p_vip where id = p_auction_id;
  perform public.log_admin_action(
    'auction.set_vip',
    p_target_auction_id => p_auction_id,
    p_detail            => case when p_vip then 'on' else 'off' end
  );
end; $$;
grant execute on function public.admin_set_auction_vip(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------
-- admin_invalidate_bid
-- ------------------------------------------------------------------
-- Removes a fraudulent bid. Recomputes auction.current_price /
-- total_bids from the surviving bids.
create or replace function public.admin_invalidate_bid(
  p_bid_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction uuid;
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select auction_id into v_auction from public.bids where id = p_bid_id;
  if v_auction is null then raise exception 'BID_NOT_FOUND'; end if;

  delete from public.bids where id = p_bid_id;

  update public.auctions a set
    current_price = coalesce(
      (select max(amount) from public.bids where auction_id = v_auction),
      a.starting_price),
    total_bids = (select count(*) from public.bids where auction_id = v_auction),
    total_participants = (select count(distinct user_id) from public.bids
                           where auction_id = v_auction)
   where a.id = v_auction;

  perform public.log_admin_action(
    'bid.invalidate',
    p_target_auction_id => v_auction,
    p_target_id         => p_bid_id,
    p_target_type       => 'bid',
    p_detail            => p_reason
  );
end; $$;
grant execute on function public.admin_invalidate_bid(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- admin_reset_kyc / admin_set_ownership_verified / admin_set_pro
-- ------------------------------------------------------------------
create or replace function public.admin_reset_kyc(
  p_user_id uuid,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('kyc.review') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  update public.kyc_submissions
     set status = 'rejected',
         rejection_reason = coalesce(p_reason, 'Re-vérification demandée par administration'),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where user_id = p_user_id;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb)
       || jsonb_build_object('kycStatus','none')
   where id = p_user_id;

  update public.sellers set verified_kyc = false where id = p_user_id;

  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'system',
          'Re-vérification d''identité requise',
          coalesce(p_reason, 'Veuillez recommencer la vérification KYC'));

  perform public.log_admin_action(
    'kyc.reset',
    p_target_user_id => p_user_id,
    p_detail         => p_reason
  );
end; $$;
grant execute on function public.admin_reset_kyc(uuid, text) to authenticated;

create or replace function public.admin_set_ownership_verified(
  p_user_id uuid,
  p_value   boolean,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.warn') then -- moderator and up
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.sellers set verified_ownership = p_value where id = p_user_id;
  perform public.log_admin_action(
    'user.ownership_verified',
    p_target_user_id => p_user_id,
    p_detail         => case when p_value then 'verified' else 'cleared' end,
    p_metadata       => jsonb_build_object('reason', p_reason)
  );
end; $$;
grant execute on function public.admin_set_ownership_verified(uuid, boolean, text)
  to authenticated;

create or replace function public.admin_set_pro(
  p_user_id uuid,
  p_value   boolean,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_capability('user.warn') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.sellers set is_pro = p_value where id = p_user_id;
  perform public.log_admin_action(
    'user.set_pro',
    p_target_user_id => p_user_id,
    p_detail         => case when p_value then 'promoted' else 'demoted' end,
    p_metadata       => jsonb_build_object('reason', p_reason)
  );
end; $$;
grant execute on function public.admin_set_pro(uuid, boolean, text) to authenticated;

-- ------------------------------------------------------------------
-- admin_void_transaction / admin_create_transaction
-- ------------------------------------------------------------------
create or replace function public.admin_void_transaction(
  p_tx_id  uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_auction uuid;
begin
  if not public.has_admin_capability('transaction.void') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select user_id, auction_id into v_user, v_auction
    from public.transactions where id = p_tx_id;
  if v_user is null then raise exception 'TX_NOT_FOUND'; end if;

  update public.transactions
     set status = 'failed',
         label = label || ' (annulée: ' || coalesce(p_reason,'') || ')'
   where id = p_tx_id;

  perform public.log_admin_action(
    'transaction.void',
    p_target_user_id    => v_user,
    p_target_auction_id => v_auction,
    p_target_id         => p_tx_id,
    p_target_type       => 'transaction',
    p_detail            => p_reason
  );
end; $$;
grant execute on function public.admin_void_transaction(uuid, text) to authenticated;

create or replace function public.admin_create_transaction(
  p_user_id   uuid,
  p_type      text,         -- deposit | refund | final_payment | commission | payout
  p_direction text,         -- in | out
  p_amount    numeric,
  p_label     text,
  p_auction_id uuid default null,
  p_reason    text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_label text;
begin
  if not public.has_admin_capability('transaction.adjust') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_type not in ('deposit','refund','final_payment','commission','payout') then
    raise exception 'INVALID_TYPE';
  end if;
  if p_direction not in ('in','out') then
    raise exception 'INVALID_DIRECTION';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select coalesce(raw_user_meta_data ->> 'firstName','') || ' '
       || coalesce(raw_user_meta_data ->> 'lastName','') into v_label
    from auth.users where id = p_user_id;

  insert into public.transactions
    (ref, user_id, user_label, auction_id, type, direction,
     amount, label, status)
  values
    ('TX-ADM-' || substr(gen_random_uuid()::text, 1, 8),
     p_user_id, btrim(coalesce(v_label,'')), p_auction_id,
     p_type, p_direction, p_amount, p_label, 'completed')
  returning id into v_id;

  perform public.log_admin_action(
    'transaction.create',
    p_target_user_id    => p_user_id,
    p_target_auction_id => p_auction_id,
    p_target_id         => v_id,
    p_target_type       => 'transaction',
    p_detail            => p_type || ' ' || p_direction || ' ' || p_amount::text,
    p_metadata          => jsonb_build_object('reason', p_reason, 'label', p_label)
  );
  return v_id;
end; $$;
grant execute on function public.admin_create_transaction(uuid, text, text, numeric, text, uuid, text)
  to authenticated;

-- ------------------------------------------------------------------
-- admin_broadcast_create
-- ------------------------------------------------------------------
-- Fans out a system message to every recipient matching the audience
-- selector. Returns the broadcast id.
create or replace function public.admin_broadcast_create(
  p_title           text,
  p_body            text,
  p_kind            text default 'system',
  p_audience        text default 'all',
  p_audience_filter jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  if not public.has_admin_capability('broadcast.create') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_audience not in ('all','buyers','sellers','admins','auction_bidders','custom') then
    raise exception 'INVALID_AUDIENCE';
  end if;

  insert into public.admin_broadcasts (title, body, kind, audience, audience_filter, created_by)
  values (p_title, p_body, p_kind, p_audience, p_audience_filter, auth.uid())
  returning id into v_id;

  -- Fan out:
  if p_audience = 'all' then
    insert into public.notifications (user_id, kind, title, body)
    select id, p_kind, p_title, p_body from auth.users;
  elsif p_audience = 'buyers' then
    insert into public.notifications (user_id, kind, title, body)
    select id, p_kind, p_title, p_body from auth.users
     where (raw_user_meta_data ->> 'role') in ('buyer', null)
        or raw_user_meta_data ->> 'role' is null;
  elsif p_audience = 'sellers' then
    insert into public.notifications (user_id, kind, title, body)
    select id, p_kind, p_title, p_body from public.sellers;
  elsif p_audience = 'admins' then
    insert into public.notifications (user_id, kind, title, body)
    select id, p_kind, p_title, p_body from auth.users
     where raw_user_meta_data ->> 'role' = 'admin'
        or raw_user_meta_data ->> 'adminRole' is not null;
  elsif p_audience = 'auction_bidders' then
    insert into public.notifications (user_id, kind, title, body, auction_id)
    select distinct b.user_id, p_kind, p_title, p_body,
           (p_audience_filter ->> 'auction_id')::uuid
      from public.bids b
     where b.auction_id = (p_audience_filter ->> 'auction_id')::uuid;
  end if;

  get diagnostics v_count = row_count;
  update public.admin_broadcasts
     set recipient_count = v_count, sent_at = now()
   where id = v_id;

  perform public.log_admin_action(
    'broadcast.create',
    p_target_id => v_id,
    p_target_type => 'admin_broadcast',
    p_detail => p_audience || ' (' || v_count || ' recipients)'
  );
  return v_id;
end; $$;
grant execute on function public.admin_broadcast_create(text, text, text, text, jsonb)
  to authenticated;
