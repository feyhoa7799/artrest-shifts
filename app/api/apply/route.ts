import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { slotId, fullName, homeRestaurant, contact, comment } = body;

    if (!slotId || !fullName || !homeRestaurant || !contact) {
      return NextResponse.json(
        { error: 'Заполнены не все обязательные поля' },
        { status: 400 }
      );
    }

    const { error: applicationError } = await supabase.from('applications').insert([
      {
        slot_id: slotId,
        full_name: fullName,
        home_restaurant: homeRestaurant,
        contact,
        comment: comment || '',
      },
    ]);

    if (applicationError) {
      return NextResponse.json(
        { error: applicationError.message },
        { status: 500 }
      );
    }

    const { error: slotError } = await supabase
      .from('slots')
      .update({ status: 'pending' })
      .eq('id', slotId);

    if (slotError) {
      return NextResponse.json(
        { error: slotError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Ошибка обработки запроса' },
      { status: 500 }
    );
  }
}