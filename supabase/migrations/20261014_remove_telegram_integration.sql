-- Telegram integration has been retired. These tables contain Telegram account
-- identifiers, link tokens and delivery history and are no longer used.
drop table if exists public.telegram_notification_log;
drop table if exists public.telegram_notification_jobs;
drop table if exists public.telegram_link_tokens;
drop table if exists public.telegram_notification_settings;
drop table if exists public.telegram_links;
