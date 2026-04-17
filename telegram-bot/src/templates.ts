import { Markup } from 'telegraf';

import { config } from './config.js';

export type ReminderKind =
  | 'shift_reminder_48h'
  | 'shift_reminder_24h'
  | 'shift_reminder_12h'
  | 'shift_reminder_8h'
  | 'shift_reminder_4h';

export const REMINDER_RULES: Array<{
  kind: ReminderKind;
  minutesBefore: number;
  label: string;
}> = [
  { kind: 'shift_reminder_48h', minutesBefore: 48 * 60, label: '2 дня' },
  { kind: 'shift_reminder_24h', minutesBefore: 24 * 60, label: '24 часа' },
  { kind: 'shift_reminder_12h', minutesBefore: 12 * 60, label: '12 часов' },
  { kind: 'shift_reminder_8h', minutesBefore: 8 * 60, label: '8 часов' },
  { kind: 'shift_reminder_4h', minutesBefore: 4 * 60, label: '4 часа' },
];

function formatDateRu(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

export function buildNotificationKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('Мои отклики', `${config.appBaseUrl}/my-applications`)],
    [Markup.button.callback('Отключить уведомления', 'disable_notifications')],
  ]).reply_markup;
}

export function buildStartKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('Мои отклики', `${config.appBaseUrl}/my-applications`)],
  ]).reply_markup;
}

export function buildShiftReminderMessage(params: {
  restaurantName: string;
  workDate: string;
  timeFrom: string;
  timeTo: string;
  label: string;
}) {
  return [
    'Напоминание о смене',
    '',
    `Ресторан: ${params.restaurantName}`,
    `Дата: ${formatDateRu(params.workDate)}`,
    `Время: ${params.timeFrom}–${params.timeTo}`,
    '',
    `До начала осталось ${params.label}.`,
  ].join('\n');
}

export function buildManualTestMessage(customMessage?: string | null) {
  return (
    customMessage ||
    [
      'Тестовое уведомление',
      '',
      'Telegram-бот подключён и может отправлять напоминания по одобренным сменам.',
    ].join('\n')
  );
}

export function buildStartMessage() {
  return [
    'Бот Арт Рест подключён.',
    '',
    'Здесь будут приходить напоминания по одобренным сменам.',
    'Если ты открыл бота из профиля сайта, просто нажми кнопку Start.',
  ].join('\n');
}

export function buildLinkSuccessMessage() {
  return [
    'Telegram успешно привязан.',
    '',
    'Теперь ты будешь получать короткие уведомления по одобренным сменам.',
  ].join('\n');
}

export function buildLinkErrorMessage() {
  return [
    'Ссылка привязки недействительна или истекла.',
    '',
    'Вернись на сайт, нажми «Привязать Telegram» и попробуй ещё раз.',
  ].join('\n');
}