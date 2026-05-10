-- ============================================================
-- Mazed Auto — Payouts queue
--
-- When an auction completes successfully and the buyer has paid in
-- full, the seller is owed (sale_price − commission − VAT). Today
-- there's no surface for the platform to track which sellers are
-- owed money or mark a wire transfer complete. This migration adds
-- the payouts ledger + RPCs to create / mark-paid / cancel a payout.
--
-- Depends on: migrate-admin-foundations.sql
-- Safe to run repeatedly.
-- ============================================================

create table if not exists public.payouts (
  id              uuid primary key default gen_random_uuid(),
  seller_id       uuid not null references auth.users(id) on delete cascade,
  auction_id      uuid references public.auctions(id) on delete set null,
  gross_amount    numeric(12,2) not null,
  commission      numeric(12,2) not null default 0,
  tva             numeric(12,2) not null default 0,
  net_amount      numeric(12,2) not null,
  rib             text,           -- Tunisian bank account
  bank_name       text,
  status          text not null default 'pending'
                     check (status in ('pending','approved','paid','cancelled')),
  approved_by     uuid references auth.users(id) on delete set null,
  approved_at     timestamptz,
  paid_at         timestamptz,
  paid_by         uuid references auth.users(id) on delete set null,
  paid_reference  text,           -- bank reference / wire id
  cancelled_reason text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists payouts_seller_idx
  on public.payouts (seller_id, created_at desc);
create index if not exists payouts_status_idx
  on public.payouts (status, created_at desc);

-- Add a parallel FK to public.sellers so PostgREST can auto-resolve
-- relation embeds like .select("*, seller:sellers(...)"). The original
-- FK to auth.users(id) stays for referential integrity (auth.users is
-- the source of truth for ids). Both are pointing at the same uuid,
-- which is fine.
do $$ begin
  alter table public.payouts
    add constraint payouts_seller_fk_sellers
    foreign key (seller_id) references public.sellers(id) on delete cascade;
exception
  when duplicate_object then null;
  when invalid_foreign_key then null; -- sellers row may not exist yet for some seller_ids
end $$;

alter table public.payouts enable row level security;
drop policy if exists "payouts_self_read" on public.payouts;
create policy "payouts_self_read" on public.payouts
  for select to authenticated using (
    seller_id = auth.uid() or public.is_admin()
  );

-- RPC: queue a payout (typically called automatically when a
-- final_payment transaction lands, but exposed for manual use too).
create or replace function public.admin_create_payout(
  p_seller_id  uuid,
  p_auction_id uuid,
  p_gross      numeric,
  p_commission numeric,
  p_tva        numeric,
  p_rib        text default null,
  p_notes      text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_net numeric;
begin
  if not public.has_admin_capability('payout.create') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  v_net := coalesce(p_gross,0) - coalesce(p_commission,0) - coalesce(p_tva,0);
  if v_net <= 0 then raise exception 'INVALID_NET_AMOUNT'; end if;

  insert into public.payouts
    (seller_id, auction_id, gross_amount, commission, tva, net_amount, rib, notes)
  values
    (p_seller_id, p_auction_id, p_gross, p_commission, p_tva, v_net, p_rib, p_notes)
  returning id into v_id;

  perform public.log_admin_action(
    'payout.create',
    p_target_user_id    => p_seller_id,
    p_target_auction_id => p_auction_id,
    p_target_id         => v_id,
    p_target_type       => 'payout',
    p_detail            => v_net::text || ' DT'
  );
  return v_id;
end; $$;
grant execute on function public.admin_create_payout(uuid, uuid, numeric, numeric, numeric, text, text)
  to authenticated;

create or replace function public.admin_mark_payout_paid(
  p_id        uuid,
  p_reference text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid; v_amount numeric;
begin
  if not public.has_admin_capability('payout.mark_paid') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.payouts
     set status = 'paid',
         paid_at = now(),
         paid_by = auth.uid(),
         paid_reference = p_reference
   where id = p_id and status in ('pending','approved')
   returning seller_id, net_amount into v_seller, v_amount;
  if v_seller is null then raise exception 'PAYOUT_NOT_FOUND_OR_ALREADY_PAID'; end if;

  -- Mirror into the transactions ledger so the seller sees it.
  insert into public.transactions
    (ref, user_id, user_label, type, direction, amount, label, status)
  select 'TX-PAY-' || substr(gen_random_uuid()::text, 1, 8),
         v_seller,
         coalesce(s.display_name, s.username),
         'payout', 'in', v_amount,
         'Virement bancaire — ' || coalesce(p_reference,'sans réf'),
         'completed'
    from public.sellers s where s.id = v_seller;

  insert into public.notifications (user_id, kind, title, body)
  values (v_seller, 'system', 'Virement effectué',
          'Votre virement de ' || v_amount::text || ' DT a été envoyé.');

  perform public.log_admin_action(
    'payout.mark_paid',
    p_target_user_id => v_seller,
    p_target_id      => p_id,
    p_target_type    => 'payout',
    p_detail         => p_reference
  );
end; $$;
grant execute on function public.admin_mark_payout_paid(uuid, text) to authenticated;

create or replace function public.admin_cancel_payout(
  p_id     uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
begin
  if not public.has_admin_capability('payout.create') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.payouts
     set status = 'cancelled',
         cancelled_reason = p_reason
   where id = p_id and status in ('pending','approved')
   returning seller_id into v_seller;
  if v_seller is null then raise exception 'PAYOUT_NOT_FOUND'; end if;
  perform public.log_admin_action(
    'payout.cancel',
    p_target_user_id => v_seller,
    p_target_id      => p_id,
    p_target_type    => 'payout',
    p_detail         => p_reason
  );
end; $$;
grant execute on function public.admin_cancel_payout(uuid, text) to authenticated;
