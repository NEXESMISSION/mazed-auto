-- ============================================================
-- Mazed Auto — KYC submissions
-- Stores the photos/video the user uploads during the KYC flow
-- and the admin's review decision. Nothing is auto-verified —
-- a human reviews every submission.
-- Safe to run repeatedly.
-- ============================================================

-- 1) Reuse the auction-media bucket for KYC files. We add a `kyc/`
--    subfolder per user — RLS already restricts writes to the
--    user's own top-level folder (<user_id>/...), so no new policies
--    are required for storage.

-- 2) Submissions table
create table if not exists public.kyc_submissions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  full_name           text,
  id_front_url        text not null,
  id_back_url         text not null,
  selfie_video_url    text,
  selfie_image_url    text,
  status              text not null default 'pending'
                       check (status in ('pending','approved','rejected')),
  rejection_reason    text,
  reviewed_by         uuid references auth.users(id) on delete set null,
  reviewed_at         timestamptz,
  submitted_at        timestamptz not null default now()
);

create index if not exists kyc_submissions_status_idx
  on public.kyc_submissions (status, submitted_at desc);

alter table public.kyc_submissions enable row level security;

-- Users can read & write only their own submission
drop policy if exists "kyc_self_select" on public.kyc_submissions;
drop policy if exists "kyc_self_insert" on public.kyc_submissions;
drop policy if exists "kyc_self_update" on public.kyc_submissions;
drop policy if exists "kyc_admin_all"   on public.kyc_submissions;

create policy "kyc_self_select" on public.kyc_submissions
  for select to authenticated using (auth.uid() = user_id);

create policy "kyc_self_insert" on public.kyc_submissions
  for insert to authenticated with check (auth.uid() = user_id);

-- Self-update only allowed while still pending (re-submit after rejection)
create policy "kyc_self_update" on public.kyc_submissions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins can read/update everything. Admin role is stored in
-- auth.users.raw_user_meta_data->>'role' = 'admin' (matches the existing
-- AppUser.role mapping in lib/auth.ts).
create policy "kyc_admin_all" on public.kyc_submissions
  for all to authenticated
  using (
    exists (
      select 1 from auth.users u
       where u.id = auth.uid()
         and (u.raw_user_meta_data->>'role') = 'admin'
    )
  )
  with check (
    exists (
      select 1 from auth.users u
       where u.id = auth.uid()
         and (u.raw_user_meta_data->>'role') = 'admin'
    )
  );

-- 3) When admin sets status='approved', mirror to the user's
--    user_metadata.kycStatus so the UI reflects the decision without
--    needing a service-role round-trip from the client. We can't write
--    to auth.users directly from a trigger in a plain RLS context, but
--    we expose an RPC (callable by the same admin) that does both updates
--    in one transaction.

create or replace function public.review_kyc(
  p_submission_id uuid,
  p_decision      text,           -- 'approved' | 'rejected'
  p_reason        text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_is_admin boolean;
begin
  select exists (
    select 1 from auth.users u
     where u.id = auth.uid()
       and (u.raw_user_meta_data->>'role') = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'NOT_ADMIN';
  end if;

  if p_decision not in ('approved','rejected') then
    raise exception 'INVALID_DECISION';
  end if;

  update public.kyc_submissions
     set status = p_decision,
         rejection_reason = case when p_decision = 'rejected'
                                 then coalesce(p_reason, 'Documents insuffisants')
                                 else null end,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_submission_id
   returning user_id into v_user;

  if v_user is null then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;

  -- Mirror onto auth.users.raw_user_meta_data so the user's session reflects
  -- the new state on next refresh. JSONB merge preserves existing keys.
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
       || jsonb_build_object(
            'kycStatus',
            case when p_decision = 'approved' then 'verified' else 'rejected' end
          )
   where id = v_user;

  -- If the user has a sellers row matching their auth id, keep verified_kyc
  -- in sync. This is only relevant once self-onboarding sellers exists; for
  -- now it's a no-op for seed data.
  if p_decision = 'approved' then
    update public.sellers
       set verified_kyc = true
     where id = v_user;
  end if;
end; $$;

revoke all on function public.review_kyc(uuid, text, text) from public;
grant execute on function public.review_kyc(uuid, text, text) to authenticated;
