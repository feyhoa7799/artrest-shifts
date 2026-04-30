'use client';

import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

type SettingsResponse = {
  applicationNotificationEmail: string;
  updatedAt: string | null;
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

function formatDateTime(value: string | null) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export default function NotificationSettingsManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const data = await fetchJson<SettingsResponse>('/api/admin/notification-settings');

      setEmail(data.applicationNotificationEmail || '');
      setUpdatedAt(data.updatedAt || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки настроек уведомлений');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSave() {
    setError('');
    setNotice('');
    setSaving(true);

    try {
      const data = await fetchJson<SettingsResponse & { success: true }>(
        '/api/admin/notification-settings',
        {
          method: 'POST',
          body: JSON.stringify({
            applicationNotificationEmail: email.trim(),
          }),
        }
      );

      setEmail(data.applicationNotificationEmail || '');
      setUpdatedAt(data.updatedAt || null);
      setNotice(
        data.applicationNotificationEmail
          ? 'Email для уведомлений сохранён'
          : 'Email для уведомлений очищен'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения настроек уведомлений');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="mb-2 text-2xl font-semibold">Email-уведомления об откликах</h2>
        <p className="text-sm text-gray-600">
          Укажите почту, на которую будут приходить письма «У вас новый отклик» с
          информацией по заявке и кнопкой перехода в админку.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
          Загружаю настройки уведомлений...
        </div>
      ) : (
        <div className="space-y-4">
          {notice && (
            <div className="rounded-xl bg-green-50 p-4 text-sm text-green-700">
              {notice}
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 md:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hr@example.ru"
              className="w-full rounded-lg border p-3"
            />

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Сохраняю...' : 'Сохранить'}
            </button>
          </div>

          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            <p>
              Текущий отправитель: <b>noreply@podrabotka.art-rest.com</b>
            </p>
            <p className="mt-1">
              Последнее изменение: <b>{formatDateTime(updatedAt)}</b>
            </p>
            <p className="mt-2 text-gray-600">
              Если поле оставить пустым, новые отклики будут сохраняться в админке,
              но письма отправляться не будут.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
