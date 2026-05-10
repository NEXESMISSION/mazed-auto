-- ============================================================
-- Mazed Auto — Admin team listing
--
-- super_admin needs to see every account that holds an admin role,
-- regardless of whether the rest of the app classifies them as
-- buyer / seller / admin. This RPC pulls from auth.users with
-- elevated privilege and returns just admins.
--
-- Depends on: migrate-admin-foundations.sql
-- Safe to run repeatedly.
-- ============================================================

create or replace function public.admin_list_admins()
returns table (
  id          uuid,
  email       text,
  first_name  text,
  last_name   text,
  display_name text,
  admin_role  text,
  created_at  timestamptz,
  last_seen   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_role() is null then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  select
    u.id,
    u.email::text,
    (u.raw_user_meta_data ->> 'firstName')::text as first_name,
    (u.raw_user_meta_data ->> 'lastName')::text  as last_name,
    coalesce(s.display_name,
             nullif(btrim(coalesce(u.raw_user_meta_data->>'firstName','') || ' ' ||
                          coalesce(u.raw_user_meta_data->>'lastName','')),''),
             split_part(u.email,'@',1))::text   as display_name,
    coalesce(u.raw_user_meta_data ->> 'adminRole',
             case when u.raw_user_meta_data ->> 'role' = 'admin' then 'admin' else null end)::text
                                                  as admin_role,
    u.created_at,
    (select max(last_seen) from public.admin_sessions where user_id = u.id) as last_seen
  from auth.users u
  left join public.sellers s on s.id = u.id
  where (u.raw_user_meta_data ->> 'role') = 'admin'
     or u.raw_user_meta_data ->> 'adminRole' is not null
  order by u.created_at desc;
end; $$;

grant execute on function public.admin_list_admins() to authenticated;
