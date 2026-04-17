import type { Telegraf } from 'telegraf';

import { supabase } from './db.js';
import { config } from './config.js';
import {
  REMINDER_RULES,
  buildManualTestMessage,
  buildNotificationKeyboard,
  buildShiftApprovedMessage,
  buildShiftCancelledMessage,
  buildShiftReminderMessage,
} from './templates.js';

type NotificationJob = {
  id: number;
  user_id: string;
  kind: string;
  payload: {
    message?: string;
    requested_by?: string;
  } | null;
  scheduled_for: string;
  status: 'pending' | 'sent' | 'error' | 'cancelled';
  created_at: string;
  sent_at: string | null;
  error_message: string | null;
};

type ApplicationRow = {
  id: number;
  slot_id: number;
  employee_user_id: string | null;
  status: 'pending' | 'approved' | 'rejected' | null;
  rejection_reason: string | null;
};

type SlotRow = {
  id: number;
  restaurant_id: number;
  work_date: string;
  time_from: string;
  time_to: string;
  status: 'open' | 'pending' | 'closed' | 'assigned';
};

type RestaurantRow = {
  id: number;
  name: string;
  address: string | null;
};

type TelegramLinkRow = {
  user_id: string;
  telegram_user_id: number;
  chat_id: number;
  telegram_username: string | null;
  is_active: boolean;
};

type TelegramSettingsRow = {
  user_id: string;
  is_enabled: boolean;
};

type NotificationLogRow = {
  application_id: number | null;
  notification_kind: string;
  status: 'sent' | 'error' | 'skipped';
};

function normalizeTimeForIso(value: string) {
  const parts = value.split(':');
  const hh = (parts[0] || '00').padStart(2, '0');
  const mm = (parts[1] || '00').padStart(2, '0');
  const ss = (parts[2] || '00').padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function parseShiftStart(workDate: string, timeFrom: string) {
  return new Date(`${workDate}T${normalizeTimeForIso(timeFrom)}+03:00`);
}

function parseShiftEnd(workDate: string, timeFrom: string, timeTo: string) {
  const start = parseShiftStart(workDate, timeFrom);
  const end = new Date(`${workDate}T${normalizeTimeForIso(timeTo)}+03:00`);

  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return end;
}

function minutesUntil(date: Date) {
  return Math.floor((date.getTime() - Date.now()) / 60_000);
}

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message;
  return 'Unknown error';
}

async function writeLog(params: {
  userId: string;
  applicationId?: number | null;
  jobId?: number | null;
  telegramUserId?: number | null;
  notificationKind: string;
  status: 'sent' | 'error' | 'skipped';
  payload?: unknown;
  errorMessage?: string | null;
}) {
  await supabase.from('telegram_notification_log').insert({
    user_id: params.userId,
    application_id: params.applicationId || null,
    job_id: params.jobId || null,
    telegram_user_id: params.telegramUserId || null,
    notification_kind: params.notificationKind,
    status: params.status,
    payload: params.payload || {},
    sent_at: new Date().toISOString(),
    error_message: params.errorMessage || null,
  });
}

async function processPendingJobs(bot: Telegraf) {
  const { data } = await supabase
    .from('telegram_notification_jobs')
    .select(
      'id, user_id, kind, payload, scheduled_for, status, created_at, sent_at, error_message'
    )
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(50);

  const jobs = (data || []) as NotificationJob[];

  for (const job of jobs) {
    const { data: link } = await supabase
      .from('telegram_links')
      .select('user_id, telegram_user_id, chat_id, telegram_username, is_active')
      .eq('user_id', job.user_id)
      .eq('is_active', true)
      .maybeSingle();

    const telegramLink = (link || null) as TelegramLinkRow | null;

    if (!telegramLink) {
      await supabase
        .from('telegram_notification_jobs')
        .update({
          status: 'error',
          error_message: 'Telegram link not found',
          sent_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      await writeLog({
        userId: job.user_id,
        jobId: job.id,
        notificationKind: job.kind,
        status: 'error',
        payload: job.payload || {},
        errorMessage: 'Telegram link not found',
      });

      continue;
    }

    try {
      const text = buildManualTestMessage(job.payload?.message || null);

      await bot.telegram.sendMessage(telegramLink.chat_id, text, {
        reply_markup: buildNotificationKeyboard(),
      });

      await supabase
        .from('telegram_notification_jobs')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', job.id);

      await writeLog({
        userId: job.user_id,
        jobId: job.id,
        telegramUserId: telegramLink.telegram_user_id,
        notificationKind: job.kind,
        status: 'sent',
        payload: job.payload || {},
      });
    } catch (error) {
      const message = errorMessage(error);

      await supabase
        .from('telegram_notification_jobs')
        .update({
          status: 'error',
          sent_at: new Date().toISOString(),
          error_message: message,
        })
        .eq('id', job.id);

      await writeLog({
        userId: job.user_id,
        jobId: job.id,
        telegramUserId: telegramLink.telegram_user_id,
        notificationKind: job.kind,
        status: 'error',
        payload: job.payload || {},
        errorMessage: message,
      });
    }
  }
}

async function processShiftNotifications(bot: Telegraf) {
  const { data: applicationsData } = await supabase
    .from('applications')
    .select('id, slot_id, employee_user_id, status, rejection_reason');

  const applications = (applicationsData || []) as ApplicationRow[];

  if (!applications.length) {
    return;
  }

  const slotIds = Array.from(new Set(applications.map((item) => item.slot_id)));
  const userIds = Array.from(
    new Set(
      applications
        .map((item) => item.employee_user_id)
        .filter((item): item is string => Boolean(item))
    )
  );

  if (!slotIds.length || !userIds.length) {
    return;
  }

  const [{ data: slotsData }, { data: linksData }, { data: settingsData }] =
    await Promise.all([
      supabase
        .from('slots')
        .select('id, restaurant_id, work_date, time_from, time_to, status')
        .in('id', slotIds),
      supabase
        .from('telegram_links')
        .select('user_id, telegram_user_id, chat_id, telegram_username, is_active')
        .in('user_id', userIds)
        .eq('is_active', true),
      supabase
        .from('telegram_notification_settings')
        .select('user_id, is_enabled')
        .in('user_id', userIds),
    ]);

  const slots = (slotsData || []) as SlotRow[];
  const links = (linksData || []) as TelegramLinkRow[];
  const settings = (settingsData || []) as TelegramSettingsRow[];

  const restaurantIds = Array.from(new Set(slots.map((item) => item.restaurant_id)));

  const [{ data: restaurantsData }, { data: logsData }] = await Promise.all([
    supabase
      .from('restaurants')
      .select('id, name, address')
      .in('id', restaurantIds),
    supabase
      .from('telegram_notification_log')
      .select('application_id, notification_kind, status')
      .in('application_id', applications.map((item) => item.id))
      .eq('status', 'sent'),
  ]);

  const restaurants = (restaurantsData || []) as RestaurantRow[];
  const logs = (logsData || []) as NotificationLogRow[];

  const slotMap = new Map<number, SlotRow>();
  slots.forEach((item) => slotMap.set(item.id, item));

  const restaurantMap = new Map<number, RestaurantRow>();
  restaurants.forEach((item) => restaurantMap.set(item.id, item));

  const linkMap = new Map<string, TelegramLinkRow>();
  links.forEach((item) => linkMap.set(item.user_id, item));

  const settingsMap = new Map<string, boolean>();
  settings.forEach((item) => settingsMap.set(item.user_id, item.is_enabled));

  const sentKeys = new Set<string>();
  logs.forEach((item) => {
    if (item.application_id) {
      sentKeys.add(`${item.application_id}:${item.notification_kind}`);
    }
  });

  for (const app of applications) {
    if (!app.employee_user_id) continue;

    const slot = slotMap.get(app.slot_id);
    if (!slot) continue;

    const link = linkMap.get(app.employee_user_id);
    if (!link) continue;

    const notificationsEnabled = settingsMap.get(app.employee_user_id) ?? true;
    if (!notificationsEnabled) continue;

    const restaurant = restaurantMap.get(slot.restaurant_id);
    const startAt = parseShiftStart(slot.work_date, slot.time_from);
    const endAt = parseShiftEnd(slot.work_date, slot.time_from, slot.time_to);
    const diffMinutes = minutesUntil(startAt);
    const isFinished = endAt.getTime() < Date.now();

    if (app.status === 'approved' && !isFinished) {
      const approvedKey = `${app.id}:shift_approved`;

      if (!sentKeys.has(approvedKey)) {
        try {
          const text = buildShiftApprovedMessage({
            restaurantName: restaurant?.name || 'Ресторан',
            workDate: slot.work_date,
            timeFrom: slot.time_from,
            timeTo: slot.time_to,
          });

          await bot.telegram.sendMessage(link.chat_id, text, {
            reply_markup: buildNotificationKeyboard(),
          });

          await writeLog({
            userId: app.employee_user_id,
            applicationId: app.id,
            telegramUserId: link.telegram_user_id,
            notificationKind: 'shift_approved',
            status: 'sent',
            payload: {
              slotId: slot.id,
              restaurantId: slot.restaurant_id,
              restaurantName: restaurant?.name || 'Ресторан',
              workDate: slot.work_date,
              timeFrom: slot.time_from,
              timeTo: slot.time_to,
            },
          });

          sentKeys.add(approvedKey);
        } catch (error) {
          await writeLog({
            userId: app.employee_user_id,
            applicationId: app.id,
            telegramUserId: link.telegram_user_id,
            notificationKind: 'shift_approved',
            status: 'error',
            payload: {
              slotId: slot.id,
              restaurantId: slot.restaurant_id,
              workDate: slot.work_date,
              timeFrom: slot.time_from,
              timeTo: slot.time_to,
            },
            errorMessage: errorMessage(error),
          });
        }
      }
    }

    if (
      app.status === 'rejected' &&
      app.rejection_reason !== 'Отклик отменён сотрудником'
    ) {
      const approvedKey = `${app.id}:shift_approved`;
      const cancelledKey = `${app.id}:shift_cancelled`;

      if (sentKeys.has(approvedKey) && !sentKeys.has(cancelledKey)) {
        try {
          const text = buildShiftCancelledMessage({
            restaurantName: restaurant?.name || 'Ресторан',
            workDate: slot.work_date,
            timeFrom: slot.time_from,
            timeTo: slot.time_to,
          });

          await bot.telegram.sendMessage(link.chat_id, text, {
            reply_markup: buildNotificationKeyboard(),
          });

          await writeLog({
            userId: app.employee_user_id,
            applicationId: app.id,
            telegramUserId: link.telegram_user_id,
            notificationKind: 'shift_cancelled',
            status: 'sent',
            payload: {
              slotId: slot.id,
              restaurantId: slot.restaurant_id,
              restaurantName: restaurant?.name || 'Ресторан',
              workDate: slot.work_date,
              timeFrom: slot.time_from,
              timeTo: slot.time_to,
              rejectionReason: app.rejection_reason,
            },
          });

          sentKeys.add(cancelledKey);
        } catch (error) {
          await writeLog({
            userId: app.employee_user_id,
            applicationId: app.id,
            telegramUserId: link.telegram_user_id,
            notificationKind: 'shift_cancelled',
            status: 'error',
            payload: {
              slotId: slot.id,
              restaurantId: slot.restaurant_id,
              workDate: slot.work_date,
              timeFrom: slot.time_from,
              timeTo: slot.time_to,
              rejectionReason: app.rejection_reason,
            },
            errorMessage: errorMessage(error),
          });
        }
      }
    }

    if (app.status !== 'approved') continue;
    if (isFinished) continue;
    if (diffMinutes <= 0) continue;

    for (const rule of REMINDER_RULES) {
      if (diffMinutes > rule.minutesBefore) continue;
      if (diffMinutes <= rule.minutesBefore - config.reminderWindowMinutes) continue;

      const dedupeKey = `${app.id}:${rule.kind}`;
      if (sentKeys.has(dedupeKey)) continue;

      try {
        const text = buildShiftReminderMessage({
          restaurantName: restaurant?.name || 'Ресторан',
          workDate: slot.work_date,
          timeFrom: slot.time_from,
          timeTo: slot.time_to,
          label: rule.label,
        });

        await bot.telegram.sendMessage(link.chat_id, text, {
          reply_markup: buildNotificationKeyboard(),
        });

        await writeLog({
          userId: app.employee_user_id,
          applicationId: app.id,
          telegramUserId: link.telegram_user_id,
          notificationKind: rule.kind,
          status: 'sent',
          payload: {
            slotId: slot.id,
            restaurantId: slot.restaurant_id,
            restaurantName: restaurant?.name || 'Ресторан',
            workDate: slot.work_date,
            timeFrom: slot.time_from,
            timeTo: slot.time_to,
          },
        });

        sentKeys.add(dedupeKey);
      } catch (error) {
        await writeLog({
          userId: app.employee_user_id,
          applicationId: app.id,
          telegramUserId: link.telegram_user_id,
          notificationKind: rule.kind,
          status: 'error',
          payload: {
            slotId: slot.id,
            restaurantId: slot.restaurant_id,
            workDate: slot.work_date,
            timeFrom: slot.time_from,
            timeTo: slot.time_to,
          },
          errorMessage: errorMessage(error),
        });
      }
    }
  }
}

export function startWorker(bot: Telegraf) {
  const run = async () => {
    try {
      await processPendingJobs(bot);
      await processShiftNotifications(bot);
    } catch (error) {
      console.error('[telegram-bot] worker cycle failed:', error);
    }
  };

  void run();

  const timer = setInterval(() => {
    void run();
  }, config.pollIntervalMs);

  return () => {
    clearInterval(timer);
  };
}