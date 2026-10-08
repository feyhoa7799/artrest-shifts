-- Prevent direct browser access to application data.
-- The application reads and writes public tables through trusted server routes using service_role.
-- Supabase Auth remains available because it is served from the separate auth schema/API.

do $$
declare
  relation_record record;
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_authenticated boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  for relation_record in
    select n.nspname as schema_name, c.relname as relation_name, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'S')
  loop
    if relation_record.relkind in ('r', 'p') then
      execute format(
        'alter table %I.%I enable row level security',
        relation_record.schema_name,
        relation_record.relation_name
      );
    end if;

    if has_anon then
      execute format(
        'revoke all privileges on %s %I.%I from anon',
        case
          when relation_record.relkind in ('r', 'p') then 'table'
          when relation_record.relkind = 'S' then 'sequence'
          else 'table'
        end,
        relation_record.schema_name,
        relation_record.relation_name
      );
    end if;

    if has_authenticated then
      execute format(
        'revoke all privileges on %s %I.%I from authenticated',
        case
          when relation_record.relkind in ('r', 'p') then 'table'
          when relation_record.relkind = 'S' then 'sequence'
          else 'table'
        end,
        relation_record.schema_name,
        relation_record.relation_name
      );
    end if;
  end loop;

  if has_anon then
    execute 'alter default privileges in schema public revoke all on tables from anon';
    execute 'alter default privileges in schema public revoke all on sequences from anon';
  end if;

  if has_authenticated then
    execute 'alter default privileges in schema public revoke all on tables from authenticated';
    execute 'alter default privileges in schema public revoke all on sequences from authenticated';
  end if;
end $$;
