import { createClient } from '@supabase/supabase-js';
import { metroStations } from './metro-stations.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Не хватает переменных окружения.');
  console.error('Проверь .env.local:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestMetro(lat, lng) {
  let nearest = null;
  let minDistance = Infinity;

  for (const station of metroStations) {
    const dist = distanceKm(lat, lng, station.lat, station.lng);

    if (dist < minDistance) {
      minDistance = dist;
      nearest = station;
    }
  }

  return nearest;
}

async function updateRestaurantMetro(restaurant, metroName, attempt = 1) {
  try {
    const { error } = await supabase
      .from('restaurants')
      .update({ metro: metroName })
      .eq('id', restaurant.id);

    if (error) {
      throw new Error(error.message);
    }

    return true;
  } catch (error) {
    if (attempt < 3) {
      await sleep(700 * attempt);
      return updateRestaurantMetro(restaurant, metroName, attempt + 1);
    }

    throw error;
  }
}

async function main() {
  console.log('Читаю restaurants из Supabase...');

  const { data: restaurants, error } = await supabase
    .from('restaurants')
    .select('id, name, lat, lng')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Ошибка чтения restaurants: ${error.message}`);
  }

  if (!restaurants?.length) {
    console.log('Таблица restaurants пустая.');
    return;
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const restaurant of restaurants) {
    try {
      if (!restaurant.lat || !restaurant.lng) {
        console.log(`SKIP [${restaurant.id}] ${restaurant.name} -> нет координат`);
        skipped += 1;
        continue;
      }

      const nearestMetro = findNearestMetro(restaurant.lat, restaurant.lng);

      if (!nearestMetro) {
        console.log(`SKIP [${restaurant.id}] ${restaurant.name} -> метро не найдено`);
        skipped += 1;
        continue;
      }

      await updateRestaurantMetro(restaurant, nearestMetro.name);

      updated += 1;
      console.log(`OK [${restaurant.id}] ${restaurant.name} -> ${nearestMetro.name}`);

      await sleep(120);
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
  console.log(`Пропущено: ${skipped}`);
  console.log(`Ошибок: ${failed}`);
}

main().catch((e) => {
  console.error('Скрипт завершился с ошибкой:');
  console.error(e);
  process.exit(1);
});