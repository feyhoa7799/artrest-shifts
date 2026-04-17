function requireEnv(name: string, fallback?: string) {
  const value = (process.env[name] || fallback || '').trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export const config = {
  telegramBotToken: requireEnv('TELEGRAM_BOT_TOKEN'),
  telegramBotUsername: requireEnv('TELEGRAM_BOT_USERNAME').replace(/^@/, ''),
  appBaseUrl: trimTrailingSlash(requireEnv('APP_BASE_URL')),
  supabaseUrl: requireEnv(
    'SUPABASE_URL',
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  pollIntervalMs: 60_000,
  reminderWindowMinutes: 5,
};