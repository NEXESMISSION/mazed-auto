-- ============================================================
-- Mazed Auto — Admin Sprint A
--
-- Closes the most painful day-to-day gaps in the admin:
--   * direct auction edit (not just "request edit")
--   * force re-verify email / phone
--   * bulk KYC + auction queue actions
--   * admin → user 1:1 DM
--   * auction status timeline
--   * one-click refund a specific deposit
--   * maintenance-mode flag
--
-- Depends on: migrate-admin-foundations.sql, migrate-admin-actions.sql,
--             migrate-cms.sql (notification_templates).
-- Safe to run repeatedly.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) auction_status_log + trigger
-- ------------------------------------------------------------------
-- When an auction's status changes (manual admin action, cron sweep,
-- bid trigger pushing it to "ending"), we record a row here so the
-- admin auction detail page can show a timeline. Pre-existing
-- admin_audit_log captures the actor; this table captures the
-- *transition* regardless of who/what triggered it.

create table if not exists public.auction_status_log (
  id           uuid primary key default gen_random_uuid(),
  auction_id   uuid not null references public.auctions(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  actor_id     uuid references auth.users(id) on delete set null,
  detail       text,
  created_at   timestamptz not null default now()
);

create index if not exists auction_status_log_auction_idx
  on public.auction_status_log (auction_id, created_at desc);

alter table public.auction_status_log enable row level security;
drop policy if exists "auction_status_log_admin_read" on public.auction_status_log;
create policy "auction_status_log_admin_read" on public.auction_status_log
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.auctions a
                where a.id = auction_id and a.seller_id = auth.uid())
  );

create or replace function public.log_auction_status_change()
returns trigger language plpgsql security definer as $$
begin
  if (TG_OP = 'INSERT') or (new.status is distinct from old.status) then
    insert into public.auction_status_log (auction_id, from_status, to_status, actor_id)
    values (new.id, case when TG_OP = 'INSERT' then null else old.status end,
            new.status, auth.uid());
  end if;
  return new;
end; $$;

drop trigger if exists trg_auction_status_log on public.auctions;
create trigger trg_auction_status_log
after insert or update of status on public.auctions
for each row execute function public.log_auction_status_change();

-- ------------------------------------------------------------------
-- 2) admin_edit_auction
-- ------------------------------------------------------------------
-- Patch any subset of editable auction fields. Validates types,
-- writes via the existing UPDATE policy (admin RLS), records an
-- audit row with the diff so reviewers know exactly what changed.
--
-- Whitelist of editable fields lives in this function — extending
-- it is a deliberate, reviewed change.

create or replace function public.admin_edit_auction(
  p_auction_id uuid,
  p_patch      jsonb,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_keys text[] := array[]::text[];
  v_unknown text[] := array[]::text[];
  v_allowed text[] := array[
    'make','model','year','mileage','fuel_type','transmission','color',
    'condition','category','description','features','city','region',
    'image_urls','video_url',
    'starting_price','reserve_price','buy_now_price',
    'bid_increment','start_time','end_time','original_end_time',
    'is_featured','is_vip',
    'carte_grise_owner_name','ownership_exception'
  ];
  v_key text;
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'PATCH_REQUIRED';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key = any(v_allowed) then
      v_keys := array_append(v_keys, v_key);
    else
      v_unknown := array_append(v_unknown, v_key);
    end if;
  end loop;

  if array_length(v_unknown, 1) > 0 then
    raise exception 'UNKNOWN_FIELD: %', array_to_string(v_unknown, ',');
  end if;
  if array_length(v_keys, 1) is null or array_length(v_keys, 1) = 0 then
    raise exception 'EMPTY_PATCH';
  end if;

  -- Snapshot before/after for audit detail.
  select to_jsonb(a) - 'created_at' into v_old
    from public.auctions a where a.id = p_auction_id;
  if v_old is null then raise exception 'AUCTION_NOT_FOUND'; end if;

  update public.auctions a
     set make            = coalesce(p_patch ->> 'make', a.make),
         model           = coalesce(p_patch ->> 'model', a.model),
         year            = coalesce((p_patch ->> 'year')::int, a.year),
         mileage         = coalesce((p_patch ->> 'mileage')::int, a.mileage),
         fuel_type       = coalesce(p_patch ->> 'fuel_type', a.fuel_type),
         transmission    = coalesce(p_patch ->> 'transmission', a.transmission),
         color           = coalesce(p_patch ->> 'color', a.color),
         condition       = coalesce(p_patch ->> 'condition', a.condition),
         category        = coalesce(p_patch ->> 'category', a.category),
         description     = case when p_patch ? 'description' then p_patch ->> 'description' else a.description end,
         features        = case when p_patch ? 'features'
                                  then (select array_agg(value::text)
                                          from jsonb_array_elements_text(p_patch -> 'features'))
                                else a.features end,
         city            = coalesce(p_patch ->> 'city', a.city),
         region          = coalesce(p_patch ->> 'region', a.region),
         image_urls      = case when p_patch ? 'image_urls'
                                  then (select array_agg(value::text)
                                          from jsonb_array_elements_text(p_patch -> 'image_urls'))
                                else a.image_urls end,
         video_url       = case when p_patch ? 'video_url' then p_patch ->> 'video_url' else a.video_url end,
         starting_price  = coalesce((p_patch ->> 'starting_price')::numeric, a.starting_price),
         reserve_price   = case when p_patch ? 'reserve_price'
                                  then nullif(p_patch ->> 'reserve_price','')::numeric
                                else a.reserve_price end,
         buy_now_price   = case when p_patch ? 'buy_now_price'
                                  then nullif(p_patch ->> 'buy_now_price','')::numeric
                                else a.buy_now_price end,
         bid_increment   = coalesce((p_patch ->> 'bid_increment')::numeric, a.bid_increment),
         start_time      = coalesce((p_patch ->> 'start_time')::timestamptz, a.start_time),
         end_time        = coalesce((p_patch ->> 'end_time')::timestamptz, a.end_time),
         original_end_time = coalesce((p_patch ->> 'original_end_time')::timestamptz, a.original_end_time),
         is_featured     = coalesce((p_patch ->> 'is_featured')::boolean, a.is_featured),
         is_vip          = coalesce((p_patch ->> 'is_vip')::boolean, a.is_vip),
         carte_grise_owner_name = case when p_patch ? 'carte_grise_owner_name'
                                      then p_patch ->> 'carte_grise_owner_name'
                                    else a.carte_grise_owner_name end,
         ownership_exception    = case when p_patch ? 'ownership_exception'
                                      then nullif(p_patch ->> 'ownership_exception','')
                                    else a.ownership_exception end
   where a.id = p_auction_id;

  select to_jsonb(a) - 'created_at' into v_new
    from public.auctions a where a.id = p_auction_id;

  perform public.log_admin_action(
    'auction.edit',
    p_target_auction_id => p_auction_id,
    p_target_type       => 'auction',
    p_detail            => 'fields=' || array_to_string(v_keys, ','),
    p_metadata          => jsonb_build_object('reason', p_reason, 'before', v_old, 'after', v_new)
  );
end; $$;
grant execute on function public.admin_edit_auction(uuid, jsonb, text) to authenticated;

-- ------------------------------------------------------------------
-- 3) admin_reset_email / admin_reset_phone
-- ------------------------------------------------------------------
-- Forces re-verification by clearing the corresponding confirmed_at.
-- The user then sees the verify-email / verify-phone screens at
-- next login.

create or replace function public.admin_reset_email_verification(
  p_user_id uuid,
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
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  update auth.users set email_confirmed_at = null where id = p_user_id;

  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'system',
          'Re-vérification email requise',
          coalesce(p_reason, 'Veuillez confirmer à nouveau votre adresse email'));

  perform public.log_admin_action(
    'user.reset_email',
    p_target_user_id => p_user_id,
    p_detail         => p_reason
  );
end; $$;
grant execute on function public.admin_reset_email_verification(uuid, text) to authenticated;

create or replace function public.admin_reset_phone_verification(
  p_user_id uuid,
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
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  update auth.users set phone_confirmed_at = null where id = p_user_id;

  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'system',
          'Re-vérification téléphone requise',
          coalesce(p_reason, 'Veuillez confirmer à nouveau votre numéro de téléphone'));

  perform public.log_admin_action(
    'user.reset_phone',
    p_target_user_id => p_user_id,
    p_detail         => p_reason
  );
end; $$;
grant execute on function public.admin_reset_phone_verification(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- 4) Bulk operations
-- ------------------------------------------------------------------

-- Bulk KYC review: same decision + reason for many submissions.
create or replace function public.admin_bulk_review_kyc(
  p_submission_ids uuid[],
  p_decision       text,
  p_reason         text default null
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_count int := 0;
begin
  if not public.has_admin_capability('kyc.review') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'INVALID_DECISION';
  end if;
  if p_submission_ids is null or array_length(p_submission_ids, 1) is null then
    return 0;
  end if;

  foreach v_id in array p_submission_ids loop
    begin
      perform public.review_kyc(v_id, p_decision, p_reason);
      v_count := v_count + 1;
    exception when others then
      -- Skip individual failures so the rest of the batch still applies.
      perform public.log_admin_action(
        'kyc.bulk_review.skip',
        p_target_id   => v_id,
        p_target_type => 'kyc_submission',
        p_detail      => SQLERRM
      );
    end;
  end loop;

  perform public.log_admin_action(
    'kyc.bulk_review',
    p_detail   => p_decision || ' x' || v_count,
    p_metadata => jsonb_build_object('count', v_count, 'reason', p_reason)
  );
  return v_count;
end; $$;
grant execute on function public.admin_bulk_review_kyc(uuid[], text, text) to authenticated;

-- Bulk auction approve (status="active"). Same end_time logic as the
-- single-row path: end_time = now() + (original_end_time − start_time).
create or replace function public.admin_bulk_approve_auctions(
  p_auction_ids uuid[]
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
  v_now timestamptz := now();
  v_end timestamptz;
  v_seller uuid;
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_auction_ids is null or array_length(p_auction_ids, 1) is null then
    return 0;
  end if;

  for r in select id, seller_id, start_time, original_end_time
             from public.auctions
            where id = any(p_auction_ids) and status = 'pending_review'
  loop
    v_end := v_now + (coalesce(r.original_end_time, v_now + interval '7 days') - coalesce(r.start_time, v_now));
    update public.auctions
       set status = 'active',
           start_time = v_now,
           end_time = v_end,
           original_end_time = v_end
     where id = r.id;

    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (r.seller_id, r.id, 'approved',
            'Enchère approuvée',
            'Votre annonce est en ligne.');
    v_count := v_count + 1;
  end loop;

  perform public.log_admin_action(
    'auction.bulk_approve',
    p_detail => 'count=' || v_count
  );
  return v_count;
end; $$;
grant execute on function public.admin_bulk_approve_auctions(uuid[]) to authenticated;

create or replace function public.admin_bulk_reject_auctions(
  p_auction_ids uuid[],
  p_reason      text
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  if not public.has_admin_capability('auction.moderate') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_auction_ids is null or array_length(p_auction_ids, 1) is null then
    return 0;
  end if;

  for r in select id, seller_id from public.auctions
            where id = any(p_auction_ids) and status in ('pending_review','scheduled')
  loop
    update public.auctions set status = 'cancelled' where id = r.id;
    insert into public.notifications (user_id, auction_id, kind, title, body)
    values (r.seller_id, r.id, 'rejected', 'Enchère refusée', p_reason);
    v_count := v_count + 1;
  end loop;

  perform public.log_admin_action(
    'auction.bulk_reject',
    p_detail   => 'count=' || v_count,
    p_metadata => jsonb_build_object('reason', p_reason)
  );
  return v_count;
end; $$;
grant execute on function public.admin_bulk_reject_auctions(uuid[], text) to authenticated;

-- ------------------------------------------------------------------
-- 5) admin_dm_user — 1:1 admin → user system message
-- ------------------------------------------------------------------
-- Lighter than a broadcast: targets a single user, written into the
-- existing notifications table with a custom title/body. Logged.

create or replace function public.admin_dm_user(
  p_user_id uuid,
  p_title   text,
  p_body    text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_admin_capability('broadcast.create') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_title is null or btrim(p_title) = '' or p_body is null or btrim(p_body) = '' then
    raise exception 'TITLE_AND_BODY_REQUIRED';
  end if;

  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'system', p_title, p_body)
  returning id into v_id;

  perform public.log_admin_action(
    'user.dm',
    p_target_user_id => p_user_id,
    p_target_id      => v_id,
    p_target_type    => 'notification',
    p_detail         => left(p_title, 100)
  );
  return v_id;
end; $$;
grant execute on function public.admin_dm_user(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------
-- 6) admin_refund_deposit — one-click refund a single deposit tx
-- ------------------------------------------------------------------
-- Marks the source deposit as completed (idempotent — was already
-- "completed" if it landed normally) and writes a paired refund row.

create or replace function public.admin_refund_deposit(
  p_tx_id  uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src record;
  v_id  uuid;
begin
  if not public.has_admin_capability('transaction.refund') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_src from public.transactions where id = p_tx_id;
  if v_src is null then raise exception 'TX_NOT_FOUND'; end if;
  if v_src.type <> 'deposit' then raise exception 'NOT_A_DEPOSIT'; end if;

  -- Refuse to double-refund: bail if a refund row already exists for
  -- the same (user, auction) pair on or after this deposit.
  if exists (
    select 1 from public.transactions
     where user_id    = v_src.user_id
       and auction_id = v_src.auction_id
       and type       = 'refund'
       and created_at >= v_src.created_at
  ) then
    raise exception 'ALREADY_REFUNDED';
  end if;

  insert into public.transactions
    (ref, user_id, user_label, auction_id, type, direction,
     amount, label, status)
  values
    ('TX-RFD-' || substr(gen_random_uuid()::text, 1, 8),
     v_src.user_id, v_src.user_label, v_src.auction_id,
     'refund', 'in', v_src.amount,
     'Remboursement caution — ' || coalesce(p_reason, 'décision admin'),
     'completed')
  returning id into v_id;

  insert into public.notifications (user_id, auction_id, kind, title, body)
  values (v_src.user_id, v_src.auction_id, 'deposit_refunded',
          'Caution remboursée',
          coalesce(p_reason, 'Remboursement effectué.'));

  perform public.log_admin_action(
    'transaction.refund',
    p_target_user_id    => v_src.user_id,
    p_target_auction_id => v_src.auction_id,
    p_target_id         => v_id,
    p_target_type       => 'transaction',
    p_detail            => p_reason
  );
  return v_id;
end; $$;
grant execute on function public.admin_refund_deposit(uuid, text) to authenticated;

-- ------------------------------------------------------------------
-- 7) Maintenance mode — settings key
-- ------------------------------------------------------------------
insert into public.platform_settings (key, value, type, category, description, sensitive, requires_approval)
values
  ('system.maintenance_mode',         'false'::jsonb, 'boolean', 'system',
   'When true, the public site shows a read-only banner and writes (bid, payment, listing) refuse. Admin paths stay open.',
   false, false),
  ('system.maintenance_message_fr',
   '"Mazed Auto est en maintenance. Les enchères sont temporairement en lecture seule."'::jsonb,
   'string', 'system',
   'Banner message shown to users when maintenance mode is on (FR).',
   false, false),
  ('system.maintenance_message_ar',
   '"موقع مزاد أوتو في وضع الصيانة. المزادات في وضع القراءة فقط مؤقتًا."'::jsonb,
   'string', 'system',
   'Banner message shown to users when maintenance mode is on (AR).',
   false, false)
on conflict (key) do nothing;

-- ------------------------------------------------------------------
-- 8) admin_session_self — what's MY current session?
-- ------------------------------------------------------------------
-- Powers the /admin/me page: returns the calling admin's last-seen,
-- audit-action count, role, etc. Read-only convenience.

create or replace function public.admin_self_summary()
returns table (
  admin_role     text,
  email          text,
  display_name   text,
  recent_actions bigint,
  last_seen      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then raise exception 'AUTH_REQUIRED'; end if;
  return query
  select
    public.admin_role()::text,
    (select email::text from auth.users where id = v_id),
    coalesce(
      (select s.display_name from public.sellers s where s.id = v_id),
      (select btrim(coalesce(u.raw_user_meta_data ->> 'firstName','') || ' ' ||
                    coalesce(u.raw_user_meta_data ->> 'lastName',''))
         from auth.users u where u.id = v_id)
    )::text,
    (select count(*) from public.admin_audit_log
       where actor_id = v_id and created_at > now() - interval '30 days')::bigint,
    (select max(last_seen) from public.admin_sessions where user_id = v_id);
end; $$;
grant execute on function public.admin_self_summary() to authenticated;
