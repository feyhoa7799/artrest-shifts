select version();

select 'auth.users' as object_name, count(*) as row_count from auth.users
union all
select 'public.restaurants', count(*) from public.restaurants
union all
select 'public.slots', count(*) from public.slots
union all
select 'public.applications', count(*) from public.applications
union all
select 'public.employee_profiles', count(*) from public.employee_profiles
union all
select 'public.admin_users', count(*) from public.admin_users
union all
select 'public.admin_access_audit', count(*) from public.admin_access_audit
union all
select 'public.admin_restaurant_access', count(*) from public.admin_restaurant_access
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

