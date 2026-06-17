import { NextRequest, NextResponse } from 'next/server';

import { getAdminAccessByEmail } from '@/lib/admin-access';
import { getEmployeeApplicationStatus } from '@/lib/application-status';
import { getShiftMeta } from '@/lib/shift';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  home_restaurant_id: number | null;
  is_blocked: boolean | null;
};

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

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 8,
};

function clearSessionCookies(res: NextResponse) {
  res.cookies.set('app_auth', '', { path: '/', maxAge: 0 });
  res.cookies.set('app_profile', '', { path: '/', maxAge: 0 });
  res.cookies.set('app_admin', '', { path: '/', maxAge: 0 });
  res.cookies.set('app_superadmin', '', { path: '/', maxAge: 0 });
  return res;
}

function normalizeFullName(value: string | null | undefined) {
  return String(value || '')
    .replace(/[^А-Яа-яЁё\s-]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim();
}

function isValidCyrillicFullName(value: string | null | undefined) {
  const normalized = normalizeFullName(value);

  if (!normalized) return false;
  if (normalized.length < 5) return false;

  if (!/^[А-Яа-яЁё]+(?:[\s-][А-Яа-яЁё]+)*$/.test(normalized)) {
    return false;
  }

  return normalized.split(/\s+/).filter(Boolean).length >= 2;
}

function isProfileComplete(profile: ProfileRow | null) {
  if (!profile) return false;

  return Boolean(
    isValidCyrillicFullName(profile.full_name) &&
      profile.phone &&
      /^\+7\d{10}$/.test(profile.phone) &&
      profile.role &&
      profile.home_restaurant_id
  );
}

function getFirstName(profile: ProfileRow | null, email: string) {
  const normalized = normalizeFullName(profile?.full_name);
  const parts = normalized.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) return parts[1];
  if (parts.length === 1) return parts[0];

  return email || 'коллега';
}


async function loadUpcomingApprovedApplications(userId: string) {
  const { data: applicationsData, error: applicationsError } = await supabaseAdmin
    .from('applications')
    .select('id, slot_id, created_at, status, rejection_reason, employee_user_id')
    .eq('employee_user_id', userId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(30);

  if (applicationsError) {
    console.error('[home/bootstrap] applications error:', applicationsError);
    return [];
  }

  const applications = (applicationsData || []) as ApplicationRow[];

  if (!applications.length) return [];

  const slotIds = Array.from(new Set(applications.map((item) => item.slot_id)));

  const { data: slotsData, error: slotsError } = await supabaseAdmin
    .from('slots')
    .select('id, restaurant_id, work_date, time_from, time_to, position, hourly_rate, status')
    .in('id', slotIds);

  if (slotsError) {
    console.error('[home/bootstrap] slots error:', slotsError);
    return [];
  }

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

  return applications
    .map((application) => {
      const slot = slotMap.get(application.slot_id);

      if (!slot) return null;

      const restaurant = restaurantMap.get(slot.restaurant_id);
      const shiftMeta = getShiftMeta(slot.time_from, slot.time_to);
      const status = getEmployeeApplicationStatus({
        applicationStatus: application.status,
        slotStatus: slot.status,
        workDate: slot.work_date,
        timeFrom: slot.time_from,
        timeTo: slot.time_to,
      });

      if (!status.isActiveApproved) return null;

      return {
        id: application.id,
        created_at: application.created_at,
        status: application.status,
        derived_status: status.derivedStatus,
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
        is_finished: status.isFinished,
        can_cancel: false,
        sort_key: status.shiftStart?.getTime() ?? Date.parse(application.created_at),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (!a || !b) return 0;
      return a.sort_key - b.sort_key;
    })
    .slice(0, 5)
    .map((item) => {
      if (!item) return item;

      return {
        id: item.id,
        created_at: item.created_at,
        status: item.status,
        derived_status: item.derived_status,
        rejection_reason: item.rejection_reason,
        restaurant_name: item.restaurant_name,
        city: item.city,
        address: item.address,
        work_date: item.work_date,
        time_from: item.time_from,
        time_to: item.time_to,
        position: item.position,
        hourly_rate: item.hourly_rate,
        hours: item.hours,
        overnight: item.overnight,
        is_finished: item.is_finished,
        can_cancel: item.can_cancel,
      };
    });
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      return clearSessionCookies(
        NextResponse.json({ error: 'Нет авторизации' }, { status: 401 })
      );
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      return clearSessionCookies(
        NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 })
      );
    }

    const user = userData.user;
    const email = user.email || '';

    const [{ data: profileData }, adminAccess] = await Promise.all([
      supabaseAdmin
        .from('employee_profiles')
        .select('user_id, email, full_name, phone, role, home_restaurant_id, is_blocked')
        .eq('user_id', user.id)
        .maybeSingle(),
      getAdminAccessByEmail(email),
    ]);

    const profile = (profileData || null) as ProfileRow | null;
    const profileComplete = isProfileComplete(profile);
    const isBlocked = Boolean(profile?.is_blocked);

    const upcomingApprovedApplications =
      profileComplete && !isBlocked
        ? await loadUpcomingApprovedApplications(user.id)
        : [];

    const res = NextResponse.json({
      user: {
        id: user.id,
        email,
      },
      profile: {
        exists: Boolean(profile),
        isComplete: profileComplete,
        isBlocked,
        firstName: getFirstName(profile, email),
        full_name: profile?.full_name || '',
        phone: profile?.phone || '',
        role: profile?.role || '',
        home_restaurant_id: profile?.home_restaurant_id || null,
      },
      admin: {
        isAdmin: adminAccess.isAdmin,
        isSuperadmin: adminAccess.isSuperadmin,
      },
      upcomingApprovedApplications,
      meta: {
        tookMs: Date.now() - startedAt,
      },
    });

    res.cookies.set('app_auth', '1', cookieOptions);
    res.cookies.set('app_profile', profileComplete ? '1' : '0', cookieOptions);
    res.cookies.set('app_admin', adminAccess.isAdmin ? '1' : '0', cookieOptions);
    res.cookies.set('app_superadmin', adminAccess.isSuperadmin ? '1' : '0', cookieOptions);

    return res;
  } catch (error) {
    console.error('[home/bootstrap] error:', error);

    return NextResponse.json(
      { error: 'Ошибка загрузки главной страницы' },
      { status: 500 }
    );
  }
}
