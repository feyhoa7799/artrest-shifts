'use client';

import { useEffect, useMemo, useState } from 'react';

import YandexMap from '@/app/components/Map';

type Restaurant = {
  id: number;
  name: string;
  address: string;
  city: string;
  metro: string | null;
  lat: number | null;
  lng: number | null;
  isHot?: boolean;
  upcomingSlots?: SlotSummary[];
};

type SlotSummary = {
  position: string;
  work_date: string;
  time_from: string;
  time_to: string;
  hourly_rate: number | null;
  is_hot: boolean | null;
  needed_count: number | null;
  accepted_count: number | null;
};

type SlotsExplorerProps = {
  restaurants: Restaurant[];
  initialFocusRestaurantId?: number | null;
};

function formatDateRu(value: string) {
  const [year, month, day] = value.split('-');

  if (!year || !month || !day) return value;

  return `${day}.${month}`;
}

function getRemainingCount(slot: SlotSummary) {
  const needed = Math.max(1, Number(slot.needed_count || 1));
  const accepted = Math.max(0, Number(slot.accepted_count || 0));

  return Math.max(0, needed - accepted);
}

export default function SlotsExplorer({
  restaurants,
  initialFocusRestaurantId = null,
}: SlotsExplorerProps) {
  const [focusedRestaurantId, setFocusedRestaurantId] = useState<number | null>(
    initialFocusRestaurantId
  );
  const [view, setView] = useState<'list' | 'map'>('list');

  useEffect(() => {
    if (!initialFocusRestaurantId) return;

    const timer = window.setTimeout(() => {
      setFocusedRestaurantId(initialFocusRestaurantId);
      setView('map');

      document.getElementById('map-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 100);

    return () => window.clearTimeout(timer);
  }, [initialFocusRestaurantId]);

  const hotCount = useMemo(
    () => restaurants.filter((restaurant) => restaurant.isHot).length,
    [restaurants]
  );

  function handleShowOnMap(restaurantId: number) {
    setFocusedRestaurantId(restaurantId);
    setView('map');

    window.setTimeout(() => {
      document.getElementById('map-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 50);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView('list')}
            className={`rounded-full px-4 py-2 text-sm ${
              view === 'list'
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Список ресторанов
          </button>

          <button
            type="button"
            onClick={() => setView('map')}
            className={`rounded-full px-4 py-2 text-sm ${
              view === 'map'
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Карта
          </button>
        </div>

        <div className="text-sm text-gray-600">
          Выберите ресторан, посмотрите смены и нажмите «Выбрать ресторан». На странице
          ресторана можно отправить отклик на подходящую смену.
        </div>

        {restaurants.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-gray-700">
            <span className="rounded-full bg-gray-100 px-3 py-1">
              Ресторанов: {restaurants.length}
            </span>

            {hotCount > 0 && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">
                Горячих: {hotCount}
              </span>
            )}
          </div>
        )}
      </section>

      {view === 'list' && (
        <section className="space-y-4">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-xl font-semibold">Выберите ресторан</h2>
            <p className="text-sm text-gray-600">
              Нажмите на ресторан, чтобы увидеть доступные смены именно в нём.
            </p>
          </div>

          {restaurants.length === 0 ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-gray-700 shadow-sm">
              Открытых смен по выбранным фильтрам нет. Попробуйте убрать фильтр по дате,
              должности или метро.
            </div>
          ) : (
            <div className="space-y-4">
              {restaurants.map((restaurant) => (
                <div
                  key={restaurant.id}
                  className={`rounded-2xl border bg-white p-5 shadow-sm ${
                    restaurant.isHot ? 'border-red-200' : ''
                  }`}
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {restaurant.isHot && (
                      <span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-700">
                        Горячая смена
                      </span>
                    )}

                    {restaurant.metro && (
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                        {restaurant.metro}
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900">
                    {restaurant.name}
                  </h3>

                  <div className="mt-1 text-sm text-gray-600">
                    {[restaurant.city, restaurant.address].filter(Boolean).join(' • ')}
                  </div>

                  {restaurant.upcomingSlots && restaurant.upcomingSlots.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {restaurant.upcomingSlots.map((slot, index) => (
                        <div
                          key={`${slot.position}-${slot.work_date}-${slot.time_from}-${index}`}
                          className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700"
                        >
                          <div className="font-medium text-gray-900">{slot.position}</div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                            <span>{formatDateRu(slot.work_date)}</span>
                            <span>
                              {slot.time_from.slice(0, 5)}-{slot.time_to.slice(0, 5)}
                            </span>
                            <span>
                              {slot.hourly_rate ? `${slot.hourly_rate} ₽/час` : 'оплата по договоренности'}
                            </span>
                            <span>мест: {getRemainingCount(slot)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
                    Чтобы откликнуться, откройте ресторан и выберите смену.
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={`/restaurants/${restaurant.id}`}
                      className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600"
                    >
                      Выбрать этот ресторан
                    </a>

                    <button
                      type="button"
                      onClick={() => handleShowOnMap(restaurant.id)}
                      className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50"
                    >
                      Показать на карте
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {view === 'map' && (
        <section id="map-section" className="space-y-4">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-xl font-semibold">Карта ресторанов</h2>
            <p className="text-sm text-gray-600">
              Можно приблизить карту и затем вернуться к списку. Для выбора смен чаще
              удобнее использовать список ресторанов.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <YandexMap
              restaurants={restaurants}
              focusRestaurantId={focusedRestaurantId}
            />
          </div>

          {focusedRestaurantId && (
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <a
                href={`/restaurants/${focusedRestaurantId}`}
                className="inline-flex rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600"
              >
                Перейти к сменам выбранного ресторана
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
