import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getShiftMeta, isShiftFinished } from '@/lib/shift';

type ApplicationRow = {
  id: number;
  slot_id: number;
  status: string | null;
  rejection_reason: string | null;
  created_at: string;
  employee_role: string | null;
  employee_email: string | null;
  employee_user_id?: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      return NextResponse.json(
        {
          applications: [],
          stats: {
            totalApproved: 0,
            totalHours: '0.00',
            uniqueRestaurants: 0,
            totalFinished: 0,
            totalPending: 0,
            totalRejected: 0,
            totalActive: 0,
          },
        },
        { status: 401 }
      );
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json(
        {
          applications: [],
          stats: {
            totalApproved: 0,
            totalHours: '0.00',
            uniqueRestaurants: 0,
            totalFinished: 0,
            totalPending: 0,
            totalRejected: 0,
            totalActive: 0,
          },
        },
        { status: 401 }
      );
    }

    const user = userData.user;
    const userEmail = (user.email || '').trim().toLowerCase();

    let applications: ApplicationRow[] = [];

    const { data: byUserId, error: byUserIdError } = await supabaseAdmin
      .from('applications')
      .select(
        'id, slot_id, status, rejection_reason, created_at, employee_role, employee_email, employee_user_id'
      )
      .eq('employee_user_id', user.id)
      .order('created_at', { ascending: false });

    if (!byUserIdError && byUserId?.length) {
      applications = byUserId as ApplicationRow[];
    } else if (userEmail) {
      const { data: byEmail, error: byEmailError } = await supabaseAdmin
        .from('applications')
        .select(
          'id, slot_id, status, rejection_reason, created_at, employee_role, employee_email, employee_user_id'
        )
        .ilike('employee_email', userEmail)
        .order('created_at', { ascending: false });

      if (!byEmailError && byEmail?.length) {
        applications = byEmail as ApplicationRow[];
      }
    }

    if (!applications.length) {
      return NextResponse.json({
        applications: [],
        stats: {
          totalApproved: 0,
          totalHours: '0.00',
          uniqueRestaurants: 0,
          totalFinished: 0,
          totalPending: 0,
          totalRejected: 0,
          totalActive: 0,
        },
      });
    }

    const uniqueApplications = Array.from(
      new Map(applications.map((item) => [item.id, item])).values()
    );

    const slotIds = [...new Set(uniqueApplications.map((a) => a.slot_id))];

    const { data: slots } = await supabaseAdmin
      .from('slots')
      .select(
        'id, restaurant_id, work_date, time_from, time_to, position, hourly_rate'
      )
      .in('id', slotIds);

    const restaurantIds = [...new Set((slots || []).map((s) => s.restaurant_id))];

    const { data: restaurants } = await supabaseAdmin
      .from('restaurants')
      .select('id, name, city, address')
      .in('id', restaurantIds);

    const slotMap = new Map((slots || []).map((slot) => [slot.id, slot]));
    const restaurantMap = new Map((restaurants || []).map((r) => [r.id, r]));

    const result = uniqueApplications.map((app) => {
      const slot = slotMap.get(app.slot_id);
      const restaurant = slot ? restaurantMap.get(slot.restaurant_id) : null;

      const shiftMeta =
        slot?.time_from && slot?.time_to
          ? getShiftMeta(slot.time_from, slot.time_to)
          : { hours: '0.00', overnight: false };

      const finished =
        slot?.work_date && slot?.time_from && slot?.time_to
          ? isShiftFinished(slot.work_date, slot.time_from, slot.time_to)
          : false;

      const derivedStatus =
        app.status === 'approved'
          ? finished
            ? 'finished'
            : 'active'
          : app.status === 'rejected'
          ? 'rejected'
          : 'pending';

      return {
        id: app.id,
        created_at: app.created_at,
        status: app.status || 'pending',
        derived_status: derivedStatus,
        rejection_reason: app.rejection_reason,
        restaurant_name: restaurant?.name || 'Ресторан не найден',
        city: restaurant?.city || '',
        address: restaurant?.address || '',
        work_date: slot?.work_date || '',
        time_from: slot?.time_from || '',
        time_to: slot?.time_to || '',
        position: slot?.position || '',
        hourly_rate: slot?.hourly_rate ?? null,
        hours: shiftMeta.hours,
        overnight: shiftMeta.overnight,
        is_finished: finished,
      };
    });

    const approved = result.filter((item) => item.status === 'approved');
    const finishedApproved = result.filter((item) => item.derived_status === 'finished');
    const pending = result.filter((item) => item.derived_status === 'pending');
    const rejected = result.filter((item) => item.derived_status === 'rejected');
    const active = result.filter((item) => item.derived_status === 'active');

    const totalHours = finishedApproved.reduce((sum, item) => {
      return sum + Number(item.hours || 0);
    }, 0);

    const uniqueRestaurants = new Set(
      finishedApproved.map((item) => item.restaurant_name).filter(Boolean)
    ).size;

    return NextResponse.json({
      applications: result,
      stats: {
        totalApproved: approved.length,
        totalHours: totalHours.toFixed(2),
        uniqueRestaurants,
        totalFinished: finishedApproved.length,
        totalPending: pending.length,
        totalRejected: rejected.length,
        totalActive: active.length,
      },
    });
  } catch (error) {
    console.error('GET /api/my-applications error:', error);

    return NextResponse.json(
      {
        applications: [],
        stats: {
          totalApproved: 0,
          totalHours: '0.00',
          uniqueRestaurants: 0,
          totalFinished: 0,
          totalPending: 0,
          totalRejected: 0,
          totalActive: 0,
        },
      },
      { status: 500 }
    );
  }
}