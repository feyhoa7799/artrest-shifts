import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';

async function getCurrentUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '').trim();

  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return NextResponse.json({ error: 'Нет авторизации' }, { status: 401 });
    }

    const body = await req.json();
    const enabled = Boolean(body?.enabled);

    const { error } = await supabaseAdmin.from('telegram_notification_settings').upsert(
      {
        user_id: user.id,
        is_enabled: enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      notificationsEnabled: enabled,
    });
  } catch {
    return NextResponse.json(
      { error: 'Ошибка обновления настроек Telegram' },
      { status: 500 }
    );
  }
}