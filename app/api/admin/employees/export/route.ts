import { NextRequest } from 'next/server';

import { formatActivityStatus } from '@/lib/activity-format';
import { ApiError, getCurrentAdminContext, jsonError } from '@/lib/admin-api-auth';
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
};

type Restaurant = {
  id: number;
  name: string;
};

type ActivitySummary = {
  user_id: string;
  last_seen_at: string | null;
  last_seen_source: string | null;
  last_page: string | null;
  last_login_at: string | null;
  last_application_at: string | null;
  last_action_at: string | null;
  ping_count: number | null;
};

const CSV_HEADERS = [
  'Ресторан',
  'ID ресторана',
  'Зарегистрировано сотрудников в ресторане',
  'ФИО',
  'Email',
  'Телефон',
  'Роль',
  'Статус сотрудника',
  'Дата регистрации',
  'Последняя активность',
  'Последняя активность — точное время',
  'Последний вход',
  'Последний отклик',
  'Последнее действие',
  'Последняя страница',
  'Источник активности',
  'Сигналов активности',
];

const PAGE_SIZE = 1000;

async function listEmployeeProfiles() {
  const rows: EmployeeProfile[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('employee_profiles')
      .select(
        'user_id, email, full_name, phone, role, home_restaurant_id, is_blocked, created_at'
      )
      .order('user_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const page = (data || []) as EmployeeProfile[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) return rows;
  }
}

async function listActivitySummaries() {
  const rows: ActivitySummary[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from('user_activity_summary')
      .select(
        'user_id, last_seen_at, last_seen_source, last_page, last_login_at, last_application_at, last_action_at, ping_count'
      )
      .order('user_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const page = (data || []) as ActivitySummary[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) return rows;
  }
}

function formatMoscowDateTime(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function protectSpreadsheetCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);

  // Excel interprets these prefixes as formulas, including values supplied by users.
  if (/^\s*[=+\-@]/.test(text)) return `'${text}`;

  return text;
}

function csvCell(value: unknown) {
  return `"${protectSpreadsheetCell(value).replace(/"/g, '""')}"`;
}

function buildCsv(rows: unknown[][]) {
  const lines = [CSV_HEADERS, ...rows].map((row) => row.map(csvCell).join(';'));

  return `\uFEFFsep=;\r\n${lines.join('\r\n')}\r\n`;
}

function getMoscowDateStamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

export async function GET(req: NextRequest) {
  try {
    const context = await getCurrentAdminContext(req);

    if (!context.isSuperadmin) {
      throw new ApiError('Выгрузка сотрудников доступна только суперадмину', 403);
    }

    const [employees, restaurantsResult, activity] = await Promise.all([
      listEmployeeProfiles(),
      supabaseAdmin.from('restaurants').select('id, name'),
      listActivitySummaries(),
    ]);

    if (restaurantsResult.error) throw new Error(restaurantsResult.error.message);

    const restaurants = (restaurantsResult.data || []) as Restaurant[];
    const restaurantById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));
    const activityByUserId = new Map(activity.map((item) => [item.user_id, item]));
    const employeeCountByRestaurantId = new Map<number | null, number>();

    employees.forEach((employee) => {
      const restaurantId = employee.home_restaurant_id || null;
      employeeCountByRestaurantId.set(
        restaurantId,
        (employeeCountByRestaurantId.get(restaurantId) || 0) + 1
      );
    });

    const sortedEmployees = employees.toSorted((left, right) => {
      const leftRestaurant = left.home_restaurant_id
        ? restaurantById.get(left.home_restaurant_id)?.name || ''
        : '';
      const rightRestaurant = right.home_restaurant_id
        ? restaurantById.get(right.home_restaurant_id)?.name || ''
        : '';
      const restaurantCompare = leftRestaurant.localeCompare(rightRestaurant, 'ru');

      if (restaurantCompare !== 0) return restaurantCompare;

      return (left.full_name || left.email).localeCompare(right.full_name || right.email, 'ru');
    });

    const rows = sortedEmployees.map((employee) => {
      const restaurantId = employee.home_restaurant_id || null;
      const restaurant = restaurantId ? restaurantById.get(restaurantId) : null;
      const employeeActivity = activityByUserId.get(employee.user_id);

      return [
        restaurant?.name || 'Ресторан не указан',
        restaurantId || '',
        employeeCountByRestaurantId.get(restaurantId) || 0,
        employee.full_name || '',
        employee.email || '',
        employee.phone || '',
        employee.role || '',
        employee.is_blocked ? 'Заблокирован' : 'Активен',
        formatMoscowDateTime(employee.created_at),
        formatActivityStatus(employeeActivity?.last_seen_at),
        formatMoscowDateTime(employeeActivity?.last_seen_at),
        formatMoscowDateTime(employeeActivity?.last_login_at),
        formatMoscowDateTime(employeeActivity?.last_application_at),
        formatMoscowDateTime(employeeActivity?.last_action_at),
        employeeActivity?.last_page || '',
        employeeActivity?.last_seen_source || '',
        employeeActivity?.ping_count ?? 0,
      ];
    });

    const date = getMoscowDateStamp();

    return new Response(buildCsv(rows), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="employees-${date}.csv"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return jsonError(error, 'Не удалось сформировать выгрузку сотрудников');
  }
}
