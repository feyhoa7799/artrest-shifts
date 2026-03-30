'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type MyApplication = {
  id: number;
  created_at: string;
  status: string;
  rejection_reason: string | null;
  restaurant_name: string;
  city: string;
  work_date: string;
  time_from: string;
  time_to: string;
  position: string;
  hours: string;
  overnight: boolean;
};

type MyApplicationsProps = {
  embedded?: boolean;
};

function statusLabel(status: string) {
  if (status === 'approved') return 'Подтвержден';
  if (status === 'rejected') return 'Отклонен';
  return 'На рассмотрении';
}

function statusClass(status: string) {
  if (status === 'approved') return 'bg-green-100 text-green-700';
  if (status === 'rejected') return 'bg-red-100 text-red-700';
  return 'bg-yellow-100 text-yellow-700';
}

export default function MyApplications({ embedded = false }: MyApplicationsProps) {
  const [items, setItems] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadApplications() {
    setLoading(true);

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
      setItems(data.applications || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadApplications();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadApplications();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const body = (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Мои отклики</h2>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
          {items.length}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Загрузка откликов...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">Вы еще не отправляли отклики.</p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{item.restaurant_name}</h3>
                  <p className="text-sm text-gray-500">{item.city}</p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${statusClass(
                    item.status
                  )}`}
                >
                  {statusLabel(item.status)}
                </span>
              </div>

              <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                <p>
                  <span className="font-medium">Должность:</span> {item.position || '—'}
                </p>
                <p>
                  <span className="font-medium">Дата:</span> {item.work_date || '—'}
                </p>
                <p>
                  <span className="font-medium">Время:</span>{' '}
                  {item.time_from && item.time_to
                    ? `${item.time_from} – ${item.time_to}${item.overnight ? ' (следующий день)' : ''}`
                    : '—'}
                </p>
                <p>
                  <span className="font-medium">Часы:</span> {item.hours || '0.00'}
                </p>
                <p>
                  <span className="font-medium">Отклик отправлен:</span>{' '}
                  {new Date(item.created_at).toLocaleString('ru-RU')}
                </p>
              </div>

              {item.status === 'rejected' && item.rejection_reason && (
                <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <span className="font-medium">Причина отказа:</span>{' '}
                  {item.rejection_reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="rounded-2xl border bg-white p-5 shadow-sm">{body}</div>;
  }

  return <div className="rounded-2xl border bg-white p-5 shadow-sm">{body}</div>;
}
