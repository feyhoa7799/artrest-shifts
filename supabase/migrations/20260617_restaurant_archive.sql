alter table if exists public.restaurants
  add column if not exists is_active boolean,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text,
  add column if not exists archive_reason text;

update public.restaurants
set is_active = true
where is_active is null;

alter table if exists public.restaurants
  alter column is_active set default true,
  alter column is_active set not null;

create index if not exists restaurants_is_active_name_idx
  on public.restaurants (is_active, name);
