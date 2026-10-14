-- Run unchanged in the managed source and the self-hosted target.
-- The output contains counts and schema metadata only, never row contents.

select version();

select 'auth.identities' as object_name, count(*) as row_count from auth.identities
union all
select 'auth.password_hashes', count(*) from auth.users where encrypted_password is not null
union all
select 'auth.users', count(*) from auth.users
union all
select 'public.admin_access_audit', count(*) from public.admin_access_audit
union all
select 'public.admin_restaurant_access', count(*) from public.admin_restaurant_access
union all
select 'public.admin_users', count(*) from public.admin_users
union all
select 'public.app_settings', count(*) from public.app_settings
union all
select 'public.applications', count(*) from public.applications
union all
select 'public.employee_privacy_consents', count(*) from public.employee_privacy_consents
union all
select 'public.employee_profiles', count(*) from public.employee_profiles
union all
select 'public.restaurants', count(*) from public.restaurants
union all
select 'public.slots', count(*) from public.slots
union all
select 'public.user_activity_summary', count(*) from public.user_activity_summary
order by object_name;

select extname, extversion
from pg_extension
order by extname;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

select count(*) as public_policy_count
from pg_policies
where schemaname = 'public';

select count(*) as public_trigger_count
from information_schema.triggers
where trigger_schema = 'public';

select count(*) as public_function_count
from information_schema.routines
where routine_schema = 'public';
