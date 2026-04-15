import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import Map from '@/app/components/Map';
import ContactCard from '@/app/components/ContactCard';
import AuthGate from '@/app/components/AuthGate';

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

export default async function Home(props: { searchParams: SearchParams }) {
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

  const positions = [...new Set((allOpenSlots || []).map((slot) => slot.position))].sort();
  const dates = [...new Set((allOpenSlots || []).map((slot) => slot.work_date))].sort();
  const metros = [...new Set((allRestaurantsWithMetro || []).map((r) => r.metro).filter(Boolean))].sort();

  const errorMessage = slotsError?.message || restaurantsError;
  const hotCount = restaurants.filter((r) => r.isHot).length;

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-6xl p-6">
        <div className="relative mb-6 overflow-hidden rounded-[28px] bg-red-600 text-white shadow-lg">
          <div className="absolute inset-0">
            <Image
              src="/brand/rostics-team-hero.jpg"
              alt="Команда ROSTIC'S"
              fill
              sizes="(max-width: 768px) 100vw, 1200px"
              className="object-cover opacity-35"
              priority
            />
          </div>

          <div className="relative grid gap-6 p-8 md:grid-cols-[1.2fr_0.8fr] md:p-10">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/90">
                АртРест × ROSTIC’S
              </p>
              <h1 className="mb-3 text-3xl font-bold md:text-5xl">
                Подработки
              </h1>
              <p className="max-w-2xl text-white/90">
                Войди по ссылке из email, заполни профиль и откликайся на смены в соседних ресторанах.
              </p>

              {hotCount > 0 && (
                <div className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-red-600">
                  🔥 Сейчас доступно горячих ресторанов: {hotCount}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white/95 p-4 text-gray-900 backdrop-blur">
              <ContactCard />
            </div>
          </div>
        </div>

        <div className="mb-6">
          <AuthGate />
        </div>

        <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Фильтры</h2>

          <form className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Должность</label>
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
              <label className="mb-1 block text-sm font-medium text-gray-700">Дата</label>
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

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Метро</label>
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

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600"
              >
                Применить
              </button>

              <a
                href="/"
                className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50"
              >
                Сбросить
              </a>
            </div>
          </form>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-lg bg-red-100 p-4 text-red-700">
            Ошибка загрузки данных: {errorMessage}
          </div>
        )}

        {!errorMessage && restaurants.length > 0 && (
          <div id="map-section" className="mb-6 scroll-mt-6">
            <Map restaurants={restaurants} focusRestaurantId={focusRestaurantId} />
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Рестораны с открытыми сменами</h2>
          <span className="rounded-full bg-white px-3 py-1 text-sm text-gray-600 shadow-sm">
            {restaurants.length} шт.
          </span>
        </div>

        {!errorMessage && restaurants.length === 0 ? (
          <div className="rounded-2xl border bg-white p-6 text-gray-500 shadow-sm">
            По выбранным фильтрам открытых смен нет
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {restaurants.map((r) => (
              <div
                key={r.id}
                className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  r.isHot ? 'border-red-300 ring-1 ring-red-200 bg-red-50/30' : ''
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold">{r.name}</h3>
                  {r.isHot && (
                    <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
                      🔥 Горячая смена
                    </span>
                  )}
                </div>

                <p className="text-sm text-gray-700">{r.address}</p>

                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                    {r.city}
                  </span>

                  {r.metro && (
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700">
                      🚇 {r.metro}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={`/restaurants/${r.id}`}
                    className="inline-block rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600"
                  >
                    Посмотреть смены
                  </a>

                  <a
                    href={`/?focus=${r.id}#map-section`}
                    className="inline-block rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
                  >
                    На карте
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
