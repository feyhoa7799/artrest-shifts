'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  formatDateRu,
  formatHours,
  formatShiftTimeRange,
  pluralRu,
} from '@/lib/shift';

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
  hours: string;
  overnight: boolean;
  is_finished: boolean;
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function loadApplicationsFromApi() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return [];
  }

  const res = await fetch('/api/my-applications', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    cache: 'no-store',
  });

  const data = await res.json();
  return data.applications || [];
}

export default function MyApplications({ embedded = false }: MyApplicationsProps) {
  const [items, setItems] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('all');

  async function reload() {
    setLoading(true);

    try {
      const applications = await loadApplicationsFromApi();
      setItems(applications);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      reload();
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
    if (tab === 'all') return items;
    return items.filter((item) => item.derived_status === tab);
  }, [items, tab]);

  const emptyText = useMemo(() => {
    switch (tab) {
      case 'pending':
        return 'У вас пока нет откликов, которые находятся на рассмотрении.';
      case 'active':
        return 'У вас пока нет подтверждённых смен.';
      case 'finished':
        return 'У вас пока нет завершённых смен.';
      case 'rejected':
        return 'У вас пока нет отменённых откликов.';
      default:
        return 'Вы ещё не отправляли отклики на смены.';
    }
  }, [tab]);

  const body = (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Мои отклики</h2>
          <p className="mt-1 text-sm text-gray-600">
            Здесь отображаются все ваши заявки на подработки и их текущий статус.
          </p>
        </div>

        <span className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700">
          {items.length} {pluralRu(items.length, 'отклик', 'отклика', 'откликов')}
        </span>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {(['all', 'pending', 'active', 'finished', 'rejected'] as TabKey[]).map((itemTab) => {
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
        })}
      </div>

      {loading ? (
        <div className="rounded-xl bg-gray-50 p-5 text-gray-500">Загрузка откликов...</div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl bg-gray-50 p-5 text-gray-500">{emptyText}</div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => (
            <div key={item.id} className="rounded-2xl border p-5">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{item.restaurant_name}</h3>
                  <p className="text-sm text-gray-600">
                    {[item.city, item.address].filter(Boolean).join(' • ')}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${statusClass(
                    item.derived_status
                  )}`}
                >
                  {statusLabel(item.derived_status)}
                </span>
              </div>

              <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                <p>Должность: {item.position || '—'}</p>
                <p>Дата: {formatDateRu(item.work_date)}</p>
                <p>
                  Время: {formatShiftTimeRange(item.time_from, item.time_to, item.overnight)}
                </p>
                <p>Длительность: {formatHours(item.hours)}</p>
                <p>Отклик отправлен: {formatDateTime(item.created_at)}</p>
              </div>

              {item.hourly_rate ? (
                <div className="mt-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                  Оплата: {item.hourly_rate} ₽/час
                </div>
              ) : null}

              {item.derived_status === 'pending' && (
                <div className="mt-3 rounded-xl bg-yellow-50 p-4 text-sm text-yellow-700">
                  Отклик отправлен. Дождитесь решения менеджера по этой смене.
                </div>
              )}

              {item.derived_status === 'active' && (
                <div className="mt-3 rounded-xl bg-green-50 p-4 text-sm text-green-700">
                  Смена подтверждена. После завершения она автоматически перейдёт во вкладку
                  «Завершённые».
                </div>
              )}

              {item.derived_status === 'finished' && (
                <div className="mt-3 rounded-xl bg-blue-50 p-4 text-sm text-blue-700">
                  Смена завершена и учтена в вашей статистике.
                </div>
              )}

              {item.derived_status === 'rejected' && (
                <div className="mt-3 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  {item.rejection_reason
                    ? `Причина отмены: ${item.rejection_reason}`
                    : 'Отклик был отменён.'}
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

  return <div className="mx-auto max-w-5xl">{body}</div>;
}