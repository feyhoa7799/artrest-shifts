import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('restaurants')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[api/restaurants] Supabase error:', error);

      return NextResponse.json(
        { error: 'Не удалось загрузить список ресторанов' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      restaurants: data || [],
    });
  } catch (error) {
    console.error('[api/restaurants] Unexpected error:', error);

    return NextResponse.json(
      { error: 'Не удалось загрузить список ресторанов' },
      { status: 500 }
    );
  }
}