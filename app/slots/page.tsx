import Link from 'next/link';

import ContactCard from '@/app/components/ContactCard';
import SlotsExplorer from '@/app/components/SlotsExplorer';
import { supabase } from '@/lib/supabase';

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

function formatDateRu(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

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
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <Link
          href="/"
          className="inline-flex rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← На главную
        </Link>
      </div>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">
          Доступные смены
        </h1>
        <p className="text-sm text-gray-600">
          Сначала удобнее выбрать ресторан из списка ниже. Карта остаётся как дополнительный
          режим, если хочется посмотреть расположение.
        </p>

        <div className="mt-5 flex flex-wrap gap-3 text-sm text-gray-700">
          <span className="rounded-full bg-gray-100 px-3 py-1">
            Смен найдено: {typedOpenSlots.length}
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1">
            Ресторанов: {restaurants.length}
          </span>
          {hotCount > 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">
              Горячих ресторанов: {hotCount}
            </span>
          )}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Фильтры</h2>

        <form className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
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

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Дата</label>
            <select
              name="date"
              defaultValue={selectedDate}
              className="w-full rounded-lg border p-3"
            >
              <option value="">Все даты</option>
              {dates.map((date) => (
                <option key={date} value={date}>
                  {formatDateRu(date)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Метро</label>
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

          <div className="flex flex-wrap gap-2 md:col-span-3">
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
      </section>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          Ошибка загрузки данных: {errorMessage}
        </div>
      ) : (
        <SlotsExplorer
          restaurants={restaurants}
          initialFocusRestaurantId={focusRestaurantId}
        />
      )}

      <ContactCard />
    </main>
  );
}