import Link from 'next/link';

import ApplyButton from '@/app/components/ApplyButton';
import ContactCard from '@/app/components/ContactCard';
import { getShiftMeta } from '@/lib/shift';
import { supabase } from '@/lib/supabase';

type PageProps = {
  params: Promise<{ id: string }>;
};

type Slot = {
  id: number;
  restaurant_id: number;
  work_date: string;
  time_from: string;
  time_to: string;
  position: string;
  hourly_rate: number;
  comment: string | null;
  status: 'open' | 'pending' | 'closed' | 'assigned';
  is_hot: boolean | null;
  created_at: string;
};

function pluralRu(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function formatRelative(value: string) {
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 5 * 60 * 1000) return 'Недавно';

  const diffMinutes = Math.floor(diffMs / (60 * 1000));

  if (diffMinutes < 60) {
    return `${diffMinutes} ${pluralRu(diffMinutes, 'минуту', 'минуты', 'минут')} назад`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} ${pluralRu(diffHours, 'час', 'часа', 'часов')} назад`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays < 7) {
    return `${diffDays} ${pluralRu(diffDays, 'день', 'дня', 'дней')} назад`;
  }

  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(date);
}

function formatDateRu(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

export default async function RestaurantPage({ params }: PageProps) {
  const { id } = await params;
  const restaurantId = Number(id);
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .select('id, name, address, city, metro')
    .eq('id', restaurantId)
    .single();

  const { data: slotsData, error: slotsError } = await supabase
    .from('slots')
    .select(
      'id, restaurant_id, work_date, time_from, time_to, position, hourly_rate, comment, status, is_hot, created_at'
    )
    .eq('restaurant_id', restaurantId)
    .eq('status', 'open')
    .gte('work_date', todayStr)
    .order('work_date', { ascending: true });

  const slots = ((slotsData || []) as Slot[]).sort((a, b) => {
    const aHot = a.is_hot ? 1 : 0;
    const bHot = b.is_hot ? 1 : 0;

    return bHot - aHot || a.work_date.localeCompare(b.work_date);
  });

  if (restaurantError || !restaurant) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="mb-2 text-2xl font-semibold">Ресторан не найден</h1>
          <Link
            href="/slots"
            className="inline-flex rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Вернуться к списку ресторанов
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <Link
          href="/slots"
          className="inline-flex rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← Назад к списку ресторанов
        </Link>
      </div>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-2 text-sm font-medium text-red-600">Подработки в ROSTIC’S</div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">
          {restaurant.name}
        </h1>
        <p className="text-sm text-gray-600">
          {[restaurant.city, restaurant.address, restaurant.metro]
            .filter(Boolean)
            .join(' • ')}
        </p>

        <div className="mt-4">
          <Link
            href={`/slots?focus=${restaurant.id}`}
            className="inline-flex rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Показать на карте
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-xl font-semibold">Доступные смены</h2>
        <p className="text-sm text-gray-600">
          Ниже показаны только открытые смены этого ресторана.
        </p>

        {slotsError && (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            Ошибка загрузки смен
          </div>
        )}

        {!slots || slots.length === 0 ? (
          <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            Сейчас открытых смен нет.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {slots.map((slot) => {
              const meta = getShiftMeta(slot.time_from, slot.time_to);

              return (
                <div
                  key={slot.id}
                  className="rounded-2xl border p-5"
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {slot.is_hot && (
                      <span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-700">
                        Горячая смена
                      </span>
                    )}
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                      {formatDateRu(slot.work_date)}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900">{slot.position}</h3>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="text-sm text-gray-700">
                      <span className="text-gray-500">Время:</span> {slot.time_from} –{' '}
                      {slot.time_to}
                      {meta.overnight ? ' (следующий день)' : ''}
                    </div>

                    <div className="text-sm text-gray-700">
                      <span className="text-gray-500">Оплата:</span> {slot.hourly_rate} ₽/час
                    </div>

                    <div className="text-sm text-gray-700">
                      <span className="text-gray-500">Длительность:</span>{' '}
                      {meta.hours ? `${meta.hours} ч` : '—'}
                    </div>

                    <div className="text-sm text-gray-700">
                      <span className="text-gray-500">Слот открыт:</span>{' '}
                      {formatRelative(slot.created_at)}
                    </div>
                  </div>

                  {slot.comment && (
                    <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                      {slot.comment}
                    </div>
                  )}

                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    <ApplyButton slotId={slot.id} />

                    <Link
                      href={`/slots?focus=${restaurant.id}`}
                      className="inline-flex items-center justify-center rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50"
                    >
                      Показать ресторан на карте
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ContactCard />
    </main>
  );
}