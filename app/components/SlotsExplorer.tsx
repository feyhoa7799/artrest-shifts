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
};

type SlotsExplorerProps = {
  restaurants: Restaurant[];
  initialFocusRestaurantId?: number | null;
};

export default function SlotsExplorer({
  restaurants,
  initialFocusRestaurantId = null,
}: SlotsExplorerProps) {
  const [focusedRestaurantId, setFocusedRestaurantId] = useState<number | null>(
    initialFocusRestaurantId
  );
  const [view, setView] = useState<'list' | 'map'>('list');

  useEffect(() => {
    setFocusedRestaurantId(initialFocusRestaurantId);

    if (initialFocusRestaurantId) {
      setView('map');

      window.setTimeout(() => {
        document.getElementById('map-section')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 100);
    }
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
          Сначала удобнее посмотреть список. Потом при желании можно открыть карту и
          увидеть расположение ресторана.
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
              По выбранным фильтрам открытых смен нет.
            </div>
          ) : (
            <div className="space-y-4">
              {restaurants.map((restaurant) => (
                <div
                  key={restaurant.id}
                  className="rounded-2xl border bg-white p-5 shadow-sm"
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