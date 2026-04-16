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
};

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || null;
}

async function fetchJson(path: string, init?: RequestInit) {
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

  return data;
}

export default function AdminAccessManager() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [items, setItems] = useState<AdminItem[]>([]);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const me = await fetchJson('/api/admin/me');

      if (!me.isSuperadmin) {
        setAllowed(false);
        setItems([]);
        return;
      }

      const data = await fetchJson('/api/admin/access');
      setAllowed(true);
      setItems(data.items || []);
    } catch (err) {
      setAllowed(false);
      setItems([]);
      setError(err instanceof Error ? err.message : 'Ошибка загрузки администраторов');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
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
      await fetchJson('/api/admin/access', {
        method: 'POST',
        body: JSON.stringify({
          action: 'grant',
          email: email.trim(),
        }),
      });

      setNotice('Доступ администратора выдан');
      setEmail('');
      await load();
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
      await fetchJson('/api/admin/access', {
        method: 'POST',
        body: JSON.stringify({
          action: 'revoke',
          email: targetEmail,
        }),
      });

      setNotice('Доступ администратора отозван');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отзыва доступа');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        Загрузка списка администраторов...
      </div>
    );
  }

  if (!allowed) {
    return error ? (
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    ) : null;
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="mb-2 text-xl font-semibold">Управление администраторами</h2>
      <p className="mb-5 text-sm text-gray-600">
        Этот блок виден только суперюзеру. Здесь можно выдавать и отзывать доступ к админке.
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

      <div className="mb-5 flex flex-col gap-3 md:flex-row">
        <input
          type="email"
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

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
            Активных администраторов пока нет.
          </div>
        ) : (
          items.map((item) => {
            const isSuperadmin = item.role === 'superadmin';

            return (
              <div
                key={`${item.email}-${item.role}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
              >
                <div>
                  <div className="font-medium">{item.email}</div>
                  <div className="mt-1 text-sm text-gray-500">
                    {isSuperadmin ? 'Суперюзер' : 'Администратор'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-sm ${
                      isSuperadmin
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {isSuperadmin ? 'superadmin' : 'admin'}
                  </span>

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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}