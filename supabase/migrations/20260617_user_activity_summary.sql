create table if not exists public.user_activity_summary (
  user_id text primary key,
  email text,
  last_seen_at timestamptz,
  last_seen_source text,
  last_page text,
  last_login_at timestamptz,
  last_application_at timestamptz,
  last_action_at timestamptz,
  ping_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_activity_summary_email_idx
  on public.user_activity_summary (email);

create index if not exists user_activity_summary_last_seen_at_idx
  on public.user_activity_summary (last_seen_at desc);
