import { supabase } from '@/lib/supabase';
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
    slot?.position || '',
    slot?.work_date || '',
    slot?.time_from || '',
    slot?.time_to || '',
    restaurant?.name || '',
    restaurant?.address || '',
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

  const { data: restaurantsData } = await supabase
    .from('restaurants')
    .select('id, name, address, city, metro')
    .order('name', { ascending: true });

  const { data: slotsData } = await supabase
    .from('slots')
    .select(
      'id, restaurant_id, work_date, time_from, time_to, position, hourly_rate, comment, status, is_hot, created_at'
    )
    .order('work_date', { ascending: false });

  const { data: applicationsData } = await supabase
    .from('applications')
    .select(
      'id, slot_id, full_name, home_restaurant, contact, comment, created_at, status, rejection_reason'
    )
    .order('created_at', { ascending: false });

  const restaurants = (restaurantsData || []) as Restaurant[];
  const slots = (slotsData || []) as Slot[];
  const applications = (applicationsData || []) as Application[];

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
    />
  );
}