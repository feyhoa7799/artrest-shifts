import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error('Supabase URL, anon key and service role key are required');
  process.exit(1);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const anonymousClient = createClient(url, anonKey, options);
const serviceClient = createClient(url, serviceKey, options);

const expectedTables = [
  'admin_access_audit',
  'admin_restaurant_access',
  'admin_users',
  'app_settings',
  'applications',
  'employee_privacy_consents',
  'employee_profiles',
  'restaurants',
  'slots',
  'telegram_link_tokens',
  'telegram_links',
  'telegram_notification_jobs',
  'telegram_notification_log',
  'telegram_notification_settings',
  'user_activity_summary',
];

const results = [];
let failed = false;

for (const table of expectedTables) {
  const serviceResult = await serviceClient
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (serviceResult.error?.code === '42P01' || serviceResult.error?.code === 'PGRST205') {
    results.push({ table, exists: false, protected: true, note: 'table not present' });
    continue;
  }

  if (serviceResult.error) {
    failed = true;
    results.push({
      table,
      exists: 'unknown',
      protected: false,
      note: `service verification failed (${serviceResult.error.code || 'unknown'})`,
    });
    continue;
  }

  const anonymousResult = await anonymousClient.from(table).select('*').limit(1);
  const returnedRows = anonymousResult.data?.length || 0;
  // An empty successful response does not prove that access is restricted: the table may
  // simply be empty. After the lockdown, PostgREST must reject the anonymous query.
  const protectedFromAnonymousRead = Boolean(anonymousResult.error);

  if (!protectedFromAnonymousRead) failed = true;

  results.push({
    table,
    exists: true,
    serviceCount: serviceResult.count,
    protected: protectedFromAnonymousRead,
    anonymousResult: anonymousResult.error
      ? `blocked (${anonymousResult.error.code || 'unknown'})`
      : `returned ${returnedRows} row(s)`,
  });
}

console.table(results);

if (failed) {
  console.error('Public Supabase data access check failed');
  process.exit(1);
}

console.log('Public Supabase data access check passed');
