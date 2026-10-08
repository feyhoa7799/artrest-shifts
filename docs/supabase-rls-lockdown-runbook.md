# Supabase public data lockdown

This runbook closes direct `anon` and `authenticated` access to application tables while
keeping Supabase Auth and trusted `service_role` server access operational.

## Before the window

1. Confirm a current production Supabase backup or snapshot.
2. Confirm the application container is healthy and the public site returns HTTP 200.
3. Run the SQL below in the Supabase SQL Editor and download both result sets as audit files.
   They preserve the current grants and policies for a scoped rollback if one is needed:

   ```sql
   select grantee, table_schema, table_name, privilege_type
   from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
   order by grantee, table_name, privilege_type;

   select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
   from pg_policies
   where schemaname = 'public'
   order by tablename, policyname;
   ```

4. Run the read-only access check. It is expected to fail before the migration:

   ```bash
   DOTENV_CONFIG_PATH=.env.production node scripts/check-supabase-public-access.mjs
   ```

5. Review active application code for browser-side `.from(...)` calls. The production paths
   must use server APIs before direct table access is revoked.

## Apply

Run `supabase/migrations/20261008_lock_down_public_data_access.sql` once in the production
Supabase SQL Editor.

Do not deploy application code and do not restart containers for this database-only change.

## Post-check SQL

```sql
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;
```

Expected results:

- every public table reports `rls_enabled = true`;
- no `anon` or `authenticated` table grants remain.

Then rerun:

```bash
DOTENV_CONFIG_PATH=.env.production node scripts/check-supabase-public-access.mjs
```

Every existing table must report an explicit `blocked (...)` anonymous result. A successful
query that returns zero rows is treated as inconclusive and fails the check.

## Smoke test

Verify without changing configuration:

1. Employee registration and email confirmation.
2. Employee login and password reset.
3. Profile load and update.
4. Open slots and restaurant pages.
5. Create and cancel a test application.
6. Admin bootstrap, employee export and role management.
7. Telegram settings and bot processing.

## Rollback

Rollback should be used only if a confirmed production path still performs direct browser table
queries. Restore only the minimum required grants and create scoped RLS policies for that path.
Do not restore blanket anonymous access to personal-data tables.
