import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ApplyButton from '@/app/components/ApplyButton';
import ContactCard from '@/app/components/ContactCard';
import { getShiftMeta } from '@/lib/shift';

type PageProps = {
  params: Promise<{
    id: string;
  }>;
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
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-2xl font-bold">Ресторан не найден</h1>
          <Link href="/slots" className="text-red-600 hover:underline">
            Вернуться назад
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/slots"
          className="mb-4 inline-block text-sm text-red-600 hover:underline"
        >
          ← Назад к открытым сменам
        </Link>

        <div className="mb-6 rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
          <div className="mb-2 inline-flex rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
            Подработки в ROSTIC’S
          </div>

          <h1 className="text-2xl font-bold">{restaurant.name}</h1>
          <p className="mt-2 text-gray-700">{restaurant.address}</p>

          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
              {restaurant.city}
            </span>

            {restaurant.metro && (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                🚇 {restaurant.metro}
              </span>
            )}
          </div>

          <div className="mt-4">
            <a
              href={`/slots?focus=${restaurant.id}#map-section`}
              className="inline-block rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              На карте
            </a>
          </div>
        </div>

        <div className="mb-6">
          <ContactCard />
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Доступные смены</h2>

          {slotsError && (
            <div className="rounded-lg bg-red-100 p-4 text-red-700">
              Ошибка загрузки смен
            </div>
          )}

          {!slots || slots.length === 0 ? (
            <p className="text-gray-500">Сейчас открытых смен нет</p>
          ) : (
            <div className="space-y-4">
              {slots.map((slot) => {
                const meta = getShiftMeta(slot.time_from, slot.time_to);

                return (
                  <div
                    key={slot.id}
                    className={`rounded-2xl border p-5 ${
                      slot.is_hot ? 'border-red-300 ring-1 ring-red-200 bg-red-50/40' : ''
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <p className="font-semibold">{slot.position}</p>

                      {slot.is_hot && (
                        <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
                          🔥 Горячая смена
                        </span>
                      )}
                    </div>

                    <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                      <p>Дата: {slot.work_date}</p>
                      <p>
                        Время: {slot.time_from} – {slot.time_to}
                        {meta.overnight ? ' (следующий день)' : ''}
                      </p>
                      <p>Оплата: {slot.hourly_rate} ₽/час</p>
                      <p>Длительность: {meta.hours ? `${meta.hours} ч` : '—'}</p>
                    </div>

                    {slot.comment && (
                      <p className="mt-2 text-sm text-gray-500">{slot.comment}</p>
                    )}

                    <p className="mt-2 text-xs text-gray-500">
                      Слот открыт: {formatRelative(slot.created_at)}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <ApplyButton slotId={slot.id} />

                      <a
                        href={`/slots?focus=${restaurant.id}#map-section`}
                        className="inline-block rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
                      >
                        На карте
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}