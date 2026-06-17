'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

type AdminRole =
  | 'admin'
  | 'superadmin'
  | 'hr_admin'
  | 'territory_admin'
  | 'restaurant_admin';

type CanonicalAdminRole =
  | 'superadmin'
  | 'hr_admin'
  | 'territory_admin'
  | 'restaurant_admin';

type RestaurantOption = {
  id: number;
  name: string;
};

type AdminRestaurantAccess = {
  id: number;
  restaurant_id: number;
  restaurant_name: string;
};

type AdminItem = {
  id: number;
  email: string;
  role: AdminRole;
  canonicalRole: CanonicalAdminRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  source?: 'db' | 'env';
  restaurantAccess: AdminRestaurantAccess[];
};

type AuditItem = {
  id: number;
  actor_user_id: string | null;
  actor_email: string;
  target_email: string;
  action: 'grant' | 'revoke';
  assigned_role: AdminRole | null;
  created_at: string;
};

type AccessResponse = {
  items: AdminItem[];
  audit: AuditItem[];
  restaurants: RestaurantOption[];
  configuredSuperadminEmail: string | null;
};

type MeResponse = {
  canManageSuperadmins: boolean;
  canonicalRole: CanonicalAdminRole;
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

function formatRole(role: CanonicalAdminRole) {
  const labels: Record<CanonicalAdminRole, string> = {
    superadmin: 'Суперадмин',
    hr_admin: 'HR-админ',
    territory_admin: 'Территориальный админ',
    restaurant_admin: 'Админ ресторана',
  };

  return labels[role];
}

function formatAction(action: 'grant' | 'revoke') {
  return action === 'grant' ? 'Выдача доступа' : 'Отзыв доступа';
}

function formatAssignedRole(role: AdminRole | null) {
  if (!role) return '—';
  if (role === 'admin') return 'HR-админ (legacy)';
  return formatRole(role);
}

export default function AdminAccessManager() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [canManageSuperadmins, setCanManageSuperadmins] = useState(false);

  const [items, setItems] = useState<AdminItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [configuredSuperadminEmail, setConfiguredSuperadminEmail] = useState<string | null>(
    null
  );

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CanonicalAdminRole>('restaurant_admin');
  const [restaurantIds, setRestaurantIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const needsRestaurants = role === 'restaurant_admin' || role === 'territory_admin';

  async function load() {
    setLoading(true);
    setError('');

    try {
      const [me, data] = await Promise.all([
        fetchJson<MeResponse>('/api/admin/me'),
        fetchJson<AccessResponse>('/api/admin/access'),
      ]);

      setAllowed(true);
      setCanManageSuperadmins(Boolean(me.canManageSuperadmins));
      setItems(data.items || []);
      setAudit(data.audit || []);
      setRestaurants(data.restaurants || []);
      setConfiguredSuperadminEmail(data.configuredSuperadminEmail || null);
    } catch (err) {
      setAllowed(false);
      setItems([]);
      setAudit([]);
      setRestaurants([]);
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

    if (needsRestaurants && restaurantIds.length === 0) {
      setError('Выберите хотя бы один ресторан');
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
            role,
            restaurantIds: needsRestaurants ? restaurantIds.map(Number) : [],
          }),
        }
      );

      setItems(data.items || []);
      setAudit(data.audit || []);
      setRestaurants(data.restaurants || []);
      setConfiguredSuperadminEmail(data.configuredSuperadminEmail || null);
      setEmail('');
      setRestaurantIds([]);
      setNotice('Доступ сохранён');
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
      setRestaurants(data.restaurants || []);
      setConfiguredSuperadminEmail(data.configuredSuperadminEmail || null);
      setNotice('Доступ отозван');
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
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Управление доступами</h2>
            <p className="mt-2 text-sm text-gray-600">
              Здесь выдаются роли и ресторанные привязки. HR-админ не может выдавать
              или отзывать superadmin-доступ.
            </p>
          </div>

          <Link
            href="/admin/telegram"
            className="rounded-lg border px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            Telegram
          </Link>
        </div>

        {configuredSuperadminEmail && (
          <div className="mb-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            Суперадмин из конфигурации: <b>{configuredSuperadminEmail}</b>
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

        <div className="grid gap-4 lg:grid-cols-[1fr_220px_1.2fr_auto]">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email администратора"
            className="w-full rounded-lg border p-3"
          />

          <select
            value={role}
            onChange={(event) => {
              const nextRole = event.target.value as CanonicalAdminRole;
              setRole(nextRole);
              if (nextRole === 'hr_admin' || nextRole === 'superadmin') {
                setRestaurantIds([]);
              }
            }}
            className="w-full rounded-lg border p-3"
          >
            <option value="restaurant_admin">Админ ресторана</option>
            <option value="territory_admin">Территориальный админ</option>
            <option value="hr_admin">HR-админ</option>
            {canManageSuperadmins && <option value="superadmin">Суперадмин</option>}
          </select>

          <select
            multiple
            size={5}
            value={restaurantIds}
            disabled={!needsRestaurants}
            onChange={(event) =>
              setRestaurantIds(
                Array.from(event.currentTarget.selectedOptions).map(
                  (option) => option.value
                )
              )
            }
            className="w-full rounded-lg border p-3 disabled:bg-gray-50 disabled:text-gray-400"
          >
            {restaurants.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleGrant}
            disabled={saving}
            className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Сохраняю...' : 'Сохранить'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-semibold">Активные администраторы</h3>

        {items.length === 0 ? (
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            Активных администраторов пока нет.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const isEnvSource = item.source === 'env';
              const canRevoke =
                !isEnvSource &&
                (item.canonicalRole !== 'superadmin' || canManageSuperadmins);

              return (
                <div
                  key={`${item.email}-${item.id}`}
                  className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="font-medium text-gray-900">{item.email}</div>

                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                      <span className="rounded-full bg-gray-100 px-2 py-1">
                        {formatRole(item.canonicalRole)}
                      </span>

                      {item.role === 'admin' && (
                        <span className="rounded-full bg-yellow-100 px-2 py-1 text-yellow-800">
                          legacy admin
                        </span>
                      )}

                      {isEnvSource && (
                        <span className="rounded-full bg-yellow-100 px-2 py-1 text-yellow-800">
                          env
                        </span>
                      )}

                      <span className="rounded-full bg-gray-100 px-2 py-1">
                        Обновлён: {formatDateTime(item.updated_at)}
                      </span>
                    </div>

                    {item.restaurantAccess.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-700">
                        {item.restaurantAccess.map((access) => (
                          <span
                            key={access.id}
                            className="rounded-full bg-red-50 px-2 py-1 text-red-700"
                          >
                            {access.restaurant_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {canRevoke && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(item.email)}
                      disabled={saving}
                      className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Отозвать
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

        {audit.length === 0 ? (
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            История пока пустая.
          </div>
        ) : (
          <div className="space-y-3">
            {audit.map((item) => (
              <div key={item.id} className="rounded-xl border p-4">
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
