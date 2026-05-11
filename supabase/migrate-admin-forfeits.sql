-- ============================================================
-- Mazed Auto — Admin caution (forfeit) management
--
-- Today forfeits happen automatically when `payment_deadline` passes
-- (handled by `process_expired_payment_deadlines`) or when the winner
-- voluntarily renounces from /buyer/wins. Some cases need manual
-- intervention by an admin:
--
--   • Confirmed fraud / no-show before the deadline expires — force
--     forfeit now instead of waiting.
--   • A forfeit was applied wrongly (admin made a mistake, or the
--     winner contested with proof of payment) — reverse it.
--   • Legitimate reason for delay (sick, abroad) — extend the payment
--     deadline by N days.
--
-- This migration adds three RPCs. All require `transaction.adjust`
-- capability (admin, super_admin, finance roles) and log every action.
--
-- Depends on: migrate-admin-foundations.sql, migrate-winner-forfeit.sql
-- Safe to run repeatedly.
-- ============================================================

-- 1) admin_force_forfeit_winner -----------------------------------------
-- Wraps forfeit_winner_deposit() with admin RBAC + audit log. The reason
-- is recorded in admin_audit_log AND stored in auction_forfeits as a
-- new `admin_note` column so the UI can show why it was manually forced.

alter table public.auction_forfeits
  add column if not exists admin_note    text,
  add column if not exists admin_user_id uuid references auth.users(id) on delete set null,
  add column if not exists reversed_at   timestamptz,
  add column if not exists reversed_by   uuid references auth.users(id) on delete set null,
  add column if not exists reversed_reason text;

create or replace function public.admin_force_forfeit(
  p_auction_id uuid,
  p_reason     text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_winner uuid;
  v_status text;
  v_forfeit_id uuid;
begin
  if not public.has_admin_capability('transaction.adjust') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select current_winner_id, status
    into v_winner, v_status
    from public.auctions where id = p_auction_id;

  if v_winner is null then raise exception 'NO_CURRENT_WINNER'; end if;
  if v_status not in ('ended', 're_offered') then
    raise exception 'WRONG_STATUS: %', v_status;
  end if;

  -- Delegate to the existing forfeit pipeline (handles split, ledger,
  -- notifications, next-bidder cascade) using a synthetic reason so
  -- the audit row is distinguishable from automatic ones.
  perform public.forfeit_winner_deposit(
    p_auction_id, v_winner, 'payment_deadline_expired'
  );

  -- Stamp the most recent forfeit with the admin note.
  update public.auction_forfeits
     set admin_note    = p_reason,
         admin_user_id = auth.uid()
   where id = (
     select id from public.auction_forfeits
     where auction_id = p_auction_id and user_id = v_winner
     order by forfeited_at desc
     limit 1
   )
   returning id into v_forfeit_id;

  perform public.log_admin_action(
    'transaction.adjust',
    p_target_auction_id => p_auction_id,
    p_target_id         => v_forfeit_id,
    p_target_type       => 'auction_forfeit',
    p_detail            => 'force_forfeit: ' || p_reason
  );

  return v_forfeit_id;
end; $$;

grant execute on function public.admin_force_forfeit(uuid, text) to authenticated;

-- 2) admin_reverse_forfeit ---------------------------------------------
-- Marks a forfeit row as reversed and writes compensating transactions.
-- We don't delete the audit row — the original entry is permanent.

create or replace function public.admin_reverse_forfeit(
  p_forfeit_id uuid,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction_id   uuid;
  v_user_id      uuid;
  v_seller_id    uuid;
  v_seller_amt   numeric;
  v_platform_amt numeric;
  v_amount       numeric;
  v_user_label   text;
begin
  if not public.has_admin_capability('transaction.adjust') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select f.auction_id, f.user_id, f.seller_share, f.platform_share, f.amount, f.user_label
    into v_auction_id, v_user_id, v_seller_amt, v_platform_amt, v_amount, v_user_label
    from public.auction_forfeits f
   where f.id = p_forfeit_id and f.reversed_at is null
   for update;

  if v_auction_id is null then
    raise exception 'FORFEIT_NOT_FOUND_OR_ALREADY_REVERSED';
  end if;

  select seller_id into v_seller_id
    from public.auctions where id = v_auction_id;

  -- Compensating ledger entries (negative direction = 'out').
  insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
  values (
    'TX-RV-' || substring(gen_random_uuid()::text from 1 for 8),
    v_seller_id, null, v_auction_id, 'refund', 'out', v_seller_amt,
    'Annulation forfait — part vendeur remboursée',
    'completed'
  );
  insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
  values (
    'TX-RV-' || substring(gen_random_uuid()::text from 1 for 8),
    null, 'Mazed Auto', v_auction_id, 'refund', 'out', v_platform_amt,
    'Annulation forfait — part plateforme reversée',
    'completed'
  );
  -- Caution returned to the bidder.
  insert into public.transactions (ref, user_id, user_label, auction_id, type, direction, amount, label, status)
  values (
    'TX-RV-' || substring(gen_random_uuid()::text from 1 for 8),
    v_user_id, v_user_label, v_auction_id, 'refund', 'out', v_amount,
    'Caution restituée — forfait annulé',
    'completed'
  );

  update public.auction_forfeits
     set reversed_at     = now(),
         reversed_by     = auth.uid(),
         reversed_reason = p_reason
   where id = p_forfeit_id;

  insert into public.notifications (user_id, auction_id, kind, title, body)
  values (v_user_id, v_auction_id, 'deposit_refunded',
    'Caution restituée',
    'L''administration a annulé le forfait — votre caution de ' ||
      v_amount::text || ' DT vous a été restituée. Motif : ' || p_reason
  );

  perform public.log_admin_action(
    'transaction.adjust',
    p_target_auction_id => v_auction_id,
    p_target_id         => p_forfeit_id,
    p_target_type       => 'auction_forfeit',
    p_detail            => 'reverse_forfeit: ' || p_reason
  );
end; $$;

grant execute on function public.admin_reverse_forfeit(uuid, text) to authenticated;

-- 3) admin_extend_payment_deadline -------------------------------------
-- Push the payment deadline of a finished auction back by N days so
-- the current winner has more time to pay. Notifies the winner.

create or replace function public.admin_extend_payment_deadline(
  p_auction_id uuid,
  p_days       int,
  p_reason     text
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old timestamptz;
  v_new timestamptz;
  v_winner uuid;
  v_status text;
begin
  if not public.has_admin_capability('transaction.adjust') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_days is null or p_days <= 0 then
    raise exception 'DAYS_REQUIRED';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select payment_deadline, current_winner_id, status
    into v_old, v_winner, v_status
    from public.auctions where id = p_auction_id for update;

  if v_winner is null then raise exception 'NO_CURRENT_WINNER'; end if;
  if v_status not in ('ended', 're_offered') then
    raise exception 'WRONG_STATUS: %', v_status;
  end if;

  v_new := coalesce(v_old, now()) + make_interval(days => p_days);

  update public.auctions
     set payment_deadline = v_new
   where id = p_auction_id;

  insert into public.notifications (user_id, auction_id, kind, title, body)
  values (v_winner, p_auction_id, 'payment_due',
    'Délai de paiement prolongé',
    'L''administration a prolongé votre délai de paiement de ' ||
      p_days::text || ' jours. Nouvelle échéance : ' ||
      to_char(v_new at time zone 'Africa/Tunis', 'DD/MM/YYYY HH24:MI') ||
      '. Motif : ' || p_reason
  );

  perform public.log_admin_action(
    'transaction.adjust',
    p_target_auction_id => p_auction_id,
    p_target_type       => 'auction',
    p_detail            => 'extend_payment_deadline +' || p_days::text || 'd: ' || p_reason
  );

  return v_new;
end; $$;

grant execute on function public.admin_extend_payment_deadline(uuid, int, text) to authenticated;

-- 4) View: pending payment deadlines ----------------------------------
-- Convenience view for /admin/forfeits — auctions whose payment
-- deadline is approaching or already expired. The sweep auto-forfeits
-- expired rows on the next interaction, but admins can see the queue
-- in advance and decide to extend / force-forfeit early.

create or replace view public.admin_pending_payment_deadlines as
select
  a.id                as auction_id,
  a.make, a.model, a.year,
  a.current_price,
  a.participation_deposit,
  a.current_winner_id,
  a.payment_deadline,
  a.status,
  coalesce(
    (select btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                  coalesce(u.raw_user_meta_data->>'lastName',''))
       from auth.users u where u.id = a.current_winner_id),
    'Acheteur'
  )::text             as winner_label,
  case
    when a.payment_deadline <= now() then 'expired'
    when a.payment_deadline <= now() + interval '24 hours' then 'soon'
    else 'pending'
  end                 as urgency
from public.auctions a
where a.status in ('ended','re_offered')
  and a.current_winner_id is not null
  and a.payment_deadline is not null
  and not exists (
    select 1 from public.transactions t
    where t.auction_id = a.id
      and t.user_id    = a.current_winner_id
      and t.type       = 'final_payment'
      and t.status     = 'completed'
  );

grant select on public.admin_pending_payment_deadlines to authenticated;
