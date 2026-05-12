-- ============================================================
-- Mazed Auto — admin-controlled brand logo uploads
--
-- Adds a dedicated storage bucket so admins can upload brand
-- tile images via /admin/cms/brands. Public read so the home
-- page slider and seller-wizard dropdown can serve the URLs;
-- write/update/delete restricted to public.is_admin().
--
-- Idempotent.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('cms-brand-logos', 'cms-brand-logos', true)
on conflict (id) do update set public = true;

drop policy if exists "cms_brand_logos_public_read"   on storage.objects;
drop policy if exists "cms_brand_logos_admin_insert"  on storage.objects;
drop policy if exists "cms_brand_logos_admin_update"  on storage.objects;
drop policy if exists "cms_brand_logos_admin_delete"  on storage.objects;

create policy "cms_brand_logos_public_read"
on storage.objects for select
using (bucket_id = 'cms-brand-logos');

create policy "cms_brand_logos_admin_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'cms-brand-logos'
  and public.is_admin()
);

create policy "cms_brand_logos_admin_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'cms-brand-logos'
  and public.is_admin()
)
with check (
  bucket_id = 'cms-brand-logos'
  and public.is_admin()
);

create policy "cms_brand_logos_admin_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'cms-brand-logos'
  and public.is_admin()
);
