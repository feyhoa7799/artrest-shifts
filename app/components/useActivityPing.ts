'use client';

import { useEffect } from 'react';

const ACTIVITY_PING_INTERVAL_MS = 10 * 60 * 1000;
const ACTIVITY_PING_STORAGE_KEY = 'artrest:last-activity-ping-at';

function getSafePage() {
  if (typeof window === 'undefined') return '/';

  return `${window.location.pathname}${window.location.search}`.slice(0, 120);
}

export function useActivityPing(accessToken: string) {
  useEffect(() => {
    if (!accessToken || typeof window === 'undefined') return;

    const now = Date.now();
    const lastPingAt = Number(
      window.localStorage.getItem(ACTIVITY_PING_STORAGE_KEY) || 0
    );

    if (Number.isFinite(lastPingAt) && now - lastPingAt < ACTIVITY_PING_INTERVAL_MS) {
      return;
    }

    window.localStorage.setItem(ACTIVITY_PING_STORAGE_KEY, String(now));

    void fetch('/api/activity/ping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        last_page: getSafePage(),
      }),
      cache: 'no-store',
    }).catch(() => {
      window.localStorage.removeItem(ACTIVITY_PING_STORAGE_KEY);
    });
  }, [accessToken]);
}
