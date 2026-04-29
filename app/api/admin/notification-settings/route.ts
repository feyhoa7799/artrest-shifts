import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAdminAccessByEmail } from '@/lib/admin-access';

type SettingsRow = {
  id: number;
  application_notification_email: string | null;
  updated_at: string | null;
};

function normalizeEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase();

  if (!email) return '';

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return isValid ? email : null;
}

async function getCurrentAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '').trim();

  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) return null;

  const access = await getAdminAccessByEmail(data.user.email);

  if (!access.isAdmin) return null;

  return data.user;
}

async function readSettings() {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('id, application_notification_email, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (data || {
    id: 1,
    application_notification_email: null,
    updated_at: null,
  }) as SettingsRow;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentAdmin(req);

    if (!user) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const settings = await readSettings();

    return NextResponse.json({
      applicationNotificationEmail: settings.application_notification_email || '',
      updatedAt: settings.updated_at,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Ошибка загрузки настроек уведомлений',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentAdmin(req);

    if (!user) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const body = await req.json();
    const normalized = normalizeEmail(body?.applicationNotificationEmail);

    if (normalized === null) {
      return NextResponse.json({ error: 'Email указан некорректно' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('app_settings').upsert(
      {
        id: 1,
        application_notification_email: normalized || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const settings = await readSettings();

    return NextResponse.json({
      success: true,
      applicationNotificationEmail: settings.application_notification_email || '',
      updatedAt: settings.updated_at,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Ошибка сохранения настроек уведомлений',
      },
      { status: 500 }
    );
  }
}
