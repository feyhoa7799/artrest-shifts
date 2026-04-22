import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';

type EmployeeProfileRow = {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  role: string;
  home_restaurant_id: number;
};

type SlotRow = {
  id: number;
  restaurant_id: number;
  work_date: string;
  time_from: string;
  time_to: string;
  position: string | null;
  status: string;
};

type ApplicationRow = {
  id: number;
  slot_id: number;
  employee_user_id: string;
  status: 'pending' | 'approved' | 'rejected';
};

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
      .select('user_id, email, full_name, phone, role, home_restaurant_id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Сначала заполните профиль сотрудника' },
        { status: 400 }
      );
    }

    const employeeProfile = profile as EmployeeProfileRow;

    const { data: slot, error: slotError } = await supabaseAdmin
      .from('slots')
      .select('id, restaurant_id, work_date, time_from, time_to, position, status')
      .eq('id', slotId)
      .single();

    if (slotError || !slot) {
      return NextResponse.json({ error: 'Смена не найдена' }, { status: 404 });
    }

    const currentSlot = slot as SlotRow;

    if (currentSlot.status !== 'open') {
      return NextResponse.json(
        { error: 'Эта смена уже недоступна' },
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

    const { data: userApplications } = await supabaseAdmin
      .from('applications')
      .select('id, slot_id, employee_user_id, status')
      .eq('employee_user_id', user.id)
      .in('status', ['pending', 'approved']);

    const activeApplications = (userApplications || []) as ApplicationRow[];

    if (activeApplications.length > 0) {
      const activeSlotIds = activeApplications.map((item) => item.slot_id);

      const { data: activeSlots } = await supabaseAdmin
        .from('slots')
        .select('id, work_date')
        .in('id', activeSlotIds);

      const hasSameDate = (activeSlots || []).some(
        (item) => item.work_date === currentSlot.work_date
      );

      if (hasSameDate) {
        return NextResponse.json(
          {
            error:
              'На эту дату у вас уже есть отклик. Сначала отмените предыдущий отклик или дождитесь решения по нему.',
          },
          { status: 400 }
        );
      }
    }

    const { error: applicationError } = await supabaseAdmin
      .from('applications')
      .insert([
        {
          slot_id: slotId,
          full_name: employeeProfile.full_name,
          home_restaurant: '',
          contact: employeeProfile.phone,
          comment: '',
          status: 'pending',
          employee_user_id: user.id,
          employee_email: employeeProfile.email,
          employee_phone: employeeProfile.phone,
          employee_role: employeeProfile.role,
          employee_home_restaurant_id: employeeProfile.home_restaurant_id,
        },
      ]);

    if (applicationError) {
      return NextResponse.json({ error: applicationError.message }, { status: 500 });
    }

    const { error: slotUpdateError } = await supabaseAdmin
      .from('slots')
      .update({ status: 'pending' })
      .eq('id', slotId);

    if (slotUpdateError) {
      return NextResponse.json({ error: slotUpdateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Ошибка сервера при отклике' },
      { status: 500 }
    );
  }
}