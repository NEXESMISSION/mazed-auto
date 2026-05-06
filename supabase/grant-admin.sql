-- Grant admin role to a specific user.
-- Idempotent — re-running just keeps the role set.
update auth.users
   set raw_user_meta_data = jsonb_set(
     coalesce(raw_user_meta_data, '{}'::jsonb),
     '{role}',
     '"admin"'::jsonb,
     true
   )
 where email = 'saifelleuchi127@gmail.com';

-- Sanity check — should return one row with role=admin
select
  id,
  email,
  raw_user_meta_data->>'role'      as role,
  raw_user_meta_data->>'firstName' as first_name,
  raw_user_meta_data->>'kycStatus' as kyc
from auth.users
where email = 'saifelleuchi127@gmail.com';
