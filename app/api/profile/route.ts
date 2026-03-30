import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ALLOWED_ROLES = [
  'Член команды',
  'Член команды 1 уровня',
  'Тренер',
  'Младший менеджер смены',
  'Менеджер смены 1 уровня',
  'Менеджер смены 2 уровня',
  'Заместитель директора',
  'Директор',
];

function isValidRussianPhone(phone: string) {
  return /^\+7\d{10}$/.test(phone);
}

async function getUserFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '').trim();

  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) return null;

  return data.user;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json({ profile: null }, { status: 401 });
    }

    const { data: profile, error } = await supabaseAdmin
      .from('employee_profiles')
      .select(
        'user_id, email, full_name, phone, role, home_restaurant_id, is_blocked, created_at, updated_at'
      )
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      profile: profile || null,
    });
  } catch {
    return NextResponse.json({ profile: null }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json({ error: 'Нет авторизации' }, { status: 401 });
    }

    const body = await req.json();

    const fullName = String(body.full_name || '').trim();
    const phone = String(body.phone || '').trim();
    const role = String(body.role || '').trim();
    const homeRestaurantId = Number(body.home_restaurant_id);

    if (!fullName) {
      return NextResponse.json({ error: 'Введите ФИО' }, { status: 400 });
    }

    if (!isValidRussianPhone(phone)) {
      return NextResponse.json(
        { error: 'Телефон должен быть в формате +7XXXXXXXXXX' },
        { status: 400 }
      );
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Некорректная должность' }, { status: 400 });
    }

    if (!homeRestaurantId) {
      return NextResponse.json({ error: 'Выберите домашний ресторан' }, { status: 400 });
    }

    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .eq('id', homeRestaurantId)
      .single();

    if (restaurantError || !restaurant) {
      return NextResponse.json({ error: 'Ресторан не найден' }, { status: 400 });
    }

    const payload = {
      user_id: user.id,
      email: user.email || '',
      full_name: fullName,
      phone,
      role,
      home_restaurant_id: homeRestaurantId,
    };

    const { error: upsertError } = await supabaseAdmin
      .from('employee_profiles')
      .upsert(payload, {
        onConflict: 'user_id',
      });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    const { data: savedProfile, error: profileError } = await supabaseAdmin
      .from('employee_profiles')
      .select(
        'user_id, email, full_name, phone, role, home_restaurant_id, is_blocked, created_at, updated_at'
      )
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      profile: savedProfile,
    });
  } catch {
    return NextResponse.json(
      { error: 'Ошибка сервера при сохранении профиля' },
      { status: 500 }
    );
  }
}