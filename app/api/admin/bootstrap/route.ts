import { NextRequest, NextResponse } from 'next/server';

import { getCurrentAdminContext, jsonError } from '@/lib/admin-api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

type Restaurant = {
  id: number;
  name: string;
  address: string;
  city: string;
  metro: string | null;
};

type Slot = {
  id: number;
  restaurant_id: number;
  work_date: string;
  time_from: string;
  time_to: string;
  position: string;
  hourly_rate: number | null;
  comment: string | null;
  status: 'open' | 'pending' | 'closed' | 'assigned';
  is_hot: boolean | null;
  needed_count: number | null;
  accepted_count: number | null;
  created_at: string;
};

type Application = {
  id: number;
  slot_id: number;
  full_name: string;
  home_restaurant: string;
  contact: string;
  comment: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected' | null;
  rejection_reason: string | null;
  employee_email: string | null;
  employee_phone: string | null;
  employee_role: string | null;
  employee_home_restaurant_id: number | null;
};

type EmployeeProfile = {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  role: string;
  home_restaurant_id: number;
  is_blocked: boolean;
  created_at: string;
  updated_at: string;
};

export async function GET(req: NextRequest) {
  try {
    const context = await getCurrentAdminContext(req);
    const scopedRestaurantIds = context.accessibleRestaurantIds;

    if (Array.isArray(scopedRestaurantIds) && scopedRestaurantIds.length === 0) {
      return NextResponse.json({
        admin: context,
        restaurants: [],
        slots: [],
        applications: [],
        employees: [],
      });
    }

    let restaurantsQuery = supabaseAdmin
      .from('restaurants')
      .select('id, name, address, city, metro')
      .order('name', { ascending: true });

    if (Array.isArray(scopedRestaurantIds)) {
      restaurantsQuery = restaurantsQuery.in('id', scopedRestaurantIds);
    }

    const { data: restaurantsData, error: restaurantsError } = await restaurantsQuery;

    if (restaurantsError) {
      throw new Error(restaurantsError.message);
    }

    const restaurants = (restaurantsData || []) as Restaurant[];
    const allowedRestaurantIds = restaurants.map((restaurant) => restaurant.id);

    let slots: Slot[] = [];
    let applications: Application[] = [];
    let employees: EmployeeProfile[] = [];

    if (allowedRestaurantIds.length > 0 || scopedRestaurantIds === null) {
      let slotsQuery = supabaseAdmin
        .from('slots')
        .select(
          'id, restaurant_id, work_date, time_from, time_to, position, hourly_rate, comment, status, is_hot, needed_count, accepted_count, created_at'
        )
        .order('work_date', { ascending: false });

      if (Array.isArray(scopedRestaurantIds)) {
        slotsQuery = slotsQuery.in('restaurant_id', allowedRestaurantIds);
      }

      const { data: slotsData, error: slotsError } = await slotsQuery;

      if (slotsError) {
        throw new Error(slotsError.message);
      }

      slots = (slotsData || []) as Slot[];

      const slotIds = slots.map((slot) => slot.id);

      if (slotIds.length > 0) {
        const { data: applicationsData, error: applicationsError } = await supabaseAdmin
          .from('applications')
          .select(
            'id, slot_id, full_name, home_restaurant, contact, comment, created_at, status, rejection_reason, employee_email, employee_phone, employee_role, employee_home_restaurant_id'
          )
          .in('slot_id', slotIds)
          .order('created_at', { ascending: false });

        if (applicationsError) {
          throw new Error(applicationsError.message);
        }

        applications = (applicationsData || []) as Application[];
      }
    }

    if (context.isGlobalAdmin) {
      const { data: employeesData, error: employeesError } = await supabaseAdmin
        .from('employee_profiles')
        .select(
          'user_id, email, full_name, phone, role, home_restaurant_id, is_blocked, created_at, updated_at'
        )
        .order('created_at', { ascending: false });

      if (employeesError) {
        throw new Error(employeesError.message);
      }

      employees = (employeesData || []) as EmployeeProfile[];
    }

    return NextResponse.json({
      admin: context,
      restaurants,
      slots,
      applications,
      employees,
    });
  } catch (error) {
    return jsonError(error, 'Ошибка загрузки админки');
  }
}
