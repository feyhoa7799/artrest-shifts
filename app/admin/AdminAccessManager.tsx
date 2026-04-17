'use client';

import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

type AdminItem = {
  id: number;
  email: string;
  role: 'admin' | 'superadmin';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  source?: 'db' | 'env';
};

type AuditItem = {
  id: number;
  actor_user_id: string | null;
  actor_email: string;
  target_email: string;
  action: 'grant' | 'revoke';
  assigned_role: 'admin' | 'superadmin' | null;
  created_at: string;
};

type AccessResponse = {
  items: AdminItem[];
  audit: AuditItem[];
  configuredSuperadminEmail: string | null;
};

type MeResponse = {
  isSuperadmin: boolean;
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

function formatRole(role: 'admin' | 'superadmin') {
  return role === 'superadmin' ? 'Суперюзер' : 'Администратор';
}

function formatAssignedRole(role: 'admin' | 'superadmin' | null) {
  if (role === 'superadmin') return 'superadmin';
  if (role === 'admin') return 'admin';
  return '—';
}

function formatAction(action: 'grant' | 'revoke') {
  return action === 'grant' ? 'Выдача доступа' : 'Отзыв доступа';
}

export default function AdminAccessManager() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [items, setItems] = useState<AdminItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [configuredSuperadminEmail, setConfiguredSuperadminEmail] = useState<string | null>(
    null
  );

  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const me = await fetchJson<MeResponse>('/api/admin/me');

      if (!me.isSuperadmin) {
        setAllowed(false);
        setItems([]);
        setAudit([]);
        setConfiguredSuperadminEmail(null);
        return;
      }

      const data = await fetchJson<AccessResponse>('/api/admin/access');

      setAllowed(true);
      setItems(data.items || []);
      setAudit(data.audit || []);
      setConfiguredSuperadminEmail(data.configuredSuperadminEmail || null);
    } catch (err) {
      setAllowed(false);
      setItems([]);
      setAudit([]);
      setConfiguredSuperadminEmail(null);
      setError(
        err instanceof Error ? err.message : 'Ошибка загрузки администраторов'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleGrant() {
    setError('');
    setNotice('');

    if (!email.trim()) {
      setError('Введите email');
      return;
    }

    setSaving(true);

    try {
      const data = await fetchJson<AccessResponse & { success: true }>(
        '/api/admin/access',
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'grant',
            email: email.trim(),
          }),
        }
      );

      setItems(data.items || []);
      setAudit(data.audit || []);
      setConfiguredSuperadminEmail(data.configuredSuperadminEmail || null);
      setEmail('');
      setNotice('Доступ администратора выдан');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка выдачи доступа');
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(targetEmail: string) {
    setError('');
    setNotice('');

    setSaving(true);

    try {
      const data = await fetchJson<AccessResponse & { success: true }>(
        '/api/admin/access',
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'revoke',
            email: targetEmail,
          }),
        }
      );

      setItems(data.items || []);
      setAudit(data.audit || []);
      setConfiguredSuperadminEmail(data.configuredSuperadminEmail || null);
      setNotice('Доступ администратора отозван');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отзыва доступа');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        Загрузка списка администраторов...
      </div>
    );
  }

  if (!allowed) {
    return error ? (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    ) : null;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-2xl font-semibold">Управление администраторами</h2>
        <p className="mb-5 text-sm text-gray-600">
          Этот блок виден только суперюзеру. Здесь можно выдавать и отзывать доступ
          к админке.
        </p>

        {configuredSuperadminEmail && (
          <div className="mb-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            Суперюзер из конфигурации: <b>{configuredSuperadminEmail}</b>
          </div>
        )}

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

        <div className="mb-6 flex flex-col gap-3 md:flex-row">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Введите email сотрудника"
            className="w-full rounded-lg border p-3"
          />

          <button
            type="button"
            onClick={handleGrant}
            disabled={saving}
            className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Сохраняю...' : 'Выдать доступ'}
          </button>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            Активных администраторов пока нет.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const isSuperadmin = item.role === 'superadmin';
              const isEnvSource = item.source === 'env';

              return (
                <div
                  key={`${item.email}-${item.id}`}
                  className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="font-medium text-gray-900">{item.email}</div>

                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-600">
                      <span className="rounded-full bg-gray-100 px-2 py-1">
                        {formatRole(item.role)}
                      </span>

                      <span className="rounded-full bg-gray-100 px-2 py-1">
                        {isSuperadmin ? 'superadmin' : 'admin'}
                      </span>

                      {isEnvSource && (
                        <span className="rounded-full bg-yellow-100 px-2 py-1 text-yellow-800">
                          env
                        </span>
                      )}

                      <span className="rounded-full bg-gray-100 px-2 py-1">
                        Обновлён: {formatDateTime(item.updated_at)}
                      </span>
                    </div>
                  </div>

                  {!isSuperadmin && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(item.email)}
                      disabled={saving}
                      className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Отозвать доступ
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-xl font-semibold">История изменений доступа</h3>
        <p className="mb-5 text-sm text-gray-600">
          Последние действия по выдаче и отзыву прав администратора.
        </p>

        {audit.length === 0 ? (
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            История пока пуста.
          </div>
        ) : (
          <div className="space-y-3">
            {audit.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border p-4"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                    {formatAction(item.action)}
                  </span>

                  <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                    Роль: {formatAssignedRole(item.assigned_role)}
                  </span>

                  <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
                    {formatDateTime(item.created_at)}
                  </span>
                </div>

                <div className="text-sm text-gray-700">
                  <div>
                    <span className="text-gray-500">Кто выполнил:</span>{' '}
                    <b>{item.actor_email || '—'}</b>
                  </div>
                  <div className="mt-1">
                    <span className="text-gray-500">Для кого:</span>{' '}
                    <b>{item.target_email}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}