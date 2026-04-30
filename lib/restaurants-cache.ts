import { supabaseAdmin } from '@/lib/supabase-admin';

export type RestaurantOption = {
  id: number;
  name: string;
};

const RESTAURANTS_CACHE_TTL_MS = 15 * 60 * 1000;

let restaurantsCache: RestaurantOption[] | null = null;
let restaurantsCacheExpiresAt = 0;
let restaurantsCachePromise: Promise<RestaurantOption[]> | null = null;

function normalizeRestaurantOption(item: unknown): RestaurantOption | null {
  const row = item as { id?: unknown; name?: unknown };
  const id = Number(row.id);
  const name = String(row.name || '').trim();

  if (!id || !name) return null;

  return { id, name };
}

export async function getActiveRestaurantOptions(options: { force?: boolean } = {}) {
  const now = Date.now();

  if (!options.force && restaurantsCache && restaurantsCacheExpiresAt > now) {
    return restaurantsCache;
  }

  if (!options.force && restaurantsCachePromise) {
    return restaurantsCachePromise;
  }

  restaurantsCachePromise = (async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from('restaurants')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        console.error('[restaurants-cache] Supabase error:', error);
        return restaurantsCache || [];
      }

      const prepared = (data || [])
        .map(normalizeRestaurantOption)
        .filter((item): item is RestaurantOption => Boolean(item));

      restaurantsCache = prepared;
      restaurantsCacheExpiresAt = Date.now() + RESTAURANTS_CACHE_TTL_MS;

      return prepared;
    } finally {
      restaurantsCachePromise = null;
    }
  })();

  return restaurantsCachePromise;
}

export function clearActiveRestaurantOptionsCache() {
  restaurantsCache = null;
  restaurantsCacheExpiresAt = 0;
  restaurantsCachePromise = null;
}
