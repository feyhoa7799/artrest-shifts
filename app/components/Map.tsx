'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    ymaps: any;
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

type MapProps = {
  restaurants: Restaurant[];
  focusRestaurantId?: number | null;
};

export default function Map({ restaurants, focusRestaurantId = null }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || !window.ymaps) return;

    window.ymaps.ready(() => {
      if (!mapRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }

      const validRestaurants = restaurants.filter(
        (restaurant) => restaurant.lat != null && restaurant.lng != null
      );

      const map = new window.ymaps.Map(mapRef.current, {
        center: [55.751244, 37.618423],
        zoom: 10,
        controls: ['zoomControl', 'fullscreenControl'],
      });

      mapInstanceRef.current = map;

      const placemarks: Array<{ restaurantId: number; placemark: any }> = [];

      validRestaurants.forEach((restaurant) => {
        const iconSize = restaurant.isHot ? [52, 68] : [40, 52];
        const iconOffset = restaurant.isHot ? [-26, -68] : [-20, -52];

        const placemark = new window.ymaps.Placemark(
          [restaurant.lat, restaurant.lng],
          {
            balloonContent: `
              <div style="min-width:220px;padding:4px 2px;">
                <div style="font-weight:700;margin-bottom:6px;">${restaurant.name}</div>
                ${restaurant.isHot ? '<div style="margin-bottom:6px;color:#dc2626;font-weight:700;">🔥 Горячая смена</div>' : ''}
                ${restaurant.address ? `<div style="font-size:13px;margin-bottom:4px;">${restaurant.address}</div>` : ''}
                ${restaurant.metro ? `<div style="font-size:13px;margin-bottom:8px;">Метро: ${restaurant.metro}</div>` : ''}
                <a href="/restaurants/${restaurant.id}" style="color:#dc2626;font-weight:600;">Открыть смены</a>
              </div>
            `,
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

        map.geoObjects.add(placemark);
        placemarks.push({
          restaurantId: restaurant.id,
          placemark,
        });
      });

      if (focusRestaurantId) {
        const focused = validRestaurants.find((item) => item.id === focusRestaurantId);

        if (focused?.lat && focused?.lng) {
          map.setCenter([focused.lat, focused.lng], 15, {
            checkZoomRange: true,
          });

          const focusedPlacemark = placemarks.find(
            (item) => item.restaurantId === focusRestaurantId
          );

          if (focusedPlacemark) {
            focusedPlacemark.placemark.balloon.open();
          }
        }
      } else if (validRestaurants.length > 0) {
        const bounds = map.geoObjects.getBounds();

        if (bounds) {
          map.setBounds(bounds, {
            checkZoomRange: true,
            zoomMargin: 40,
          });
        }
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [restaurants, focusRestaurantId]);

  return (
    <div
      ref={mapRef}
      className="h-[560px] w-full rounded-2xl border bg-white shadow-sm"
    />
  );
}