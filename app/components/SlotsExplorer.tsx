'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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

  useEffect(() => {
    setFocusedRestaurantId(initialFocusRestaurantId);
  }, [initialFocusRestaurantId, restaurants]);

  const hotCount = useMemo(
    () => restaurants.filter((restaurant) => restaurant.isHot).length,
    [restaurants]
  );

  function handleShowOnMap(restaurantId: number) {
    setFocusedRestaurantId(restaurantId);
    document.getElementById('map-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  return (
    <>
      {restaurants.length > 0 && (
        <section id="map-section" className="mb-6 scroll-mt-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Карта открытых смен</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 shadow-sm">
                {restaurants.length} ресторанов
              </span>

              {hotCount > 0 && (
                <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 shadow-sm">
                  🔥 Горячих: {hotCount}
                </span>
              )}
            </div>
          </div>

          <YandexMap
            restaurants={restaurants}
            focusRestaurantId={focusedRestaurantId}
          />
        </section>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Рестораны с открытыми сменами</h2>
        <span className="rounded-full bg-white px-3 py-1 text-sm text-gray-600 shadow-sm">
          {restaurants.length} шт.
        </span>
      </div>

      {restaurants.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6 text-gray-500 shadow-sm">
          По выбранным фильтрам открытых смен нет.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {restaurants.map((restaurant) => (
            <div
              key={restaurant.id}
              className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                restaurant.isHot ? 'border-red-300 ring-1 ring-red-200 bg-red-50/30' : ''
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold">{restaurant.name}</h3>

                {restaurant.isHot && (
                  <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
                    🔥 Горячая смена
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-700">{restaurant.address}</p>

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

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/restaurants/${restaurant.id}`}
                  className="inline-flex items-center rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600"
                >
                  Посмотреть смены
                </Link>

                <button
                  type="button"
                  onClick={() => handleShowOnMap(restaurant.id)}
                  className="inline-flex items-center rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  Показать на карте
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}