import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Нет авторизации' }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 });
    }

    const user = userData.user;
    const body = await req.json();
    const slotId = Number(body.slotId);

    if (!slotId) {
      return NextResponse.json({ error: 'Не передан slotId' }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('employee_profiles')
      .select(
        'user_id, email, full_name, phone, role, home_restaurant_id, is_blocked'
      )
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Сначала заполните профиль сотрудника' },
        { status: 400 }
      );
    }

    if (profile.is_blocked) {
      return NextResponse.json(
        { error: 'Ваш аккаунт заблокирован. Обратитесь к HR BP.' },
        { status: 403 }
      );
    }

    const { data: homeRestaurant } = await supabaseAdmin
      .from('restaurants')
      .select('name')
      .eq('id', profile.home_restaurant_id)
      .single();

    const { data: slot, error: slotError } = await supabaseAdmin
      .from('slots')
      .select('id, status')
      .eq('id', slotId)
      .single();

    if (slotError || !slot) {
      return NextResponse.json({ error: 'Слот не найден' }, { status: 404 });
    }

    if (slot.status !== 'open') {
      return NextResponse.json(
        { error: 'Этот слот уже недоступен' },
        { status: 400 }
      );
    }

    const { data: existingApplication } = await supabaseAdmin
      .from('applications')
      .select('id')
      .eq('slot_id', slotId)
      .eq('employee_user_id', user.id)
      .in('status', ['pending', 'approved'])
      .maybeSingle();

    if (existingApplication) {
      return NextResponse.json(
        { error: 'Вы уже откликнулись на эту смену' },
        { status: 400 }
      );
    }

    const { error: applicationError } = await supabaseAdmin
      .from('applications')
      .insert([
        {
          slot_id: slotId,
          full_name: profile.full_name,
          home_restaurant: homeRestaurant?.name || 'Не указан',
          contact: profile.phone,
          comment: '',
          status: 'pending',
          employee_user_id: user.id,
          employee_email: profile.email,
          employee_phone: profile.phone,
          employee_role: profile.role,
          employee_home_restaurant_id: profile.home_restaurant_id,
        },
      ]);

    if (applicationError) {
      return NextResponse.json(
        { error: applicationError.message },
        { status: 500 }
      );
    }

    const { error: slotUpdateError } = await supabaseAdmin
      .from('slots')
      .update({ status: 'pending' })
      .eq('id', slotId);

    if (slotUpdateError) {
      return NextResponse.json(
        { error: slotUpdateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Ошибка сервера при отклике' },
      { status: 500 }
    );
  }
}