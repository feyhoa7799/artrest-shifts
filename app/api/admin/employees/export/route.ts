import { NextRequest } from 'next/server';

import { formatActivityStatus } from '@/lib/activity-format';
import { ApiError, getCurrentAdminContext, jsonError } from '@/lib/admin-api-auth';
import { buildEmployeeWorkbook } from '@/lib/employee-export-xlsx';
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

const EMPLOYEE_HEADERS = [
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

const SUMMARY_HEADERS = ['Ресторан', 'ID ресторана', 'Зарегистрировано сотрудников'];

const PAGE_SIZE = 1000;

async function listEmployeeProfiles(restaurantIds: number[] | null) {
  const rows: EmployeeProfile[] = [];

  if (Array.isArray(restaurantIds) && restaurantIds.length === 0) return rows;

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabaseAdmin
      .from('employee_profiles')
      .select(
        'user_id, email, full_name, phone, role, home_restaurant_id, is_blocked, created_at'
      );

    if (Array.isArray(restaurantIds)) {
      query = query.in('home_restaurant_id', restaurantIds);
    }

    const { data, error } = await query
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

async function listRestaurants(restaurantIds: number[] | null) {
  if (Array.isArray(restaurantIds) && restaurantIds.length === 0) return [];

  let query = supabaseAdmin.from('restaurants').select('id, name');

  if (Array.isArray(restaurantIds)) {
    query = query.in('id', restaurantIds);
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []) as Restaurant[];
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

    if (!context.isAdmin) {
      throw new ApiError('Выгрузка сотрудников доступна только администраторам', 403);
    }

    const [employees, restaurants, activity] = await Promise.all([
      listEmployeeProfiles(context.accessibleRestaurantIds),
      listRestaurants(context.accessibleRestaurantIds),
      listActivitySummaries(),
    ]);
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

    const employeeRows = sortedEmployees.map((employee) => {
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

    const summaryRows = restaurants
      .map((restaurant) => [
        restaurant.name,
        restaurant.id,
        employeeCountByRestaurantId.get(restaurant.id) || 0,
      ])
      .sort((left, right) => {
        const countDiff = Number(right[2]) - Number(left[2]);

        if (countDiff !== 0) return countDiff;

        return String(left[0]).localeCompare(String(right[0]), 'ru');
      });

    if (employeeCountByRestaurantId.has(null)) {
      summaryRows.push([
        'Ресторан не указан',
        '',
        employeeCountByRestaurantId.get(null) || 0,
      ]);
    }

    const workbook = buildEmployeeWorkbook([
      {
        name: 'Сводка',
        headers: SUMMARY_HEADERS,
        rows: summaryRows,
        widths: [42, 16, 32],
      },
      {
        name: 'Сотрудники',
        headers: EMPLOYEE_HEADERS,
        rows: employeeRows,
        widths: [38, 14, 28, 30, 34, 20, 22, 20, 20, 22, 26, 22, 22, 22, 24, 20, 20],
      },
    ]);

    const date = getMoscowDateStamp();

    return new Response(new Uint8Array(workbook), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="employees-${date}.xlsx"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return jsonError(error, 'Не удалось сформировать выгрузку сотрудников');
  }
}
