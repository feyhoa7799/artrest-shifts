'use client';

import { useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';

type MyApplication = {
  id: number;
  created_at: string;
  status: string;
  derived_status: 'pending' | 'active' | 'finished' | 'rejected';
  rejection_reason: string | null;
  restaurant_name: string;
  city: string;
  address: string;
  work_date: string;
  time_from: string;
  time_to: string;
  position: string;
  hourly_rate: number | null;
  hours: string | null;
  overnight: boolean;
  is_finished: boolean;
  can_cancel: boolean;
};

type MyApplicationsProps = {
  embedded?: boolean;
};

type TabKey = 'all' | 'pending' | 'active' | 'finished' | 'rejected';

function tabLabel(tab: TabKey) {
  switch (tab) {
    case 'pending':
      return 'В ожидании';
    case 'active':
      return 'Подтверждённые';
    case 'finished':
      return 'Завершённые';
    case 'rejected':
      return 'Отменённые';
    default:
      return 'Все';
  }
}

function statusLabel(status: MyApplication['derived_status']) {
  switch (status) {
    case 'active':
      return 'Подтверждена';
    case 'finished':
      return 'Завершена';
    case 'rejected':
      return 'Отменена';
    default:
      return 'На рассмотрении';
  }
}

function statusClass(status: MyApplication['derived_status']) {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-700';
    case 'finished':
      return 'bg-blue-100 text-blue-700';
    case 'rejected':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-yellow-100 text-yellow-700';
  }
}

function formatDateRu(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function formatHours(value: string | null) {
  if (!value) return '—';

  const numeric = Number(value);

  if (Number.isNaN(numeric)) return value;

  if (Number.isInteger(numeric)) {
    return `${numeric} ч`;
  }

  return `${numeric.toFixed(1)} ч`;
}

function formatShiftTimeRange(timeFrom: string, timeTo: string, overnight: boolean) {
  return overnight ? `${timeFrom}–${timeTo} (+1 день)` : `${timeFrom}–${timeTo}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function sortApplications(items: MyApplication[], tab: TabKey) {
  const copy = [...items];

  if (tab === 'finished' || tab === 'rejected') {
    return copy.sort((a, b) => {
      const aDate = new Date(a.created_at).getTime();
      const bDate = new Date(b.created_at).getTime();
      return bDate - aDate;
    });
  }

  return copy.sort((a, b) => {
    const aDate = new Date(`${a.work_date}T${a.time_from}:00+03:00`).getTime();
    const bDate = new Date(`${b.work_date}T${b.time_from}:00+03:00`).getTime();

    if (aDate !== bDate) {
      return aDate - bDate;
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function pluralRu(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export default function MyApplications({ embedded = false }: MyApplicationsProps) {
  const [items, setItems] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  async function loadApplications() {
    setLoading(true);
    setError('');

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/my-applications', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'Ошибка загрузки откликов');
        setItems([]);
        return;
      }

      setItems(data.applications || []);
    } catch {
      setError('Ошибка загрузки откликов');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(applicationId: number) {
    setCancellingId(applicationId);
    setError('');
    setNotice('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError('Нет активной сессии');
        return;
      }

      const res = await fetch(`/api/my-applications/${applicationId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'Не удалось отменить отклик');
        return;
      }

      setNotice('Отклик отменён. Теперь можно выбрать другую смену на эту дату.');
      await loadApplications();
    } catch {
      setError('Не удалось отменить отклик');
    } finally {
      setCancellingId(null);
    }
  }

  useEffect(() => {
    void loadApplications();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadApplications();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const counts = useMemo(() => {
    return {
      all: items.length,
      pending: items.filter((item) => item.derived_status === 'pending').length,
      active: items.filter((item) => item.derived_status === 'active').length,
      finished: items.filter((item) => item.derived_status === 'finished').length,
      rejected: items.filter((item) => item.derived_status === 'rejected').length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const prepared =
      tab === 'all' ? items : items.filter((item) => item.derived_status === tab);

    return sortApplications(prepared, tab);
  }, [items, tab]);

  const body = (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-2xl font-semibold">Мои отклики</h2>
        <p className="text-sm text-gray-600">
          Здесь видны все ваши отправленные отклики и их текущий статус.
        </p>
      </div>

      {notice && (
        <div className="rounded-xl bg-green-50 p-4 text-sm text-green-700">{notice}</div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="text-sm text-gray-600">
        {items.length} {pluralRu(items.length, 'отклик', 'отклика', 'откликов')}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'pending', 'active', 'finished', 'rejected'] as TabKey[]).map(
          (itemTab) => {
            const active = tab === itemTab;

            return (
              <button
                key={itemTab}
                type="button"
                onClick={() => setTab(itemTab)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  active
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tabLabel(itemTab)} · {counts[itemTab]}
              </button>
            );
          }
        )}
      </div>

      {loading ? (
        <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
          Загрузка откликов...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
          В этой вкладке пока пусто.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border bg-white p-5 shadow-sm"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass(
                    item.derived_status
                  )}`}
                >
                  {statusLabel(item.derived_status)}
                </span>

                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                  {formatDateRu(item.work_date)}
                </span>

                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                  {formatShiftTimeRange(item.time_from, item.time_to, item.overnight)}
                </span>
              </div>

              <h3 className="text-lg font-semibold text-gray-900">{item.restaurant_name}</h3>

              <div className="mt-1 text-sm text-gray-600">
                {[item.city, item.address].filter(Boolean).join(' • ')}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="text-sm text-gray-700">
                  <span className="text-gray-500">Должность:</span> {item.position || '—'}
                </div>

                <div className="text-sm text-gray-700">
                  <span className="text-gray-500">Дата:</span> {formatDateRu(item.work_date)}
                </div>

                <div className="text-sm text-gray-700">
                  <span className="text-gray-500">Время:</span>{' '}
                  {formatShiftTimeRange(item.time_from, item.time_to, item.overnight)}
                </div>

                <div className="text-sm text-gray-700">
                  <span className="text-gray-500">Оплата:</span>{' '}
                  {item.hourly_rate ? `${item.hourly_rate} ₽/час` : 'По договорённости'}
                </div>

                <div className="text-sm text-gray-700">
                  <span className="text-gray-500">Длительность:</span>{' '}
                  {formatHours(item.hours)}
                </div>

                <div className="text-sm text-gray-700">
                  <span className="text-gray-500">Отклик отправлен:</span>{' '}
                  {formatDateTime(item.created_at)}
                </div>
              </div>

              {item.derived_status === 'rejected' && item.rejection_reason && (
                <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  Причина: {item.rejection_reason}
                </div>
              )}

              {item.derived_status === 'active' && (
                <div className="mt-4 rounded-xl bg-green-50 p-4 text-sm text-green-700">
                  Смена подтверждена. Если вам нужно отказаться от этой смены, пожалуйста,
                  свяжитесь с HR-менеджером. Самостоятельно отменить подтверждённую смену нельзя.
                </div>
              )}

              {item.derived_status === 'pending' && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <div className="rounded-xl bg-yellow-50 p-4 text-sm text-yellow-800">
                    Отклик ожидает подтверждения. Пока он активен, вы не сможете отправить
                    другой отклик на эту же дату.
                  </div>

                  {item.can_cancel && (
                    <button
                      type="button"
                      onClick={() => void handleCancel(item.id)}
                      disabled={cancellingId === item.id}
                      className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {cancellingId === item.id ? 'Отменяю...' : 'Отменить отклик'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (embedded) {
    return body;
  }

  return <div className="rounded-2xl border bg-white p-6 shadow-sm">{body}</div>;
}