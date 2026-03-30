import { supabaseAdmin } from '@/lib/supabase-admin';
import AdminDashboard from './AdminDashboard';

type SearchParams = Promise<{
  tab?: string;
  q?: string;
  restaurant?: string;
  from?: string;
  to?: string;
  edit?: string;
}>;

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
  hourly_rate: number;
  comment: string | null;
  status: 'open' | 'pending' | 'closed' | 'assigned';
  is_hot: boolean | null;
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

function matchesText(value: string, q: string) {
  return value.toLowerCase().includes(q.toLowerCase());
}

function buildSlotSearch(slot: Slot, restaurant?: Restaurant | null) {
  return [
    slot.position,
    slot.work_date,
    slot.time_from,
    slot.time_to,
    slot.comment || '',
    restaurant?.name || '',
    restaurant?.address || '',
  ].join(' ');
}

function buildApplicationSearch(
  app: Application,
  slot?: Slot | null,
  restaurant?: Restaurant | null
) {
  return [
    app.full_name,
    app.home_restaurant,
    app.contact,
    app.comment || '',
    app.rejection_reason || '',
    app.employee_email || '',
    app.employee_phone || '',
    app.employee_role || '',
    slot?.position || '',
    slot?.work_date || '',
    slot?.time_from || '',
    slot?.time_to || '',
    restaurant?.name || '',
    restaurant?.address || '',
  ].join(' ');
}

function buildEmployeeSearch(
  employee: EmployeeProfile,
  restaurant?: Restaurant | null
) {
  return [
    employee.email,
    employee.full_name,
    employee.phone,
    employee.role,
    restaurant?.name || '',
    restaurant?.address || '',
    restaurant?.city || '',
  ].join(' ');
}

export default async function AdminPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;

  const tab = searchParams.tab || 'open';
  const q = (searchParams.q || '').trim();
  const restaurantFilter = String(searchParams.restaurant || '');
  const from = searchParams.from || '';
  const to = searchParams.to || '';
  const editId = Number(searchParams.edit || 0);

  const { data: restaurantsData } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, address, city, metro')
    .order('name', { ascending: true });

  const { data: slotsData } = await supabaseAdmin
    .from('slots')
    .select('id, restaurant_id, work_date, time_from, time_to, position, hourly_rate, comment, status, is_hot, created_at')
    .order('work_date', { ascending: false });

  const { data: applicationsData } = await supabaseAdmin
    .from('applications')
    .select(
      'id, slot_id, full_name, home_restaurant, contact, comment, created_at, status, rejection_reason, employee_email, employee_phone, employee_role, employee_home_restaurant_id'
    )
    .order('created_at', { ascending: false });

  const { data: employeesData } = await supabaseAdmin
    .from('employee_profiles')
    .select(
      'user_id, email, full_name, phone, role, home_restaurant_id, is_blocked, created_at, updated_at'
    )
    .order('created_at', { ascending: false });

  const restaurants = (restaurantsData || []) as Restaurant[];
  const slots = (slotsData || []) as Slot[];
  const applications = (applicationsData || []) as Application[];
  const employees = (employeesData || []) as EmployeeProfile[];

  const restaurantMap = new Map<number, Restaurant>();
  restaurants.forEach((restaurant) => restaurantMap.set(restaurant.id, restaurant));

  const slotMap = new Map<number, Slot>();
  slots.forEach((slot) => slotMap.set(slot.id, slot));

  const approvedAppBySlotId: Record<number, Application | undefined> = {};
  for (const app of applications) {
    if (app.status === 'approved' && !approvedAppBySlotId[app.slot_id]) {
      approvedAppBySlotId[app.slot_id] = app;
    }
  }

  const filterByRestaurantAndDate = (slot: Slot) => {
    if (restaurantFilter && String(slot.restaurant_id) !== restaurantFilter) return false;
    if (from && slot.work_date < from) return false;
    if (to && slot.work_date > to) return false;
    return true;
  };

  const openSlots = slots.filter(
    (slot) =>
      slot.status === 'open' &&
      filterByRestaurantAndDate(slot) &&
      (!q || matchesText(buildSlotSearch(slot, restaurantMap.get(slot.restaurant_id)), q))
  );

  const closedSlots = slots.filter(
    (slot) =>
      slot.status === 'closed' &&
      filterByRestaurantAndDate(slot) &&
      (!q || matchesText(buildSlotSearch(slot, restaurantMap.get(slot.restaurant_id)), q))
  );

  const assignedSlots = slots.filter(
    (slot) =>
      slot.status === 'assigned' &&
      filterByRestaurantAndDate(slot) &&
      (!q || matchesText(buildSlotSearch(slot, restaurantMap.get(slot.restaurant_id)), q))
  );

  const pendingApplications = applications.filter((app) => {
    const slot = slotMap.get(app.slot_id);
    if (!slot) return false;
    if (app.status && app.status !== 'pending') return false;
    if (!filterByRestaurantAndDate(slot)) return false;
    if (!q) return true;

    return matchesText(
      buildApplicationSearch(app, slot, restaurantMap.get(slot.restaurant_id)),
      q
    );
  });

  const registeredEmployees = employees.filter((employee) => {
    if (restaurantFilter && String(employee.home_restaurant_id) !== restaurantFilter) {
      return false;
    }

    const createdDate = employee.created_at.slice(0, 10);

    if (from && createdDate < from) return false;
    if (to && createdDate > to) return false;

    if (!q) return true;

    return matchesText(
      buildEmployeeSearch(employee, restaurantMap.get(employee.home_restaurant_id)),
      q
    );
  });

  const editSlot = editId ? slots.find((slot) => slot.id === editId) || null : null;

  return (
    <AdminDashboard
      restaurants={restaurants}
      openSlots={openSlots}
      closedSlots={closedSlots}
      assignedSlots={assignedSlots}
      pendingApplications={pendingApplications}
      approvedAppBySlotId={approvedAppBySlotId}
      editSlot={editSlot}
      tab={tab}
      q={q}
      restaurantFilter={restaurantFilter}
      from={from}
      to={to}
      allSlots={slots}
      employees={registeredEmployees}
    />
  );
}