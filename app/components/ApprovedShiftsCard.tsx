'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

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

type ApprovedShiftsCardProps = {
  accessToken: string;
};

function formatDateRu(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

function parseShiftStart(workDate: string, timeFrom: string) {
  return new Date(`${workDate}T${timeFrom}:00+03:00`).getTime();
}

function formatTimeRange(from: string, to: string, overnight: boolean) {
  return overnight ? `${from}–${to} (+1 день)` : `${from}–${to}`;
}

export default function ApprovedShiftsCard({ accessToken }: ApprovedShiftsCardProps) {
  const [items, setItems] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    try {
      if (!accessToken) {
        setItems([]);
        return;
      }

      const res = await fetch('/api/my-applications', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const data = await res.json();

      if (!res.ok) {
        setItems([]);
        return;
      }

      setItems(data.applications || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [accessToken]);

  const approvedUpcoming = useMemo(() => {
    return items
      .filter((item) => item.derived_status === 'active' && !item.is_finished)
      .sort(
        (a, b) =>
          parseShiftStart(a.work_date, a.time_from) -
          parseShiftStart(b.work_date, b.time_from)
      )
      .slice(0, 5);
  }, [items]);

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="mb-2 text-xl font-semibold">Тебя уже ждут</h3>
        <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
          Загружаю подтверждённые смены...
        </div>
      </div>
    );
  }

  if (approvedUpcoming.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="mb-2 text-xl font-semibold">Тебя уже ждут</h3>
          <p className="text-sm text-gray-600">
            Здесь показаны ближайшие подтверждённые смены. Прошедшие автоматически
            исчезают из этого блока.
          </p>
        </div>

        <Link
          href="/my-applications"
          className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Все мои отклики
        </Link>
      </div>

      <div className="space-y-3">
        {approvedUpcoming.map((item) => (
          <div key={item.id} className="rounded-xl border p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                Подтверждена
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                {formatDateRu(item.work_date)}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                {formatTimeRange(item.time_from, item.time_to, item.overnight)}
              </span>
            </div>

            <div className="font-medium text-gray-900">{item.restaurant_name}</div>
            <div className="mt-1 text-sm text-gray-600">
              {[item.city, item.address].filter(Boolean).join(' • ')}
            </div>

            <div className="mt-2 text-sm text-gray-700">
              <span className="text-gray-500">Должность:</span>{' '}
              {item.position || '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}