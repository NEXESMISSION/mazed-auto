-- ============================================================================
-- STORAGE — let a buyer delete their OWN receipt objects.
--
-- The receipts bucket (0024) shipped with select + insert policies only. The
-- checkout's failure path calls
--   supabase.storage.from('receipts').remove(uploadedPaths)
-- whenever an upload, the attach call, or the whole submit fails part-way —
-- precisely so a half-finished send doesn't leave objects behind. With no
-- delete policy that call has always been a silent no-op: every abandoned or
-- failed receipt upload has been accumulating in the bucket since 0024.
--
-- Scope is identical to the insert policy: a user may delete only inside their
-- own `<auth.uid()>/` folder. Admins keep read access; nothing here lets a
-- buyer touch a receipt that isn't theirs, and captured payments are unaffected
-- (the client only ever removes paths it uploaded seconds earlier in the same
-- attempt, before any payments row references them).
-- ============================================================================

drop policy if exists "receipts_owner_delete" on storage.objects;
create policy "receipts_owner_delete"
on storage.objects for delete
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);
