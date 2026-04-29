create table if not exists public.app_settings (
  id integer primary key default 1,
  application_notification_email text null,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1),
  constraint app_settings_application_notification_email_format check (
    application_notification_email is null
    or application_notification_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  )
);

insert into public.app_settings (id, application_notification_email)
values (1, null)
on conflict (id) do nothing;

comment on table public.app_settings is 'Глобальные настройки сайта подработок.';
comment on column public.app_settings.application_notification_email is 'Email получателя уведомлений о новых откликах на слоты.';
