-- ============================================================
-- Mazed Auto — Wire the dormant notification kinds + SUB-6 bilingual
-- features.
--
-- After round 16, the `notifications.kind` CHECK constraint allows 22
-- kinds but only 9 were ever inserted. This migration brings 4 more
-- into production:
--   - `review_kyc()`        → kyc_approved / kyc_rejected (replaces "system")
--   - `admin_ban_user()`    → account_blocked (replaces "system")
--   - `complete_subscription_from_payment` → payment_received (replaces "system")
--
-- It also adds `cms_subscription_plans.features_ar TEXT[]` so the
-- per-plan bullet list on /pricing isn't French-only (SUB-6). The reader
-- in lib/cms.ts will pick `features_ar` when locale=ar, falling back to
-- `features` otherwise.
--
-- Safe to run repeatedly.
-- ============================================================

-- 1) cms_subscription_plans.features_ar -----------------------------------
alter table public.cms_subscription_plans
  add column if not exists features_ar text[] default '{}'::text[];


-- 2) review_kyc → kyc_approved / kyc_rejected notification ----------------
-- The trust-score bump + sellers.verified_kyc flip happen as before;
-- we only add the right-kinded notification so the user gets a
-- properly-categorised alert and the focus-refresh JWT trick in
-- round 6 flips their UI chip.
create or replace function public.review_kyc(
  p_submission_id uuid,
  p_decision      text,
  p_reason        text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'INVALID_DECISION';
  end if;

  v_reason := case when p_decision = 'rejected'
                   then coalesce(p_reason, 'Documents insuffisants')
                   else null end;

  update public.kyc_submissions
     set status = p_decision,
         rejection_reason = v_reason,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_submission_id
   returning user_id into v_user;

  if v_user is null then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
       || jsonb_build_object(
            'kycStatus',
            case when p_decision = 'approved' then 'verified' else 'rejected' end
          )
   where id = v_user;

  if p_decision = 'approved' then
    update public.sellers
       set verified_kyc = true
     where id = v_user;
    if not public.notification_recent_unread(v_user, 'kyc_approved', null, 300) then
      insert into public.notifications (user_id, kind, title, body)
      values (v_user, 'kyc_approved',
              'Identité vérifiée ✓',
              'Votre KYC a été approuvé. Vous pouvez désormais enchérir et publier des annonces.');
    end if;
  else
    if not public.notification_recent_unread(v_user, 'kyc_rejected', null, 300) then
      insert into public.notifications (user_id, kind, title, body)
      values (v_user, 'kyc_rejected',
              'Vérification d''identité refusée',
              coalesce(v_reason, 'Documents insuffisants. Vous pouvez recommencer depuis /kyc/start.'));
    end if;
  end if;
end; $$;

revoke all on function public.review_kyc(uuid, text, text)  from public;
grant execute on function public.review_kyc(uuid, text, text)  to authenticated;


-- 3) admin_ban_user → account_blocked notification ------------------------
create or replace function public.admin_ban_user(
  p_user_id      uuid,
  p_reason       text,
  p_scope        text default 'full',
  p_duration_days int default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_until timestamptz;
  v_title text;
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

  if p_scope = 'full' then
    update public.sellers set is_active = false where id = p_user_id;
  end if;

  v_title := case
    when v_until is null then 'Compte suspendu définitivement'
    else 'Compte suspendu temporairement'
  end;

  -- Use the v2 `account_blocked` kind so the notification surface routes
  -- it to /profile (kindMeta entry, round 16) instead of the generic
  -- "system" tray.
  insert into public.notifications (user_id, kind, title, body)
  values (p_user_id, 'account_blocked', v_title, p_reason);

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


-- 4) complete_subscription_from_payment → payment_received notification ---
-- Currently inserts a generic "system" kind. payment_received is more
-- specific and routes to /transactions where the user can see the ledger
-- entry. Preserves all the other activation behaviour.
create or replace function public.complete_subscription_from_payment(
  p_subscription_id uuid,
  p_provider_ref    text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_sub    record;
  v_plan   record;
begin
  select * into v_sub
    from public.user_subscriptions
   where id = p_subscription_id
   for update;

  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;
  if v_sub.status <> 'pending_payment' then
    return v_sub.id;
  end if;

  if v_caller is not null
     and v_caller <> v_sub.user_id
     and coalesce(public.admin_role(), '') <> 'super_admin' then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_plan
    from public.cms_subscription_plans
   where slug = v_sub.plan_slug;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;

  update public.user_subscriptions
     set status = 'expired',
         expires_at = now(),
         updated_at = now()
   where user_id = v_sub.user_id
     and id <> v_sub.id
     and status in ('active','cancelled')
     and (expires_at is null or expires_at > now());

  update public.user_subscriptions
     set status               = 'active',
         current_period_start = now(),
         current_period_end   = now() + interval '30 days',
         expires_at           = now() + interval '30 days',
         payment_provider_ref = coalesce(p_provider_ref, payment_provider_ref),
         activated_at         = now(),
         updated_at           = now()
   where id = v_sub.id;

  update public.sellers set is_pro = true where id = v_sub.user_id;

  insert into public.transactions (ref, user_id, auction_id, type, direction, amount, label, status)
  values (
    'TX-SUB-' || substring(gen_random_uuid()::text from 1 for 8),
    v_sub.user_id, null, 'commission', 'in',
    coalesce(v_sub.payment_amount, v_plan.monthly_price),
    'Abonnement ' || v_plan.name_fr || ' (30 jours)',
    'completed'
  );

  if not public.notification_recent_unread(v_sub.user_id, 'payment_received', null, 300) then
    insert into public.notifications (user_id, kind, title, body)
    values (v_sub.user_id, 'payment_received',
      'Abonnement activé',
      'Votre plan ' || v_plan.name_fr || ' est actif pour les 30 prochains jours.');
  end if;

  return v_sub.id;
end; $$;

grant execute on function public.complete_subscription_from_payment(uuid, text) to authenticated, anon;


-- Diagnostic ----------------------------------------------------------------
do $$
begin
  raise notice 'review_kyc / admin_ban_user / complete_subscription_from_payment use kyc_approved / kyc_rejected / account_blocked / payment_received kinds; features_ar column added';
end $$;
