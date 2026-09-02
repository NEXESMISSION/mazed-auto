-- ============================================================================
-- FIX for 0158 — a ledger cannot hold foreign keys.
--
-- `credit_ledger` was created append-only (no UPDATE, no DELETE) *and* with
-- FKs: `listing_id … on delete set null`, `seller_credit_id … on delete
-- cascade`. Those two facts contradict each other, and the contradiction was
-- found by trying to delete a test listing:
--
--     deleting a listing → Postgres runs `UPDATE credit_ledger SET
--     listing_id = NULL` → the append-only trigger raises →
--     THE LISTING CANNOT BE DELETED.
--
-- The same trap sat behind the cascade: deleting a seller_credit (or the
-- profile above it) would have tried to DELETE ledger rows and failed the same
-- way. In production that is an admin unable to remove a listing or close an
-- account, with an error naming a table they have never heard of.
--
-- The fix is to accept what a ledger is. It is a historical record, not a live
-- relationship: it records that on this date, this credit was spent on this
-- listing. If the listing is deleted later, the fact still happened, and the id
-- stays as a plain value. So: keep the columns, drop the enforcement.
--
-- Referential integrity is not lost where it matters — `seller_credits` still
-- carries FKs to the seller and the product, and the ledger is only ever
-- written by two SECURITY DEFINER functions that pass ids they just read.
-- ============================================================================

alter table public.credit_ledger
  drop constraint if exists credit_ledger_listing_id_fkey,
  drop constraint if exists credit_ledger_seller_credit_id_fkey;

comment on column public.credit_ledger.listing_id is
  'The listing this movement paid for, recorded BY VALUE. Deliberately not a foreign key: the ledger is append-only, so an ON DELETE action on it can never run (see 0159).';
comment on column public.credit_ledger.seller_credit_id is
  'The credit this movement belongs to, recorded by value for the same reason.';

notify pgrst, 'reload schema';
