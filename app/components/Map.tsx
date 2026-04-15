'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

declare global {
  interface Window {
    ymaps?: any;
    __yandexMapsLoadingPromise?: Promise<void>;
  }
}

type Restaurant = {
  id: number;
  name: string;
  address?: string;
  metro?: string | null;
  lat: number | null;
  lng: number | null;
  isHot?: boolean;
};

type ValidRestaurant = Restaurant & {
  lat: number;
  lng: number;
};

type YandexMapProps = {
  restaurants: Restaurant[];
  focusRestaurantId?: number | null;
};

const DEFAULT_CENTER: [number, number] = [55.751244, 37.618423];
const DEFAULT_ZOOM = 10;
const YANDEX_SCRIPT_ID = 'yandex-maps-api-script';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildBalloonContent(restaurant: Restaurant) {
  const name = escapeHtml(restaurant.name);
  const address = restaurant.address ? escapeHtml(restaurant.address) : '';
  const metro = restaurant.metro ? escapeHtml(restaurant.metro) : '';

  return `
    <div style="min-width:220px;padding:4px 2px;">
      <div style="font-weight:700;margin-bottom:6px;">${name}</div>
      ${
        restaurant.isHot
          ? '<div style="margin-bottom:6px;color:#dc2626;font-weight:700;">🔥 Горячая смена</div>'
          : ''
      }
      ${
        address
          ? `<div style="font-size:13px;margin-bottom:4px;">${address}</div>`
          : ''
      }
      ${
        metro
          ? `<div style="font-size:13px;margin-bottom:8px;">Метро: ${metro}</div>`
          : ''
      }
      <a href="/restaurants/${restaurant.id}" style="color:#dc2626;font-weight:600;">
        Открыть смены
      </a>
    </div>
  `;
}

function loadYandexMaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('window is undefined'));
  }

  if (window.ymaps) {
    return new Promise((resolve) => {
      window.ymaps.ready(() => resolve());
    });
  }

  if (window.__yandexMapsLoadingPromise) {
    return window.__yandexMapsLoadingPromise;
  }

  window.__yandexMapsLoadingPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(
      YANDEX_SCRIPT_ID
    ) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (!window.ymaps) {
          reject(new Error('Yandex Maps script loaded, but ymaps is unavailable'));
          return;
        }

        window.ymaps.ready(() => resolve());
      });

      existingScript.addEventListener('error', () => {
        reject(new Error('Failed to load existing Yandex Maps script'));
      });

      return;
    }

    const script = document.createElement('script');
    script.id = YANDEX_SCRIPT_ID;
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU`;
    script.async = true;

    script.onload = () => {
      if (!window.ymaps) {
        reject(new Error('Yandex Maps script loaded, but ymaps is unavailable'));
        return;
      }

      window.ymaps.ready(() => resolve());
    };

    script.onerror = () => {
      reject(new Error('Failed to load Yandex Maps script'));
    };

    document.head.appendChild(script);
  });

  return window.__yandexMapsLoadingPromise;
}

export default function YandexMap({
  restaurants,
  focusRestaurantId = null,
}: YandexMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any | null>(null);
  const geoObjectsRef = useRef<any | null>(null);
  const placemarksRef = useRef<globalThis.Map<number, any>>(new globalThis.Map());

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');

  const validRestaurants = useMemo(
    () =>
      restaurants.filter(
        (restaurant): restaurant is ValidRestaurant =>
          typeof restaurant.lat === 'number' && typeof restaurant.lng === 'number'
      ),
    [restaurants]
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAP_API_KEY;

        if (!apiKey) {
          setMapError(
            'Не найден NEXT_PUBLIC_YANDEX_MAP_API_KEY. Проверь .env.local и перезапусти сервер.'
          );
          return;
        }

        await loadYandexMaps(apiKey);

        if (cancelled || !mapRef.current || mapInstanceRef.current || !window.ymaps) {
          return;
        }

        const map = new window.ymaps.Map(mapRef.current, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          controls: ['zoomControl', 'fullscreenControl'],
        });

        const geoObjects = new window.ymaps.GeoObjectCollection();
        map.geoObjects.add(geoObjects);

        mapInstanceRef.current = map;
        geoObjectsRef.current = geoObjects;
        setMapReady(true);
        setMapError('');
      } catch (error) {
        console.error(error);
        setMapError(
          'Не удалось загрузить Яндекс.Карты. Проверь API-ключ, доступность API и домен.'
        );
      }
    }

    init();

    return () => {
      cancelled = true;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }

      geoObjectsRef.current = null;
      placemarksRef.current.clear();
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !geoObjectsRef.current || !mapInstanceRef.current || !window.ymaps) {
      return;
    }

    const map = mapInstanceRef.current;
    const geoObjects = geoObjectsRef.current;

    geoObjects.removeAll();
    placemarksRef.current.clear();

    validRestaurants.forEach((restaurant) => {
      const iconSize = restaurant.isHot ? [52, 68] : [40, 52];
      const iconOffset = restaurant.isHot ? [-26, -68] : [-20, -52];

      const placemark = new window.ymaps.Placemark(
        [restaurant.lat, restaurant.lng],
        {
          balloonContent: buildBalloonContent(restaurant),
          hintContent: restaurant.name,
        },
        {
          iconLayout: 'default#image',
          iconImageHref: '/brand/rostics-map-pin.svg',
          iconImageSize: iconSize,
          iconImageOffset: iconOffset,
          hideIconOnBalloonOpen: false,
        }
      );

      geoObjects.add(placemark);
      placemarksRef.current.set(restaurant.id, placemark);
    });

    if (validRestaurants.length === 0) {
      map.setCenter(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }

    if (!focusRestaurantId) {
      const bounds = geoObjects.getBounds();

      if (bounds) {
        map.setBounds(bounds, {
          checkZoomRange: true,
          zoomMargin: 40,
        });
      } else {
        map.setCenter(DEFAULT_CENTER, DEFAULT_ZOOM);
      }
    }
  }, [mapReady, validRestaurants, focusRestaurantId]);

  useEffect(() => {
    if (!mapReady || !focusRestaurantId || !mapInstanceRef.current) return;

    const focusedRestaurant = validRestaurants.find(
      (restaurant) => restaurant.id === focusRestaurantId
    );

    if (!focusedRestaurant) return;

    mapInstanceRef.current.setCenter([focusedRestaurant.lat, focusedRestaurant.lng], 15, {
      checkZoomRange: true,
      duration: 300,
    });

    placemarksRef.current.get(focusRestaurantId)?.balloon.open();
  }, [mapReady, focusRestaurantId, validRestaurants]);

  return (
    <div className="relative">
      <div
        ref={mapRef}
        className="h-[560px] w-full rounded-2xl border bg-white shadow-sm"
      />

      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl border bg-white/95 p-6 text-center text-sm text-red-700">
          {mapError}
        </div>
      )}

      {!mapError && mapReady && validRestaurants.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 p-6 text-center text-sm text-gray-600">
          Для выбранных фильтров нет ресторанов с координатами для показа на карте.
        </div>
      )}
    </div>
  );
}