-- ============================================================================
-- Profile photos.
--
-- A classifieds listing is a stranger asking another stranger to meet them
-- about a car. A face next to the name is the cheapest trust signal there is,
-- and it is the one thing sellers ask for that we did not store at all.
--
--   * `profiles.avatar_path` — a path in the `avatars` bucket, not a URL, so
--     the bucket can be moved or fronted by a CDN without rewriting rows.
--   * a PUBLIC bucket: these are shown on every listing to signed-out buyers.
--     Nothing private goes in it, and the app only ever writes files it has
--     just compressed itself.
--   * writes are owner-scoped by the same `<uid>/…` convention the other
--     buckets use (0023/0024), so nobody can overwrite someone else's face.
--
-- The column is nullable and nothing requires it: an account with no photo
-- keeps showing its initial, exactly as today.
-- ============================================================================

alter table public.profiles
  add column if not exists avatar_path text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone may read: the photo appears on public listing pages.
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
on storage.objects for select
using (bucket_id = 'avatars');

-- Only inside your own folder, and only signed in.
drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and auth.uid() is not null
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Replacing a photo should not leave the old file behind for ever.
drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- `avatar_path` is the user's own to set. The 0006 guard protects role,
-- kyc_status and trust_score; this column is deliberately not one of them.
notify pgrst, 'reload schema';
