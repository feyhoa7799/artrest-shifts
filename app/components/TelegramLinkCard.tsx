'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

type TelegramStatus = {
  isLinked: boolean;
  botUsername: string | null;
  botUrl: string | null;
  telegramUsername: string | null;
  linkedAt: string | null;
  notificationsEnabled: boolean;
};

type LinkResponse = {
  deepLink: string;
  expiresAt: string;
  botUsername: string;
  botUrl: string | null;
};

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || null;
}

function formatDateTime(value: string | null) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export default function TelegramLinkCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const token = await getAccessToken();

      if (!token) {
        setError('Нет активной сессии');
        return;
      }

      const res = await fetch('/api/telegram/link', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'Ошибка загрузки статуса Telegram');
        return;
      }

      setStatus(data);
    } catch {
      setError('Ошибка загрузки статуса Telegram');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreateLink() {
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const token = await getAccessToken();

      if (!token) {
        setError('Нет активной сессии');
        return;
      }

      const res = await fetch('/api/telegram/link', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await res.json()) as LinkResponse & { error?: string };

      if (!res.ok) {
        setError(data?.error || 'Ошибка создания ссылки Telegram');
        return;
      }

      if (typeof window !== 'undefined') {
        window.open(data.deepLink, '_blank', 'noopener,noreferrer');
      }

      setNotice(
        'Открыли бота в новой вкладке. Нажми Start в Telegram, затем вернись и нажми "Проверить статус".'
      );
    } catch {
      setError('Ошибка создания ссылки Telegram');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const token = await getAccessToken();

      if (!token) {
        setError('Нет активной сессии');
        return;
      }

      const res = await fetch('/api/telegram/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'Ошибка обновления настроек уведомлений');
        return;
      }

      setStatus((prev) =>
        prev
          ? {
              ...prev,
              notificationsEnabled: enabled,
            }
          : prev
      );

      setNotice(
        enabled ? 'Уведомления Telegram включены.' : 'Уведомления Telegram отключены.'
      );
    } catch {
      setError('Ошибка обновления настроек уведомлений');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h3 className="mb-2 text-xl font-semibold">Telegram-уведомления</h3>
      <p className="mb-5 text-sm text-gray-600">
        Здесь можно привязать Telegram и получать короткие напоминания по одобренным
        сменам за 2 дня, 24 часа, 12 часов, 8 часов и 4 часа.
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
          Загружаю статус Telegram...
        </div>
      ) : (
        <>
          {!status?.isLinked ? (
            <div className="mb-4 rounded-xl bg-yellow-50 p-4 text-sm text-yellow-800">
              Telegram пока не привязан. Нажми кнопку ниже, перейди в бота и нажми
              Start.
            </div>
          ) : (
            <div className="mb-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="mb-1 text-sm text-gray-500">Статус</div>
                <div className="font-medium text-gray-900">Telegram подключён</div>
              </div>

              <div className="rounded-xl bg-gray-50 p-4">
                <div className="mb-1 text-sm text-gray-500">Аккаунт</div>
                <div className="font-medium text-gray-900">
                  {status.telegramUsername || 'Привязан без username'}
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 p-4">
                <div className="mb-1 text-sm text-gray-500">Уведомления</div>
                <div className="font-medium text-gray-900">
                  {status.notificationsEnabled ? 'Включены' : 'Отключены'}
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 p-4 md:col-span-3">
                <div className="mb-1 text-sm text-gray-500">Привязка выполнена</div>
                <div className="font-medium text-gray-900">
                  {formatDateTime(status.linkedAt)}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCreateLink}
              disabled={saving}
              className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? 'Подготавливаю ссылку...'
                : status?.isLinked
                  ? 'Перепривязать Telegram'
                  : 'Привязать Telegram'}
            </button>

            <button
              type="button"
              onClick={() => void load()}
              disabled={saving || loading}
              className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Проверить статус
            </button>

            {status?.botUrl && (
              <a
                href={status.botUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50"
              >
                Открыть бота
              </a>
            )}

            {status?.isLinked && (
              <button
                type="button"
                onClick={() => void handleToggle(!status.notificationsEnabled)}
                disabled={saving}
                className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status.notificationsEnabled
                  ? 'Отключить уведомления'
                  : 'Включить уведомления'}
              </button>
            )}

            <Link
              href="/my-applications"
              className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50"
            >
              Мои отклики
            </Link>
          </div>
        </>
      )}
    </div>
  );
}