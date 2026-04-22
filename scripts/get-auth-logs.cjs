const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const rootDir = process.cwd();

const envLocalPath = path.join(rootDir, '.env.local');
const envProductionPath = path.join(rootDir, '.env.production');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log(`📄 Загружен ${envLocalPath}`);
} else if (fs.existsSync(envProductionPath)) {
  dotenv.config({ path: envProductionPath });
  console.log(`📄 Загружен ${envProductionPath}`);
} else {
  console.log('⚠️ Не найден .env.local или .env.production');
}

const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  (
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(
      /^https:\/\/([^.]+)\.supabase\.co/
    ) || []
  )[1] ||
  '';

const personalAccessToken =
  process.env.SUPABASE_ACCESS_TOKEN ||
  process.env.SUPABASE_PERSONAL_ACCESS_TOKEN ||
  '';

if (!projectRef || !personalAccessToken) {
  console.error(
    '❌ Нужны SUPABASE_PROJECT_REF и SUPABASE_ACCESS_TOKEN (или SUPABASE_PERSONAL_ACCESS_TOKEN)'
  );
  console.error('');
  console.error('Добавь в .env.local, например:');
  console.error('SUPABASE_PROJECT_REF=ssxwjpvqpdldjltsewfo');
  console.error('SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxx');
  process.exit(1);
}

function isoHoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function queryLogs() {
  const sql = [
    'select',
    '  datetime(timestamp) as ts,',
    '  event_message,',
    '  metadata',
    'from auth_logs',
    "where regexp_contains(lower(event_message), 'otp|confirmation|confirm|signup|signin|smtp|mail|email|hook|template|error|failed')",
    'order by timestamp desc',
    'limit 100',
  ].join('\n');

  const url = new URL(
    `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs.all`
  );

  url.searchParams.set('sql', sql);
  url.searchParams.set('iso_timestamp_start', isoHoursAgo(24));
  url.searchParams.set('iso_timestamp_end', new Date().toISOString());

  console.log('🔍 Получаю последние auth/email логи через Management API...\n');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${personalAccessToken}`,
      Accept: 'application/json',
    },
  });

  const text = await res.text();

  if (!res.ok) {
    console.error('❌ Ошибка запроса к Management API');
    console.error('Status:', res.status);
    console.error(text);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.log('⚠️ Ответ не JSON:');
    console.log(text);
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.log('⚠️ Подходящие auth/email логи не найдены');
    return;
  }

  for (const row of data) {
    console.log('==============================');
    console.log('📅', row.ts || row.timestamp || '—');
    console.log('📝', row.event_message || '—');
    if (row.metadata) {
      console.log('📦 metadata:', JSON.stringify(row.metadata, null, 2));
    }
  }
}

queryLogs().catch((err) => {
  console.error('❌ Неожиданная ошибка:');
  console.error(err);
  process.exit(1);
});