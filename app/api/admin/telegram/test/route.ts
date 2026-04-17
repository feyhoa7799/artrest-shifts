import { NextRequest, NextResponse } from 'next/server';

import { getAdminAccessByEmail } from '@/lib/admin-access';
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

    const access = await getAdminAccessByEmail(user.email);

    if (!access.isAdmin) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const body = await req.json();
    const userId = String(body?.userId || '').trim();

    if (!userId) {
      return NextResponse.json({ error: 'Не передан userId' }, { status: 400 });
    }

    const { data: link } = await supabaseAdmin
      .from('telegram_links')
      .select('user_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (!link) {
      return NextResponse.json(
        { error: 'У сотрудника нет активной привязки Telegram' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from('telegram_notification_jobs').insert({
      user_id: userId,
      kind: 'manual_test',
      payload: {
        message: 'Тестовое уведомление из админки Арт Рест',
        requested_by: user.email || '',
      },
      scheduled_for: new Date().toISOString(),
      status: 'pending',
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Тестовая отправка поставлена в очередь',
    });
  } catch {
    return NextResponse.json(
      { error: 'Ошибка постановки тестовой отправки в очередь' },
      { status: 500 }
    );
  }
}