'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

type LinkItem = {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  isBlocked: boolean;
  telegramUserId: number;
  telegramUsername: string | null;
  linkedAt: string;
  updatedAt: string;
  notificationsEnabled: boolean;
};

type LogItem = {
  id: number;
  userId: string;
  email: string;
  fullName: string;
  notificationKind: string;
  status: 'sent' | 'error' | 'skipped';
  sentAt: string;
  errorMessage: string | null;
  payload: unknown;
};

type ResponsePayload = {
  links: LinkItem[];
  logs: LogItem[];
};

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || null;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('Нет авторизации');
  }

  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(data?.error || 'Ошибка запроса');
  }

  return data as T;
}

function formatDateTime(value: string) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function formatNotificationKind(kind: string) {
  switch (kind) {
    case 'shift_reminder_48h':
      return 'Напоминание за 2 дня';
    case 'shift_reminder_24h':
      return 'Напоминание за 24 часа';
    case 'shift_reminder_12h':
      return 'Напоминание за 12 часов';
    case 'shift_reminder_8h':
      return 'Напоминание за 8 часов';
    case 'shift_reminder_4h':
      return 'Напоминание за 4 часа';
    case 'manual_test':
      return 'Тестовая отправка';
    case 'job:manual_test':
      return 'Тестовая отправка';
    default:
      return kind;
  }
}

export default function AdminTelegramPage() {
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const data = await fetchJson<ResponsePayload>('/api/admin/telegram');
      setLinks(data.links || []);
      setLogs(data.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки Telegram-данных');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleTestSend(userId: string) {
    setSavingUserId(userId);
    setError('');
    setNotice('');

    try {
      const data = await fetchJson<{ success: true; message: string }>(
        '/api/admin/telegram/test',
        {
          method: 'POST',
          body: JSON.stringify({ userId }),
        }
      );

      setNotice(data.message || 'Тестовая отправка поставлена в очередь');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка тестовой отправки');
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin"
        className="inline-flex rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        ← Назад в админку
      </Link>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-semibold">Telegram-уведомления</h1>
        <p className="mb-5 text-sm text-gray-600">
          Здесь видно, кто уже привязал Telegram, у кого уведомления выключены и
          какие сообщения отправлялись последними.
        </p>

        {notice && (
          <div className="mb-4 rounded-xl bg-green-50 p-4 text-sm text-green-700">
            {notice}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            Загружаю Telegram-данные...
          </div>
        ) : links.length === 0 ? (
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            Пока никто не привязал Telegram.
          </div>
        ) : (
          <div className="space-y-3">
            {links.map((item) => (
              <div
                key={item.userId}
                className="rounded-xl border p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      {item.fullName || 'Без ФИО'} · {item.email}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-600">
                      <span className="rounded-full bg-gray-100 px-2 py-1">
                        {item.role || 'Роль не указана'}
                      </span>

                      {item.telegramUsername && (
                        <span className="rounded-full bg-gray-100 px-2 py-1">
                          {item.telegramUsername}
                        </span>
                      )}

                      <span className="rounded-full bg-gray-100 px-2 py-1">
                        TG ID: {item.telegramUserId}
                      </span>

                      <span className="rounded-full bg-gray-100 px-2 py-1">
                        Привязка: {formatDateTime(item.linkedAt)}
                      </span>

                      <span
                        className={`rounded-full px-2 py-1 ${
                          item.notificationsEnabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {item.notificationsEnabled
                          ? 'Уведомления включены'
                          : 'Уведомления выключены'}
                      </span>

                      {item.isBlocked && (
                        <span className="rounded-full bg-red-100 px-2 py-1 text-red-800">
                          Профиль заблокирован
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleTestSend(item.userId)}
                    disabled={savingUserId === item.userId}
                    className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingUserId === item.userId
                      ? 'Ставлю в очередь...'
                      : 'Тестовая отправка'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-xl font-semibold">Последние отправки</h2>
        <p className="mb-5 text-sm text-gray-600">
          История фактических отправок и ошибок бота.
        </p>

        {loading ? (
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            Загружаю историю...
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            История пока пуста.
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border p-4"
              >
                <div className="mb-2 flex flex-wrap gap-2 text-xs text-gray-600">
                  <span className="rounded-full bg-gray-100 px-2 py-1">
                    {formatNotificationKind(item.notificationKind)}
                  </span>

                  <span
                    className={`rounded-full px-2 py-1 ${
                      item.status === 'sent'
                        ? 'bg-green-100 text-green-800'
                        : item.status === 'error'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {item.status}
                  </span>

                  <span className="rounded-full bg-gray-100 px-2 py-1">
                    {formatDateTime(item.sentAt)}
                  </span>
                </div>

                <div className="text-sm text-gray-700">
                  <div>
                    <span className="text-gray-500">Сотрудник:</span>{' '}
                    <b>{item.fullName || 'Без ФИО'}</b>
                    {item.email ? ` (${item.email})` : ''}
                  </div>

                  {item.errorMessage && (
                    <div className="mt-2 text-red-700">
                      <span className="text-red-500">Ошибка:</span> {item.errorMessage}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}