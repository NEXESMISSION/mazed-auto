-- ============================================================
-- Mazed Auto — manual payment flow (bank transfer + D17 + receipt)
--
-- Adds the data + RPC surface for the offline payment lane that
-- runs alongside the simulated card provider:
--
--   1. User picks "Virement bancaire" or "D17" at /payment/checkout
--   2. UI shows the platform's bank/D17 info (from platform_settings)
--   3. User uploads a receipt image; we compress + store in the
--      private `payment-receipts` bucket
--   4. submit_manual_payment() inserts a row with
--      status = 'pending_verification' and receipt_url
--   5. Admin sees it in /admin/transactions, opens the receipt,
--      and clicks Approve or Reject — verify_manual_payment() flips
--      the status, writes an audit log, and notifies the user
--
-- Idempotent.
-- ============================================================

-- 1) Widen the status check + add manual-payment columns ----------

alter table public.transactions
  add column if not exists manual_method text,
  add column if not exists receipt_url text,
  add column if not exists verified_by uuid references auth.users(id),
  add column if not exists verified_at timestamptz,
  add column if not exists verification_notes text;

-- Method check
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_manual_method_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_manual_method_check
      check (manual_method is null or manual_method in ('bank_transfer','d17'));
  end if;
end $$;

-- Rebuild the status check to include 'pending_verification'.
alter table public.transactions
  drop constraint if exists transactions_status_check;
alter table public.transactions
  add constraint transactions_status_check
  check (status in ('pending','processing','completed','failed','pending_verification'));

create index if not exists tx_pending_verification_idx
  on public.transactions (created_at desc)
  where status = 'pending_verification';

-- 2) Private storage bucket for receipt images -------------------

insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do update set public = false;

drop policy if exists "receipts_owner_write"  on storage.objects;
drop policy if exists "receipts_owner_read"   on storage.objects;
drop policy if exists "receipts_admin_read"   on storage.objects;
drop policy if exists "receipts_admin_delete" on storage.objects;

-- Users write to their own folder only.
create policy "receipts_owner_write"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Users read their own; admins read everything.
create policy "receipts_owner_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-receipts'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

-- Admins can delete (cleanup of rejected/expired receipts).
create policy "receipts_admin_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'payment-receipts'
  and public.is_admin()
);

-- 3) RPC: submit_manual_payment ----------------------------------

create or replace function public.submit_manual_payment(
  p_auction_id uuid,
  p_amount     numeric,
  p_type       text,
  p_method     text,
  p_receipt_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_tx_id   uuid;
  v_ref     text;
  v_type    text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_method not in ('bank_transfer','d17') then
    raise exception 'INVALID_METHOD';
  end if;
  if p_receipt_url is null or p_receipt_url = '' then
    raise exception 'RECEIPT_REQUIRED';
  end if;

  -- Map the caller's payment intent to the transactions.type enum.
  v_type := case
    when p_type = 'subscription' then 'commission'
    when p_type = 'final' then 'final_payment'
    when p_type = 'deposit' then 'deposit'
    else null
  end;
  if v_type is null then
    raise exception 'INVALID_TYPE';
  end if;

  -- MAN-<10 hex> tracking ref so users and admins can identify the
  -- payment in their messages / receipt photos.
  v_ref := 'MAN-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.transactions
    (ref, user_id, auction_id, type, direction, amount, label, status,
     manual_method, receipt_url)
  values
    (v_ref, v_user_id, p_auction_id, v_type, 'in', p_amount,
     'Paiement manuel — en attente de vérification',
     'pending_verification', p_method, p_receipt_url)
  returning id into v_tx_id;

  return v_tx_id;
end; $$;

revoke all on function public.submit_manual_payment(uuid, numeric, text, text, text) from public;
grant execute on function public.submit_manual_payment(uuid, numeric, text, text, text) to authenticated;

-- 4) RPC: verify_manual_payment ----------------------------------

create or replace function public.verify_manual_payment(
  p_tx_id  uuid,
  p_action text,
  p_notes  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_tx    record;
  v_msg   text;
begin
  v_admin := auth.uid();
  if v_admin is null or not public.is_admin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if p_action not in ('approve','reject') then
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_tx from public.transactions where id = p_tx_id for update;
  if not found then
    raise exception 'TX_NOT_FOUND';
  end if;
  if v_tx.status <> 'pending_verification' then
    raise exception 'TX_NOT_PENDING';
  end if;

  if p_action = 'approve' then
    update public.transactions
       set status = 'completed',
           verified_by = v_admin,
           verified_at = now(),
           verification_notes = p_notes
     where id = p_tx_id;
    v_msg := 'Votre paiement de ' || v_tx.amount::text || ' DT a été vérifié et enregistré.';
  else
    update public.transactions
       set status = 'failed',
           verified_by = v_admin,
           verified_at = now(),
           verification_notes = coalesce(p_notes, 'Refusé par un administrateur')
     where id = p_tx_id;
    v_msg := 'Votre paiement a été refusé. ' || coalesce(p_notes, '');
  end if;

  -- Notify the user. `payment_received` is allowed by the notif kind
  -- check after migrate-notifications-expansion.
  if v_tx.user_id is not null then
    insert into public.notifications (user_id, kind, title, body)
    values (
      v_tx.user_id,
      'payment_received',
      case when p_action = 'approve' then 'Paiement vérifié' else 'Paiement refusé' end,
      v_msg
    );
  end if;

  -- Audit log (admin_audit_log exists from migrate-admin-foundations).
  insert into public.admin_audit_log
    (actor_id, actor_role, action, target_user_id, detail)
  values (
    v_admin,
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'adminRole'),
      (auth.jwt() -> 'user_metadata' ->> 'adminRole'),
      'admin'
    ),
    'payment.verify',
    v_tx.user_id,
    jsonb_build_object('tx_id', p_tx_id, 'action', p_action, 'notes', p_notes, 'amount', v_tx.amount)
  );
end; $$;

revoke all on function public.verify_manual_payment(uuid, text, text) from public;
grant execute on function public.verify_manual_payment(uuid, text, text) to authenticated;

-- 5) Bank + D17 info in platform_settings -----------------------

insert into public.platform_settings (key, value, type, category, description, sensitive, requires_approval) values
  ('payment.bank.beneficiary',  '"Mazed Auto SARL"'::jsonb,                              'string', 'support', 'Nom du bénéficiaire pour les virements bancaires', false, true),
  ('payment.bank.bank_name',    '"BIAT — Banque Internationale Arabe de Tunisie"'::jsonb, 'string', 'support', 'Nom de la banque', false, true),
  ('payment.bank.rib',          '"08 100 0123456789 12"'::jsonb,                          'string', 'support', 'RIB du compte de réception', false, true),
  ('payment.bank.swift',        '"BIATTNTT"'::jsonb,                                       'string', 'support', 'Code SWIFT/BIC (virement international)', false, false),
  ('payment.d17.phone',         '"+216 20 123 456"'::jsonb,                                'string', 'support', 'Numéro D17 (Poste Tunisienne)', false, true),
  ('payment.d17.recipient_name','"Mazed Auto"'::jsonb,                                     'string', 'support', 'Nom du destinataire D17 affiché à l''utilisateur', false, false)
on conflict (key) do nothing;
