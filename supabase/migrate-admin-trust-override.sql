-- ============================================================
-- Mazed Auto — Admin manual trust score adjustment
--
-- Most trust-score moves happen automatically (KYC pass, successful
-- deals, ratings, reports). For exceptional cases — admin discretion
-- after a fraud investigation, support escalation, etc. — an admin
-- needs to be able to bump or dock the score directly with a reason
-- recorded for audit.
--
-- Depends on: migrate-rls-admin-fix.sql (provides public.is_admin()).
-- Safe to run repeatedly.
-- ============================================================

-- 1) Audit table for manual adjustments. Always recorded, never auto-
--    pruned — this is the paper trail for "why did the admin change
--    this user's trust score?".
create table if not exists public.trust_adjustments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  delta        int not null,
  before_score int not null,
  after_score  int not null,
  reason       text not null,
  changed_by   uuid references auth.users(id) on delete set null,
  changed_at   timestamptz not null default now()
);

create index if not exists trust_adjustments_user_idx
  on public.trust_adjustments (user_id, changed_at desc);

alter table public.trust_adjustments enable row level security;
drop policy if exists "trust_adjust_admin_read" on public.trust_adjustments;
create policy "trust_adjust_admin_read" on public.trust_adjustments
  for select to authenticated using (public.is_admin());

-- 2) RPC: adjust trust score by delta. Admin-only.
create or replace function public.admin_adjust_trust(
  p_user_id uuid,
  p_delta   int,
  p_reason  text
)
returns void
language plpgsql
security definer
as $$
declare
  v_caller uuid := auth.uid();
  v_before int;
  v_after  int;
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select trust_score into v_before from public.sellers
   where id = p_user_id for update;
  if v_before is null then
    raise exception 'SELLER_NOT_FOUND';
  end if;

  v_after := greatest(0, least(500, v_before + p_delta));

  update public.sellers
     set trust_score = v_after
   where id = p_user_id;

  insert into public.trust_adjustments
    (user_id, delta, before_score, after_score, reason, changed_by)
  values
    (p_user_id, p_delta, v_before, v_after, p_reason, v_caller);
end;
$$;

grant execute on function public.admin_adjust_trust(uuid, int, text) to authenticated;
