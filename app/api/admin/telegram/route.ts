import { NextRequest, NextResponse } from 'next/server';

import { getAdminAccessByEmail } from '@/lib/admin-access';
import { formatTelegramUsername } from '@/lib/telegram';
import { supabaseAdmin } from '@/lib/supabase-admin';

type EmployeeProfile = {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  role: string;
  home_restaurant_id: number | null;
  is_blocked: boolean;
  created_at: string;
  updated_at: string;
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

type TelegramLogRow = {
  id: number;
  user_id: string;
  application_id: number | null;
  job_id: number | null;
  telegram_user_id: number | null;
  notification_kind: string;
  status: 'sent' | 'error' | 'skipped';
  payload: unknown;
  sent_at: string;
  error_message: string | null;
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

    const access = await getAdminAccessByEmail(user.email);

    if (!access.isAdmin) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const [employeesRes, linksRes, settingsRes, logsRes] = await Promise.all([
      supabaseAdmin
        .from('employee_profiles')
        .select(
          'user_id, email, full_name, phone, role, home_restaurant_id, is_blocked, created_at, updated_at'
        )
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('telegram_links')
        .select(
          'user_id, email, telegram_user_id, chat_id, telegram_username, telegram_first_name, telegram_last_name, is_active, linked_at, updated_at'
        )
        .eq('is_active', true)
        .order('linked_at', { ascending: false }),
      supabaseAdmin
        .from('telegram_notification_settings')
        .select('user_id, is_enabled, updated_at'),
      supabaseAdmin
        .from('telegram_notification_log')
        .select(
          'id, user_id, application_id, job_id, telegram_user_id, notification_kind, status, payload, sent_at, error_message'
        )
        .order('sent_at', { ascending: false })
        .limit(100),
    ]);

    const employees = (employeesRes.data || []) as EmployeeProfile[];
    const links = (linksRes.data || []) as TelegramLinkRow[];
    const settings = (settingsRes.data || []) as TelegramSettingsRow[];
    const logs = (logsRes.data || []) as TelegramLogRow[];

    const employeeMap = new Map<string, EmployeeProfile>();
    employees.forEach((item) => employeeMap.set(item.user_id, item));

    const settingsMap = new Map<string, TelegramSettingsRow>();
    settings.forEach((item) => settingsMap.set(item.user_id, item));

    const linkItems = links.map((item) => {
      const employee = employeeMap.get(item.user_id);
      const setting = settingsMap.get(item.user_id);

      return {
        userId: item.user_id,
        email: employee?.email || item.email,
        fullName: employee?.full_name || '',
        role: employee?.role || '',
        isBlocked: Boolean(employee?.is_blocked),
        telegramUserId: item.telegram_user_id,
        telegramUsername: formatTelegramUsername(item.telegram_username),
        linkedAt: item.linked_at,
        updatedAt: item.updated_at,
        notificationsEnabled: setting?.is_enabled ?? true,
      };
    });

    const logItems = logs.map((item) => {
      const employee = employeeMap.get(item.user_id);

      return {
        id: item.id,
        userId: item.user_id,
        email: employee?.email || '',
        fullName: employee?.full_name || '',
        notificationKind: item.notification_kind,
        status: item.status,
        sentAt: item.sent_at,
        errorMessage: item.error_message,
        payload: item.payload,
      };
    });

    return NextResponse.json({
      links: linkItems,
      logs: logItems,
    });
  } catch {
    return NextResponse.json(
      { error: 'Ошибка загрузки Telegram-данных' },
      { status: 500 }
    );
  }
}