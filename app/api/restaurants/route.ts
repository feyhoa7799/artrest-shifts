import { NextResponse } from 'next/server';

import { getActiveRestaurantOptions } from '@/lib/restaurants-cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const restaurants = await getActiveRestaurantOptions();

    return NextResponse.json({
      restaurants,
    });
  } catch (error) {
    console.error('[api/restaurants] Unexpected error:', error);

    return NextResponse.json(
      { error: 'Не удалось загрузить список ресторанов' },
      { status: 500 }
    );
  }
}
