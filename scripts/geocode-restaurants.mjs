import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const YANDEX_GEOCODER_API_KEY = process.env.YANDEX_GEOCODER_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !YANDEX_GEOCODER_API_KEY) {
  console.error('Не хватает переменных окружения.');
  console.error('Проверь .env.local:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  console.error('- YANDEX_GEOCODER_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Москва и МО
const BBOX = '36.80,55.10~38.30,56.20';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractCoords(json) {
  const members = json?.response?.GeoObjectCollection?.featureMember || [];
  if (!members.length) return null;

  const geoObject = members[0]?.GeoObject;
  const pos = geoObject?.Point?.pos;

  if (!pos) return null;

  const [lngStr, latStr] = pos.split(' ');

  return {
    lat: Number(latStr),
    lng: Number(lngStr),
  };
}

async function geocodeAddress(address) {
  const query = `${address}, Россия`;

  const url =
    `https://geocode-maps.yandex.ru/v1` +
    `?apikey=${encodeURIComponent(YANDEX_GEOCODER_API_KEY)}` +
    `&geocode=${encodeURIComponent(query)}` +
    `&format=json` +
    `&results=1` +
    `&bbox=${encodeURIComponent(BBOX)}` +
    `&rspn=1` +
    `&lang=ru_RU`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Geocoder HTTP ${response.status}`);
  }

  const json = await response.json();
  return extractCoords(json);
}

async function main() {
  console.log('Читаю restaurants из Supabase...');

  const { data: restaurants, error } = await supabase
    .from('restaurants')
    .select('id, name, address')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Ошибка чтения restaurants: ${error.message}`);
  }

  if (!restaurants?.length) {
    console.log('Таблица restaurants пустая.');
    return;
  }

  let updated = 0;
  let failed = 0;

  for (const restaurant of restaurants) {
    try {
      const result = await geocodeAddress(restaurant.address);

      if (!result) {
        console.log(`NOT FOUND [${restaurant.id}] ${restaurant.name}`);
        failed += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from('restaurants')
        .update({
          lat: result.lat,
          lng: result.lng,
        })
        .eq('id', restaurant.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      updated += 1;
      console.log(
        `OK [${restaurant.id}] ${restaurant.name} -> ${result.lat}, ${result.lng}`
      );

      await sleep(250);
    } catch (e) {
      failed += 1;
      console.log(
        `ERR [${restaurant.id}] ${restaurant.name}: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
      await sleep(500);
    }
  }

  console.log('---');
  console.log(`Обновлено: ${updated}`);
  console.log(`Ошибок: ${failed}`);
}

main().catch((e) => {
  console.error('Скрипт завершился с ошибкой:');
  console.error(e);
  process.exit(1);
});