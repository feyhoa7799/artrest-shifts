import { sendMail } from '@/lib/smtp-mailer';
import { formatDateRu, formatHours, formatShiftTimeRange, getShiftMeta } from '@/lib/shift';
import { supabaseAdmin } from '@/lib/supabase-admin';

type RestaurantRow = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  metro: string | null;
};

type SlotRow = {
  id: number;
  restaurant_id: number;
  work_date: string;
  time_from: string;
  time_to: string;
  position: string | null;
  hourly_rate: number | null;
  comment: string | null;
};

type EmployeeProfileRow = {
  email: string;
  full_name: string;
  phone: string;
  role: string;
  home_restaurant_id: number;
};

type NotificationSettingsRow = {
  application_notification_email: string | null;
};

type NotifyInput = {
  applicationId: number;
  slot: SlotRow;
  employeeProfile: EmployeeProfileRow;
};

const DEFAULT_SITE_URL = 'https://podrabotka.art-rest.com';

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    DEFAULT_SITE_URL
  ).replace(/\/$/, '');
}

function getAdminApplicationUrl(applicationId: number) {
  const url = new URL('/admin', getSiteUrl());

  url.searchParams.set('tab', 'applications');
  url.searchParams.set('q', String(applicationId));

  return url.toString();
}

function formatMoney(value: number | null | undefined) {
  if (!value) return '—';
  return `${value} ₽/час`;
}

async function getNotificationEmail() {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('application_notification_email')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error('Application notification settings read failed:', error.message);
    return null;
  }

  const settings = data as NotificationSettingsRow | null;
  const email = settings?.application_notification_email?.trim();

  return email || null;
}

async function getRestaurant(id: number) {
  const { data, error } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, address, city, metro')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Application notification restaurant read failed:', error.message);
    return null;
  }

  return (data || null) as RestaurantRow | null;
}

async function getHomeRestaurantName(id: number) {
  const { data, error } = await supabaseAdmin
    .from('restaurants')
    .select('name')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Application notification home restaurant read failed:', error.message);
    return '—';
  }

  return String(data?.name || '—');
}

function buildPlainText(params: {
  applicationId: number;
  slot: SlotRow;
  restaurant: RestaurantRow | null;
  homeRestaurantName: string;
  employeeProfile: EmployeeProfileRow;
  adminUrl: string;
}) {
  const meta = getShiftMeta(params.slot.time_from, params.slot.time_to);

  return [
    'У вас новый отклик на слот.',
    '',
    `Отклик: #${params.applicationId}`,
    `Сотрудник: ${params.employeeProfile.full_name}`,
    `Email сотрудника: ${params.employeeProfile.email || '—'}`,
    `Телефон: ${params.employeeProfile.phone || '—'}`,
    `Роль: ${params.employeeProfile.role || '—'}`,
    `Домашний ресторан: ${params.homeRestaurantName}`,
    '',
    'Слот:',
    `Ресторан: ${params.restaurant?.name || '—'}`,
    `Адрес: ${params.restaurant?.address || '—'}`,
    `Город: ${params.restaurant?.city || '—'}`,
    `Метро: ${params.restaurant?.metro || '—'}`,
    `Дата: ${formatDateRu(params.slot.work_date)}`,
    `Время: ${formatShiftTimeRange(params.slot.time_from, params.slot.time_to, meta.overnight)}`,
    `Длительность: ${formatHours(meta.hours)}`,
    `Должность: ${params.slot.position || '—'}`,
    `Оплата: ${formatMoney(params.slot.hourly_rate)}`,
    `Комментарий: ${params.slot.comment || '—'}`,
    '',
    `Перейти к обработке: ${params.adminUrl}`,
  ].join('\n');
}

function buildHtml(params: {
  applicationId: number;
  slot: SlotRow;
  restaurant: RestaurantRow | null;
  homeRestaurantName: string;
  employeeProfile: EmployeeProfileRow;
  adminUrl: string;
}) {
  const meta = getShiftMeta(params.slot.time_from, params.slot.time_to);

  const rows = [
    ['Отклик', `#${params.applicationId}`],
    ['Сотрудник', params.employeeProfile.full_name],
    ['Email сотрудника', params.employeeProfile.email || '—'],
    ['Телефон', params.employeeProfile.phone || '—'],
    ['Роль', params.employeeProfile.role || '—'],
    ['Домашний ресторан', params.homeRestaurantName],
    ['Ресторан слота', params.restaurant?.name || '—'],
    ['Адрес', params.restaurant?.address || '—'],
    ['Город', params.restaurant?.city || '—'],
    ['Метро', params.restaurant?.metro || '—'],
    ['Дата', formatDateRu(params.slot.work_date)],
    ['Время', formatShiftTimeRange(params.slot.time_from, params.slot.time_to, meta.overnight)],
    ['Длительность', formatHours(meta.hours)],
    ['Должность', params.slot.position || '—'],
    ['Оплата', formatMoney(params.slot.hourly_rate)],
    ['Комментарий', params.slot.comment || '—'],
  ];

  const tableRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;color:#6b7280;width:190px;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;color:#111827;font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>У вас новый отклик</title>
  </head>
  <body style="margin:0;background:#f7f7f7;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:720px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border-radius:18px;padding:24px;border:1px solid #eeeeee;">
        <div style="display:inline-block;background:#fee2e2;color:#b91c1c;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:700;margin-bottom:14px;">
          Новый отклик
        </div>

        <h1 style="font-size:24px;line-height:1.25;margin:0 0 10px;">У вас новый отклик на слот</h1>
        <p style="font-size:15px;line-height:1.5;color:#4b5563;margin:0 0 22px;">
          Ниже информация по сотруднику и смене. Нажмите кнопку, чтобы перейти к обработке отклика в админке.
        </p>

        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #eeeeee;border-radius:14px;overflow:hidden;margin-bottom:24px;">
          ${tableRows}
        </table>

        <a href="${escapeHtml(params.adminUrl)}" style="display:inline-block;background:#ef4444;color:#ffffff;text-decoration:none;border-radius:12px;padding:14px 20px;font-weight:700;">
          Перейти к обработке отклика
        </a>

        <p style="font-size:13px;line-height:1.45;color:#6b7280;margin:18px 0 0;">
          Если вы не авторизованы, сайт сначала откроет страницу входа, а после входа вернёт вас в админский раздел.
        </p>
      </div>
    </div>
  </body>
</html>`;
}

export async function notifyAboutNewApplication(input: NotifyInput) {
  try {
    const recipient = await getNotificationEmail();

    if (!recipient) {
      return { sent: false, reason: 'Email для уведомлений не указан' };
    }

    const [restaurant, homeRestaurantName] = await Promise.all([
      getRestaurant(input.slot.restaurant_id),
      getHomeRestaurantName(input.employeeProfile.home_restaurant_id),
    ]);

    const adminUrl = getAdminApplicationUrl(input.applicationId);

    return sendMail({
      to: recipient,
      subject: `У вас новый отклик на слот #${input.applicationId}`,
      text: buildPlainText({
        applicationId: input.applicationId,
        slot: input.slot,
        restaurant,
        homeRestaurantName,
        employeeProfile: input.employeeProfile,
        adminUrl,
      }),
      html: buildHtml({
        applicationId: input.applicationId,
        slot: input.slot,
        restaurant,
        homeRestaurantName,
        employeeProfile: input.employeeProfile,
        adminUrl,
      }),
    });
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : 'Ошибка подготовки уведомления',
    };
  }
}
