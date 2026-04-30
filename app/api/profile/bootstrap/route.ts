import { NextRequest, NextResponse } from 'next/server';

import { getAdminAccessByEmail } from '@/lib/admin-access';
import { getActiveRestaurantOptions } from '@/lib/restaurants-cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  formatTelegramUsername,
  getTelegramBotUrl,
  getTelegramBotUsername,
} from '@/lib/telegram';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  home_restaurant_id: number | null;
  is_blocked: boolean | null;
};

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

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 8,
};

function clearSessionCookies(res: NextResponse) {
  res.cookies.set('app_auth', '', { path: '/', maxAge: 0 });
  res.cookies.set('app_profile', '', { path: '/', maxAge: 0 });
  res.cookies.set('app_admin', '', { path: '/', maxAge: 0 });
  res.cookies.set('app_superadmin', '', { path: '/', maxAge: 0 });
  return res;
}

function normalizeFullName(value: string | null | undefined) {
  return String(value || '')
    .replace(/[^А-Яа-яЁё\s-]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim();
}

function isValidCyrillicFullName(value: string | null | undefined) {
  const normalized = normalizeFullName(value);

  if (!normalized) return false;
  if (normalized.length < 5) return false;

  if (!/^[А-Яа-яЁё]+(?:[\s-][А-Яа-яЁё]+)*$/.test(normalized)) {
    return false;
  }

  return normalized.split(/\s+/).filter(Boolean).length >= 2;
}

function isProfileComplete(profile: ProfileRow | null) {
  if (!profile) return false;

  return Boolean(
    isValidCyrillicFullName(profile.full_name) &&
      profile.phone &&
      /^\+7\d{10}$/.test(profile.phone) &&
      profile.role &&
      profile.home_restaurant_id
  );
}

async function loadTelegramStatus(userId: string) {
  const [{ data: linkData }, { data: settingsData }] = await Promise.all([
    supabaseAdmin
      .from('telegram_links')
      .select(
        'user_id, email, telegram_user_id, chat_id, telegram_username, telegram_first_name, telegram_last_name, is_active, linked_at, updated_at'
      )
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle(),
    supabaseAdmin
      .from('telegram_notification_settings')
      .select('user_id, is_enabled, updated_at')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const link = (linkData || null) as TelegramLinkRow | null;
  const settings = (settingsData || null) as TelegramSettingsRow | null;

  return {
    isLinked: Boolean(link),
    botUsername: getTelegramBotUsername() || null,
    botUrl: getTelegramBotUrl(),
    telegramUsername: formatTelegramUsername(link?.telegram_username),
    linkedAt: link?.linked_at || null,
    notificationsEnabled: settings?.is_enabled ?? true,
  };
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      return clearSessionCookies(
        NextResponse.json({ error: 'Нет авторизации' }, { status: 401 })
      );
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      return clearSessionCookies(
        NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 })
      );
    }

    const user = userData.user;
    const email = user.email || '';

    const [{ data: profileData }, restaurants, telegram, adminAccess] =
      await Promise.all([
        supabaseAdmin
          .from('employee_profiles')
          .select('user_id, email, full_name, phone, role, home_restaurant_id, is_blocked')
          .eq('user_id', user.id)
          .maybeSingle(),
        getActiveRestaurantOptions(),
        loadTelegramStatus(user.id),
        getAdminAccessByEmail(email),
      ]);

    const profile = (profileData || null) as ProfileRow | null;
    const profileComplete = isProfileComplete(profile);

    const normalizedProfile = profile
      ? {
          user_id: profile.user_id,
          email: profile.email || email,
          full_name: profile.full_name || '',
          phone: profile.phone || '+7',
          role: profile.role || '',
          home_restaurant_id: profile.home_restaurant_id || '',
          is_blocked: Boolean(profile.is_blocked),
        }
      : {
          user_id: user.id,
          email,
          full_name: '',
          phone: '+7',
          role: '',
          home_restaurant_id: '',
          is_blocked: false,
        };

    const res = NextResponse.json({
      profile: normalizedProfile,
      restaurants,
      telegram,
      admin: {
        isAdmin: adminAccess.isAdmin,
        isSuperadmin: adminAccess.isSuperadmin,
      },
      meta: {
        profileComplete,
        tookMs: Date.now() - startedAt,
      },
    });

    res.cookies.set('app_auth', '1', cookieOptions);
    res.cookies.set('app_profile', profileComplete ? '1' : '0', cookieOptions);
    res.cookies.set('app_admin', adminAccess.isAdmin ? '1' : '0', cookieOptions);
    res.cookies.set('app_superadmin', adminAccess.isSuperadmin ? '1' : '0', cookieOptions);

    return res;
  } catch (error) {
    console.error('[profile/bootstrap] error:', error);

    return NextResponse.json(
      { error: 'Ошибка загрузки профиля' },
      { status: 500 }
    );
  }
}
