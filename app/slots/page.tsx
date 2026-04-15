import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ContactCard from '../components/ContactCard';
import SlotsExplorer from '../components/SlotsExplorer';

type SearchParams = Promise<{
  position?: string;
  date?: string;
  metro?: string;
  focus?: string;
}>;

type SlotRow = {
  restaurant_id: number;
  position: string;
  work_date: string;
  is_hot: boolean | null;
};

type FilterSlotRow = {
  position: string;
  work_date: string;
};

type MetroRow = {
  metro: string | null;
};

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

export default async function SlotsPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;

  const selectedPosition = searchParams.position || '';
  const selectedDate = searchParams.date || '';
  const selectedMetro = searchParams.metro || '';
  const focusRestaurantId = searchParams.focus ? Number(searchParams.focus) : null;

  const todayStr = new Date().toISOString().slice(0, 10);

  let slotsQuery = supabase
    .from('slots')
    .select('restaurant_id, position, work_date, is_hot')
    .eq('status', 'open')
    .gte('work_date', todayStr);

  if (selectedPosition) {
    slotsQuery = slotsQuery.eq('position', selectedPosition);
  }

  if (selectedDate) {
    slotsQuery = slotsQuery.eq('work_date', selectedDate);
  }

  const { data: openSlots, error: slotsError } = await slotsQuery;
  const typedOpenSlots = (openSlots || []) as SlotRow[];

  const restaurantIds = [...new Set(typedOpenSlots.map((slot) => slot.restaurant_id))];
  const hotRestaurantIds = new Set(
    typedOpenSlots.filter((slot) => slot.is_hot).map((slot) => slot.restaurant_id)
  );

  let restaurants: Restaurant[] = [];
  let restaurantsError: string | null = null;

  if (restaurantIds.length > 0) {
    let restaurantQuery = supabase
      .from('restaurants')
      .select('id, name, address, city, metro, lat, lng')
      .in('id', restaurantIds);

    if (selectedMetro) {
      restaurantQuery = restaurantQuery.eq('metro', selectedMetro);
    }

    const { data, error } = await restaurantQuery;

    restaurants = ((data || []) as Restaurant[]).map((restaurant) => ({
      ...restaurant,
      isHot: hotRestaurantIds.has(restaurant.id),
    }));

    restaurantsError = error?.message || null;
  }

  restaurants.sort((a, b) => {
    const aHot = a.isHot ? 1 : 0;
    const bHot = b.isHot ? 1 : 0;
    return bHot - aHot || a.name.localeCompare(b.name);
  });

  const { data: allOpenSlots } = await supabase
    .from('slots')
    .select('position, work_date')
    .eq('status', 'open')
    .gte('work_date', todayStr);

  const { data: allRestaurantsWithMetro } = await supabase
    .from('restaurants')
    .select('metro')
    .not('metro', 'is', null);

  const positions = [
    ...new Set(
      ((allOpenSlots || []) as FilterSlotRow[])
        .map((slot) => slot.position)
        .filter(Boolean)
    ),
  ].sort();

  const dates = [
    ...new Set(
      ((allOpenSlots || []) as FilterSlotRow[])
        .map((slot) => slot.work_date)
        .filter(Boolean)
    ),
  ].sort();

  const metros = [
    ...new Set(
      ((allRestaurantsWithMetro || []) as MetroRow[])
        .map((restaurant) => restaurant.metro)
        .filter(Boolean)
    ),
  ].sort() as string[];

  const errorMessage = slotsError?.message || restaurantsError;
  const hotCount = restaurants.filter((restaurant) => restaurant.isHot).length;

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/"
              className="mb-2 inline-flex items-center text-sm font-medium text-red-600 hover:underline"
            >
              ← На главную
            </Link>

            <h1 className="text-3xl font-bold">Открытые смены</h1>
            <p className="mt-2 max-w-2xl text-gray-600">
              Выберите удобный ресторан и подходящую смену.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-4 py-2 text-sm text-gray-700 shadow-sm">
              Смен найдено: {typedOpenSlots.length}
            </span>
            <span className="rounded-full bg-white px-4 py-2 text-sm text-gray-700 shadow-sm">
              Ресторанов: {restaurants.length}
            </span>
            {hotCount > 0 && (
              <span className="rounded-full bg-red-100 px-4 py-2 text-sm font-medium text-red-700 shadow-sm">
                🔥 Горячих ресторанов: {hotCount}
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6 min-w-0">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">Фильтры</h2>

              <form action="/slots" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Должность
                  </label>
                  <select
                    name="position"
                    defaultValue={selectedPosition}
                    className="w-full rounded-lg border p-3"
                  >
                    <option value="">Все должности</option>
                    {positions.map((position) => (
                      <option key={position} value={position}>
                        {position}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Дата
                  </label>
                  <select
                    name="date"
                    defaultValue={selectedDate}
                    className="w-full rounded-lg border p-3"
                  >
                    <option value="">Все даты</option>
                    {dates.map((date) => (
                      <option key={date} value={date}>
                        {date}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Метро
                  </label>
                  <select
                    name="metro"
                    defaultValue={selectedMetro}
                    className="w-full rounded-lg border p-3"
                  >
                    <option value="">Все станции</option>
                    {metros.map((metro) => (
                      <option key={metro} value={metro}>
                        {metro}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-end gap-2 xl:justify-end">
                  <button
                    type="submit"
                    className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600"
                  >
                    Применить
                  </button>

                  <Link
                    href="/slots"
                    className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50"
                  >
                    Сбросить
                  </Link>
                </div>
              </form>
            </div>

            {errorMessage ? (
              <div className="rounded-lg bg-red-100 p-4 text-red-700">
                Ошибка загрузки данных: {errorMessage}
              </div>
            ) : (
              <SlotsExplorer
                restaurants={restaurants}
                initialFocusRestaurantId={focusRestaurantId}
              />
            )}
          </div>

          <div className="space-y-4">
            <ContactCard />
          </div>
        </div>
      </div>
    </main>
  );
}