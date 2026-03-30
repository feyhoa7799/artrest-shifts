import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

function getShiftMeta(timeFrom: string, timeTo: string) {
  const fromParts = timeFrom.split(':').map(Number);
  const toParts = timeTo.split(':').map(Number);

  const fromH = fromParts[0] ?? 0;
  const fromM = fromParts[1] ?? 0;
  const toH = toParts[0] ?? 0;
  const toM = toParts[1] ?? 0;

  const from = fromH * 60 + fromM;
  let to = toH * 60 + toM;

  let overnight = false;
  if (to <= from) {
    to += 24 * 60;
    overnight = true;
  }

  const hours = ((to - from) / 60).toFixed(2);

  return {
    hours,
    overnight,
  };
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      return NextResponse.json({ applications: [], stats: null }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json({ applications: [], stats: null }, { status: 401 });
    }

    const user = userData.user;

    const { data: applications, error } = await supabaseAdmin
      .from('applications')
      .select(
        'id, slot_id, status, rejection_reason, created_at, employee_role, employee_email'
      )
      .eq('employee_user_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !applications?.length) {
      return NextResponse.json({
        applications: [],
        stats: {
          totalApproved: 0,
          totalHours: '0.00',
          uniqueRestaurants: 0,
        },
      });
    }

    const slotIds = [...new Set(applications.map((a) => a.slot_id))];

    const { data: slots } = await supabaseAdmin
      .from('slots')
      .select('id, restaurant_id, work_date, time_from, time_to, position')
      .in('id', slotIds);

    const restaurantIds = [...new Set((slots || []).map((s) => s.restaurant_id))];

    const { data: restaurants } = await supabaseAdmin
      .from('restaurants')
      .select('id, name, city')
      .in('id', restaurantIds);

    const slotMap = new Map((slots || []).map((slot) => [slot.id, slot]));
    const restaurantMap = new Map((restaurants || []).map((r) => [r.id, r]));

    const result = applications.map((app) => {
      const slot = slotMap.get(app.slot_id);
      const restaurant = slot ? restaurantMap.get(slot.restaurant_id) : null;
      const shiftMeta =
        slot?.time_from && slot?.time_to
          ? getShiftMeta(slot.time_from, slot.time_to)
          : { hours: '0.00', overnight: false };

      return {
        id: app.id,
        created_at: app.created_at,
        status: app.status || 'pending',
        rejection_reason: app.rejection_reason,
        restaurant_name: restaurant?.name || 'Ресторан не найден',
        city: restaurant?.city || '',
        work_date: slot?.work_date || '',
        time_from: slot?.time_from || '',
        time_to: slot?.time_to || '',
        position: slot?.position || '',
        hours: shiftMeta.hours,
        overnight: shiftMeta.overnight,
      };
    });

    const approved = result.filter((item) => item.status === 'approved');
    const totalHours = approved.reduce((sum, item) => sum + Number(item.hours || 0), 0);
    const uniqueRestaurants = new Set(
      approved.map((item) => item.restaurant_name).filter(Boolean)
    ).size;

    return NextResponse.json({
      applications: result,
      stats: {
        totalApproved: approved.length,
        totalHours: totalHours.toFixed(2),
        uniqueRestaurants,
      },
    });
  } catch {
    return NextResponse.json(
      { applications: [], stats: null },
      { status: 500 }
    );
  }
}