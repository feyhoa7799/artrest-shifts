import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  TELEGRAM_LINK_TOKEN_TTL_MINUTES,
  buildTelegramDeepLink,
  createTelegramLinkToken,
  formatTelegramUsername,
  getTelegramBotUrl,
  getTelegramBotUsername,
} from '@/lib/telegram';

type TelegramLinkRow = {
  user_id: string;
  email: string;
  telegram_user_id: number;
  chat_id: number;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  is_active: boolean;
  linked_at: string;
  updated_at: string;
};

type TelegramSettingsRow = {
  user_id: string;
  is_enabled: boolean;
  updated_at: string;
};

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

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return NextResponse.json({ error: 'Нет авторизации' }, { status: 401 });
    }

    const [{ data: linkData }, { data: settingsData }] = await Promise.all([
      supabaseAdmin
        .from('telegram_links')
        .select(
          'user_id, email, telegram_user_id, chat_id, telegram_username, telegram_first_name, telegram_last_name, is_active, linked_at, updated_at'
        )
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle(),
      supabaseAdmin
        .from('telegram_notification_settings')
        .select('user_id, is_enabled, updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    const link = (linkData || null) as TelegramLinkRow | null;
    const settings = (settingsData || null) as TelegramSettingsRow | null;

    return NextResponse.json({
      isLinked: Boolean(link),
      botUsername: getTelegramBotUsername() || null,
      botUrl: getTelegramBotUrl(),
      telegramUsername: formatTelegramUsername(link?.telegram_username),
      linkedAt: link?.linked_at || null,
      notificationsEnabled: settings?.is_enabled ?? true,
    });
  } catch {
    return NextResponse.json(
      { error: 'Ошибка загрузки статуса Telegram' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return NextResponse.json({ error: 'Нет авторизации' }, { status: 401 });
    }

    const botUsername = getTelegramBotUsername();

    if (!botUsername) {
      return NextResponse.json(
        { error: 'TELEGRAM_BOT_USERNAME не настроен' },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from('telegram_link_tokens')
      .delete()
      .eq('user_id', user.id)
      .is('used_at', null);

    const token = createTelegramLinkToken();
    const expiresAt = new Date(
      Date.now() + TELEGRAM_LINK_TOKEN_TTL_MINUTES * 60 * 1000
    ).toISOString();

    const { error } = await supabaseAdmin.from('telegram_link_tokens').insert({
      token,
      user_id: user.id,
      email: user.email || '',
      expires_at: expiresAt,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseAdmin.from('telegram_notification_settings').upsert(
      {
        user_id: user.id,
        is_enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    return NextResponse.json({
      deepLink: buildTelegramDeepLink(token),
      expiresAt,
      botUsername,
      botUrl: getTelegramBotUrl(),
    });
  } catch {
    return NextResponse.json(
      { error: 'Ошибка создания ссылки привязки Telegram' },
      { status: 500 }
    );
  }
}