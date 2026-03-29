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
};

export default function Map({ restaurants }: { restaurants: Restaurant[] }) {
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

      const map = new window.ymaps.Map(mapRef.current, {
        center: [55.751244, 37.618423],
        zoom: 10,
        controls: ['zoomControl', 'fullscreenControl'],
      });

      mapInstanceRef.current = map;

      restaurants.forEach((restaurant) => {
        if (!restaurant.lat || !restaurant.lng) return;

        const placemark = new window.ymaps.Placemark(
          [restaurant.lat, restaurant.lng],
          {
            balloonContent: `
              <div>
                <strong>${restaurant.name}</strong><br/>
                ${restaurant.address ? `${restaurant.address}<br/>` : ''}
                ${restaurant.metro ? `Метро: ${restaurant.metro}<br/>` : ''}
                <a href="/restaurants/${restaurant.id}">Открыть смены</a>
              </div>
            `,
          },
          {
            preset: 'islands#redIcon',
          }
        );

        map.geoObjects.add(placemark);
      });
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [restaurants]);

  return <div ref={mapRef} className="h-[500px] w-full rounded-xl border" />;
}