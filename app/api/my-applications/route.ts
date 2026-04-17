import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getShiftMeta } from '@/lib/shift';

type ApplicationRow = {
  id: number;
  slot_id: number;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  employee_user_id: string;
};

type SlotRow = {
  id: number;
  restaurant_id: number;
  work_date: string;
  time_from: string;
  time_to: string;
  position: string | null;
  hourly_rate: number | null;
  status: string;
};

type RestaurantRow = {
  id: number;
  name: string;
  city: string | null;
  address: string | null;
};

function parseShiftEnd(workDate: string, timeFrom: string, timeTo: string) {
  const start = new Date(`${workDate}T${timeFrom}:00+03:00`);
  const end = new Date(`${workDate}T${timeTo}:00+03:00`);

  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return end;
}

export async function GET(req: NextRequest) {
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

    const { data: applicationsData, error: applicationsError } = await supabaseAdmin
      .from('applications')
      .select('id, slot_id, created_at, status, rejection_reason, employee_user_id')
      .eq('employee_user_id', user.id)
      .order('created_at', { ascending: false });

    if (applicationsError) {
      return NextResponse.json({ error: applicationsError.message }, { status: 500 });
    }

    const applications = (applicationsData || []) as ApplicationRow[];

    if (!applications.length) {
      return NextResponse.json({ applications: [] });
    }

    const slotIds = Array.from(new Set(applications.map((item) => item.slot_id)));

    const { data: slotsData } = await supabaseAdmin
      .from('slots')
      .select('id, restaurant_id, work_date, time_from, time_to, position, hourly_rate, status')
      .in('id', slotIds);

    const slots = (slotsData || []) as SlotRow[];
    const slotMap = new Map<number, SlotRow>();
    slots.forEach((item) => slotMap.set(item.id, item));

    const restaurantIds = Array.from(new Set(slots.map((item) => item.restaurant_id)));

    const { data: restaurantsData } = await supabaseAdmin
      .from('restaurants')
      .select('id, name, city, address')
      .in('id', restaurantIds);

    const restaurants = (restaurantsData || []) as RestaurantRow[];
    const restaurantMap = new Map<number, RestaurantRow>();
    restaurants.forEach((item) => restaurantMap.set(item.id, item));

    const result = applications
      .map((application) => {
        const slot = slotMap.get(application.slot_id);

        if (!slot) {
          return null;
        }

        const restaurant = restaurantMap.get(slot.restaurant_id);
        const shiftMeta = getShiftMeta(slot.time_from, slot.time_to);
        const shiftEnd = parseShiftEnd(slot.work_date, slot.time_from, slot.time_to);
        const isFinished = shiftEnd.getTime() < Date.now();

        let derivedStatus: 'pending' | 'active' | 'finished' | 'rejected' = 'pending';

        if (application.status === 'rejected') {
          derivedStatus = 'rejected';
        } else if (isFinished) {
          derivedStatus = 'finished';
        } else if (application.status === 'approved') {
          derivedStatus = 'active';
        }

        return {
          id: application.id,
          created_at: application.created_at,
          status: application.status,
          derived_status: derivedStatus,
          rejection_reason: application.rejection_reason,
          restaurant_name: restaurant?.name || 'Ресторан',
          city: restaurant?.city || '',
          address: restaurant?.address || '',
          work_date: slot.work_date,
          time_from: slot.time_from,
          time_to: slot.time_to,
          position: slot.position || '',
          hourly_rate: slot.hourly_rate ?? null,
          hours: shiftMeta.hours,
          overnight: shiftMeta.overnight,
          is_finished: isFinished,
          can_cancel: application.status === 'pending' && !isFinished,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      applications: result,
    });
  } catch {
    return NextResponse.json(
      { error: 'Ошибка загрузки моих откликов' },
      { status: 500 }
    );
  }
}