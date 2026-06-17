'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';

import AdminAccessManager from './AdminAccessManager';
import AdminRefreshButton from './AdminRefreshButton';
import { supabase } from '@/lib/supabase';
import {
  formatDateRu,
  formatHours,
  formatShiftTimeRange,
  getShiftEndDate,
  getShiftMeta,
} from '@/lib/shift';

type AdminRole =
  | 'admin'
  | 'superadmin'
  | 'hr_admin'
  | 'territory_admin'
  | 'restaurant_admin';

type CanonicalAdminRole =
  | 'superadmin'
  | 'hr_admin'
  | 'territory_admin'
  | 'restaurant_admin';

type AdminContext = {
  email: string;
  isAdmin: boolean;
  isSuperadmin: boolean;
  isHrAdmin: boolean;
  isGlobalAdmin: boolean;
  canManageAccess: boolean;
  canManageSuperadmins: boolean;
  role: AdminRole;
  canonicalRole: CanonicalAdminRole;
  accessibleRestaurantIds: number[] | null;
};

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

type BootstrapResponse = {
  admin: AdminContext;
  restaurants: Restaurant[];
  slots: Slot[];
  applications: Application[];
  employees: EmployeeProfile[];
};

type InitialSearchParams = {
  tab?: string;
  q?: string;
  restaurant?: string;
  from?: string;
  to?: string;
  edit?: string;
};

type SlotFormState = {
  slot_id: string;
  restaurant_id: string;
  work_date: string;
  time_from: string;
  time_to: string;
  position: string;
  hourly_rate: string;
  comment: string;
  is_hot: boolean;
  needed_count: string;
};

type RestaurantFormState = {
  name: string;
  address: string;
  city: string;
  metro: string;
  lat: string;
  lng: string;
};

type DashboardTab =
  | 'applications'
  | 'open'
  | 'create'
  | 'assigned'
  | 'closed'
  | 'unrealized'
  | 'restaurants'
  | 'employees'
  | 'access';

const emptySlotForm: SlotFormState = {
  slot_id: '',
  restaurant_id: '',
  work_date: '',
  time_from: '',
  time_to: '',
  position: '',
  hourly_rate: '',
  comment: '',
  is_hot: false,
  needed_count: '1',
};

const emptyRestaurantForm: RestaurantFormState = {
  name: '',
  address: '',
  city: '',
  metro: '',
  lat: '',
  lng: '',
};

const EMPTY_RESTAURANTS: Restaurant[] = [];
const EMPTY_SLOTS: Slot[] = [];
const EMPTY_APPLICATIONS: Application[] = [];
const EMPTY_EMPLOYEES: EmployeeProfile[] = [];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function getTodayLocalDate() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function getNowLocalTime() {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || null;
}

async function fetchAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error('Нет авторизации');
  }

  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(data?.error || 'Ошибка запроса');
  }

  return data as T;
}

function roleLabel(role: CanonicalAdminRole) {
  const labels: Record<CanonicalAdminRole, string> = {
    superadmin: 'Суперадмин',
    hr_admin: 'HR-админ',
    territory_admin: 'Территориальный админ',
    restaurant_admin: 'Админ ресторана',
  };

  return labels[role];
}

function getNeededCount(slot: Slot) {
  return Math.max(1, Number(slot.needed_count || 1));
}

function getAcceptedCount(slot: Slot) {
  return Math.max(0, Number(slot.accepted_count || 0));
}

function getRemainingCount(slot: Slot) {
  return Math.max(0, getNeededCount(slot) - getAcceptedCount(slot));
}

function slotStatusLabel(slot: Slot, now = new Date()) {
  if (slot.status === 'closed') return 'Закрыт';
  if (getAcceptedCount(slot) >= getNeededCount(slot) || slot.status === 'assigned') {
    return 'Укомплектован';
  }
  if (isSlotFinished(slot, now)) return 'Прошёл без полного набора';
  return 'Открыт';
}

function applicationStatusLabel(status: Application['status']) {
  if (status === 'approved') return 'Принят';
  if (status === 'rejected') return 'Отклонён';
  return 'Новый';
}

function formatMoney(value: number | null | undefined) {
  if (!value) return '—';
  return `${value} ₽/час`;
}

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

function isSlotFinished(slot: Slot, now = new Date()) {
  const end = getShiftEndDate(slot.work_date, slot.time_from, slot.time_to);

  if (!end) return false;

  return end.getTime() < now.getTime();
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-white p-6 text-sm text-gray-600">
      {children}
    </div>
  );
}

function buildSlotFormFromSlot(slot: Slot): SlotFormState {
  return {
    slot_id: String(slot.id),
    restaurant_id: String(slot.restaurant_id),
    work_date: slot.work_date,
    time_from: slot.time_from.slice(0, 5),
    time_to: slot.time_to.slice(0, 5),
    position: slot.position,
    hourly_rate: slot.hourly_rate ? String(slot.hourly_rate) : '',
    comment: slot.comment || '',
    is_hot: Boolean(slot.is_hot),
    needed_count: String(getNeededCount(slot)),
  };
}

export default function AdminDashboard({
  initialSearchParams,
}: {
  initialSearchParams: InitialSearchParams;
}) {
  const todayStr = getTodayLocalDate();
  const nowTimeStr = getNowLocalTime();

  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [tab, setTab] = useState<DashboardTab>(
    (initialSearchParams.tab as DashboardTab) || 'applications'
  );
  const [q, setQ] = useState(initialSearchParams.q || '');
  const [restaurantFilter, setRestaurantFilter] = useState(
    initialSearchParams.restaurant || ''
  );
  const [from, setFrom] = useState(initialSearchParams.from || '');
  const [to, setTo] = useState(initialSearchParams.to || '');

  const [slotForm, setSlotForm] = useState<SlotFormState>(emptySlotForm);
  const [restaurantForm, setRestaurantForm] =
    useState<RestaurantFormState>(emptyRestaurantForm);
  const [applicationReasons, setApplicationReasons] = useState<Record<number, string>>({});

  async function load() {
    setLoading(true);
    setError('');

    try {
      const nextData = await fetchAdminJson<BootstrapResponse>('/api/admin/bootstrap');

      setData(nextData);

      if (nextData.restaurants.length === 1) {
        setSlotForm((current) => ({
          ...current,
          restaurant_id: current.restaurant_id || String(nextData.restaurants[0].id),
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки админки');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!data) return;

    const editId = Number(initialSearchParams.edit || 0);
    const editSlot = editId
      ? data.slots.find((slot) => slot.id === editId) || null
      : null;

    if (editSlot) {
      setSlotForm(buildSlotFormFromSlot(editSlot));
      setTab('create');
    }
  }, [data, initialSearchParams.edit]);

  const restaurants = data?.restaurants ?? EMPTY_RESTAURANTS;
  const slots = data?.slots ?? EMPTY_SLOTS;
  const applications = data?.applications ?? EMPTY_APPLICATIONS;
  const employees = data?.employees ?? EMPTY_EMPLOYEES;
  const admin = data?.admin || null;

  const restaurantMap = useMemo(() => {
    const map = new Map<number, Restaurant>();
    restaurants.forEach((restaurant) => map.set(restaurant.id, restaurant));
    return map;
  }, [restaurants]);

  const slotMap = useMemo(() => {
    const map = new Map<number, Slot>();
    slots.forEach((slot) => map.set(slot.id, slot));
    return map;
  }, [slots]);

  const applicationsBySlotId = useMemo(() => {
    const map = new Map<number, Application[]>();

    applications.forEach((application) => {
      const items = map.get(application.slot_id) || [];
      items.push(application);
      map.set(application.slot_id, items);
    });

    return map;
  }, [applications]);

  const approvedApplicationsBySlotId = useMemo(() => {
    const map = new Map<number, Application[]>();

    applications
      .filter((application) => application.status === 'approved')
      .forEach((application) => {
        const items = map.get(application.slot_id) || [];
        items.push(application);
        map.set(application.slot_id, items);
      });

    return map;
  }, [applications]);

  const filterByRestaurantAndDate = (slot: Slot) => {
    if (restaurantFilter && String(slot.restaurant_id) !== restaurantFilter) return false;
    if (from && slot.work_date < from) return false;
    if (to && slot.work_date > to) return false;
    return true;
  };

  const now = new Date();
  const filteredSlots = slots.filter(
    (slot) =>
      filterByRestaurantAndDate(slot) &&
      (!q || matchesText(buildSlotSearch(slot, restaurantMap.get(slot.restaurant_id)), q))
  );

  const openSlots = filteredSlots.filter(
    (slot) =>
      slot.status !== 'closed' &&
      getAcceptedCount(slot) < getNeededCount(slot) &&
      !isSlotFinished(slot, now)
  );
  const assignedSlots = filteredSlots.filter(
    (slot) => slot.status === 'assigned' || getAcceptedCount(slot) >= getNeededCount(slot)
  );
  const closedSlots = filteredSlots.filter((slot) => slot.status === 'closed');
  const unrealizedSlots = filteredSlots.filter(
    (slot) =>
      slot.status !== 'closed' &&
      getAcceptedCount(slot) < getNeededCount(slot) &&
      isSlotFinished(slot, now)
  );

  const pendingApplications = applications.filter((application) => {
    const slot = slotMap.get(application.slot_id);

    if (!slot) return false;
    if (application.status && application.status !== 'pending') return false;
    if (!filterByRestaurantAndDate(slot)) return false;

    if (!q) return true;

    return matchesText(
      buildApplicationSearch(application, slot, restaurantMap.get(slot.restaurant_id)),
      q
    );
  });

  const activeRestaurantsCount = restaurants.length;
  const totalPendingApplications = applications.filter(
    (application) => !application.status || application.status === 'pending'
  ).length;

  const tabs = [
    { id: 'applications' as const, label: 'Новые отклики', count: totalPendingApplications },
    { id: 'open' as const, label: 'Активные слоты', count: openSlots.length },
    { id: 'create' as const, label: slotForm.slot_id ? 'Редактировать слот' : 'Создать слот' },
    { id: 'assigned' as const, label: 'Укомплектованные', count: assignedSlots.length },
    { id: 'closed' as const, label: 'Закрытые', count: closedSlots.length },
    { id: 'unrealized' as const, label: 'Прошедшие', count: unrealizedSlots.length },
    ...(admin?.isGlobalAdmin
      ? [
          { id: 'restaurants' as const, label: 'Рестораны', count: restaurants.length },
          { id: 'employees' as const, label: 'Сотрудники', count: employees.length },
        ]
      : []),
    ...(admin?.canManageAccess
      ? [{ id: 'access' as const, label: 'Доступы' }]
      : []),
  ];

  const currentMinTime = slotForm.work_date === todayStr ? nowTimeStr : undefined;
  const shiftMeta = getShiftMeta(slotForm.time_from, slotForm.time_to);

  async function runAdminAction(action: string, payload: Record<string, unknown>) {
    setSaving(true);
    setError('');
    setNotice('');

    try {
      await fetchAdminJson('/api/admin/actions', {
        method: 'POST',
        body: JSON.stringify({
          action,
          ...payload,
        }),
      });

      setNotice('Изменения сохранены');
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить действие');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSlotSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const success = await runAdminAction('saveSlot', slotForm);

    if (success && !slotForm.slot_id) {
      setSlotForm({
        ...emptySlotForm,
        restaurant_id: restaurants.length === 1 ? String(restaurants[0].id) : '',
      });
    }
  }

  async function handleRestaurantSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const success = await runAdminAction('saveRestaurant', restaurantForm);

    if (success) {
      setRestaurantForm(emptyRestaurantForm);
    }
  }

  async function handleApplicationReject(application: Application) {
    const reason = applicationReasons[application.id]?.trim();

    if (!reason) {
      setError('Укажите причину отклонения');
      return;
    }

    const success = await runAdminAction('rejectApplication', {
      application_id: application.id,
      rejection_reason: reason,
    });

    if (success) {
      setApplicationReasons((current) => ({
        ...current,
        [application.id]: '',
      }));
    }
  }

  if (loading) {
    return (
      <main className="bg-[#fafafa] px-6 py-6">
        <div className="mx-auto max-w-7xl rounded-2xl border bg-white p-6 shadow-sm">
          Загрузка админки...
        </div>
      </main>
    );
  }

  if (!admin || !data) {
    return (
      <main className="bg-[#fafafa] px-6 py-6">
        <div className="mx-auto max-w-7xl rounded-2xl border bg-white p-6 shadow-sm">
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error || 'Не удалось загрузить админку'}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-[#fafafa] px-6 py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                Админка подработок
              </h1>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-700">
                <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">
                  {roleLabel(admin.canonicalRole)}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1">
                  {admin.email}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1">
                  Ресторанов в доступе: {activeRestaurantsCount}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <AdminRefreshButton />
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-lg border px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
              >
                Обновить данные
              </button>
              {admin.canManageAccess && (
                <Link
                  href="/admin/telegram"
                  className="rounded-lg border px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Telegram
                </Link>
              )}
            </div>
          </div>

          {!admin.isGlobalAdmin && activeRestaurantsCount === 0 && (
            <div className="mt-5 rounded-xl bg-yellow-50 p-4 text-sm text-yellow-800">
              У вашей роли пока нет назначенных ресторанов. Обратитесь к HR-админу или
              superadmin, чтобы получить доступ к конкретным точкам.
            </div>
          )}
        </section>

        {(notice || error) && (
          <section className="space-y-3">
            {notice && (
              <div className="rounded-xl bg-green-50 p-4 text-sm text-green-700">
                {notice}
              </div>
            )}
            {error && (
              <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Поиск">
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="ФИО, ресторан, должность"
                className="w-full rounded-lg border p-3"
              />
            </Field>

            <Field label="Ресторан">
              <select
                value={restaurantFilter}
                onChange={(event) => setRestaurantFilter(event.target.value)}
                className="w-full rounded-lg border p-3"
              >
                <option value="">Все доступные</option>
                {restaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="С даты">
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="w-full rounded-lg border p-3"
              />
            </Field>

            <Field label="По дату">
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-full rounded-lg border p-3"
              />
            </Field>
          </div>
        </section>

        <nav className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-full px-4 py-2 text-sm ${
                tab === item.id
                  ? 'bg-red-500 text-white'
                  : 'bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50'
              }`}
            >
              {item.label}
              {typeof item.count === 'number' ? ` · ${item.count}` : ''}
            </button>
          ))}
        </nav>

        {tab === 'applications' && (
          <section className="space-y-4">
            <SectionTitle
              title="Новые отклики"
              description="Показываются только отклики по ресторанам, доступным вашей роли."
            />

            {pendingApplications.length === 0 ? (
              <EmptyState>Новых откликов по выбранным фильтрам нет.</EmptyState>
            ) : (
              pendingApplications.map((application) => {
                const slot = slotMap.get(application.slot_id);
                const restaurant = slot ? restaurantMap.get(slot.restaurant_id) : null;

                return (
                  <ApplicationCard
                    key={application.id}
                    application={application}
                    slot={slot}
                    restaurant={restaurant}
                    saving={saving}
                    reason={applicationReasons[application.id] || ''}
                    onReasonChange={(value) =>
                      setApplicationReasons((current) => ({
                        ...current,
                        [application.id]: value,
                      }))
                    }
                    onApprove={() =>
                      runAdminAction('approveApplication', {
                        application_id: application.id,
                      })
                    }
                    onReject={() => handleApplicationReject(application)}
                  />
                );
              })
            )}
          </section>
        )}

        {tab === 'open' && (
          <SlotList
            title="Активные слоты"
            description="Открытые слоты остаются доступными сотрудникам, пока не набрано нужное количество людей."
            slots={openSlots}
            restaurants={restaurantMap}
            applicationsBySlotId={applicationsBySlotId}
            approvedApplicationsBySlotId={approvedApplicationsBySlotId}
            saving={saving}
            onEdit={(slot) => {
              setSlotForm(buildSlotFormFromSlot(slot));
              setTab('create');
            }}
            onClose={(slot) => runAdminAction('closeSlot', { slot_id: slot.id })}
            onReopen={null}
          />
        )}

        {tab === 'create' && (
          <section className="space-y-4">
            <SectionTitle
              title={slotForm.slot_id ? 'Редактировать слот' : 'Создать слот'}
              description="Если ресторан один, он подставляется автоматически. Если ресторанов несколько, доступны только назначенные точки."
            />

            <form
              onSubmit={handleSlotSubmit}
              className="rounded-2xl border bg-white p-6 shadow-sm"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Ресторан">
                  {restaurants.length === 1 ? (
                    <div className="rounded-lg border bg-gray-50 p-3 text-gray-700">
                      {restaurants[0].name}
                    </div>
                  ) : (
                    <select
                      value={slotForm.restaurant_id}
                      onChange={(event) =>
                        setSlotForm((current) => ({
                          ...current,
                          restaurant_id: event.target.value,
                        }))
                      }
                      required
                      className="w-full rounded-lg border p-3"
                    >
                      <option value="">Выберите ресторан</option>
                      {restaurants.map((restaurant) => (
                        <option key={restaurant.id} value={restaurant.id}>
                          {restaurant.name}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>

                <Field label="Должность">
                  <input
                    value={slotForm.position}
                    onChange={(event) =>
                      setSlotForm((current) => ({
                        ...current,
                        position: event.target.value,
                      }))
                    }
                    required
                    className="w-full rounded-lg border p-3"
                  />
                </Field>

                <Field label="Дата">
                  <input
                    type="date"
                    value={slotForm.work_date}
                    min={todayStr}
                    onChange={(event) =>
                      setSlotForm((current) => ({
                        ...current,
                        work_date: event.target.value,
                      }))
                    }
                    required
                    className="w-full rounded-lg border p-3"
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Начало">
                    <input
                      type="time"
                      value={slotForm.time_from}
                      min={currentMinTime}
                      onChange={(event) =>
                        setSlotForm((current) => ({
                          ...current,
                          time_from: event.target.value,
                        }))
                      }
                      required
                      className="w-full rounded-lg border p-3"
                    />
                  </Field>

                  <Field label="Окончание">
                    <input
                      type="time"
                      value={slotForm.time_to}
                      onChange={(event) =>
                        setSlotForm((current) => ({
                          ...current,
                          time_to: event.target.value,
                        }))
                      }
                      required
                      className="w-full rounded-lg border p-3"
                    />
                  </Field>
                </div>

                <Field label="Сколько человек нужно">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={slotForm.needed_count}
                    onChange={(event) =>
                      setSlotForm((current) => ({
                        ...current,
                        needed_count: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border p-3"
                  />
                </Field>

                <Field label="Оплата в час">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={slotForm.hourly_rate}
                    onChange={(event) =>
                      setSlotForm((current) => ({
                        ...current,
                        hourly_rate: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border p-3"
                  />
                </Field>

                <label className="flex items-center gap-3 rounded-lg border p-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={slotForm.is_hot}
                    onChange={(event) =>
                      setSlotForm((current) => ({
                        ...current,
                        is_hot: event.target.checked,
                      }))
                    }
                  />
                  Горячая смена
                </label>
              </div>

              <Field label="Комментарий">
                <textarea
                  value={slotForm.comment}
                  onChange={(event) =>
                    setSlotForm((current) => ({
                      ...current,
                      comment: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full rounded-lg border p-3"
                />
              </Field>

              {slotForm.time_from && slotForm.time_to && (
                <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                  Длительность: {formatHours(shiftMeta.hours)}
                  {shiftMeta.overnight ? ' · смена заканчивается на следующий день' : ''}
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={saving || restaurants.length === 0}
                  className="rounded-lg bg-red-500 px-5 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Сохраняю...' : slotForm.slot_id ? 'Сохранить слот' : 'Создать слот'}
                </button>

                {slotForm.slot_id && (
                  <button
                    type="button"
                    onClick={() =>
                      setSlotForm({
                        ...emptySlotForm,
                        restaurant_id:
                          restaurants.length === 1 ? String(restaurants[0].id) : '',
                      })
                    }
                    className="rounded-lg border px-5 py-3 text-gray-700 hover:bg-gray-50"
                  >
                    Новый слот
                  </button>
                )}
              </div>
            </form>
          </section>
        )}

        {tab === 'assigned' && (
          <SlotList
            title="Укомплектованные слоты"
            description="Слоты, где принято нужное количество сотрудников."
            slots={assignedSlots}
            restaurants={restaurantMap}
            applicationsBySlotId={applicationsBySlotId}
            approvedApplicationsBySlotId={approvedApplicationsBySlotId}
            saving={saving}
            onEdit={null}
            onClose={null}
            onReopen={null}
          />
        )}

        {tab === 'closed' && (
          <SlotList
            title="Закрытые слоты"
            description="Закрытые вручную слоты не показываются сотрудникам."
            slots={closedSlots}
            restaurants={restaurantMap}
            applicationsBySlotId={applicationsBySlotId}
            approvedApplicationsBySlotId={approvedApplicationsBySlotId}
            saving={saving}
            onEdit={null}
            onClose={null}
            onReopen={(slot) => runAdminAction('reopenSlotAsNew', { slot_id: slot.id })}
          />
        )}

        {tab === 'unrealized' && (
          <SlotList
            title="Прошедшие слоты без полного набора"
            description="Эти слоты остались открытыми, но дата и время уже прошли."
            slots={unrealizedSlots}
            restaurants={restaurantMap}
            applicationsBySlotId={applicationsBySlotId}
            approvedApplicationsBySlotId={approvedApplicationsBySlotId}
            saving={saving}
            onEdit={null}
            onClose={(slot) => runAdminAction('closeSlot', { slot_id: slot.id })}
            onReopen={(slot) => runAdminAction('reopenSlotAsNew', { slot_id: slot.id })}
          />
        )}

        {tab === 'restaurants' && admin.isGlobalAdmin && (
          <section className="space-y-4">
            <SectionTitle
              title="Рестораны"
              description="Глобальные роли могут добавлять точки, чтобы затем назначать их ресторанным и территориальным админам."
            />

            <form
              onSubmit={handleRestaurantSubmit}
              className="rounded-2xl border bg-white p-6 shadow-sm"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Название">
                  <input
                    value={restaurantForm.name}
                    onChange={(event) =>
                      setRestaurantForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                    className="w-full rounded-lg border p-3"
                  />
                </Field>

                <Field label="Город">
                  <input
                    value={restaurantForm.city}
                    onChange={(event) =>
                      setRestaurantForm((current) => ({
                        ...current,
                        city: event.target.value,
                      }))
                    }
                    required
                    className="w-full rounded-lg border p-3"
                  />
                </Field>

                <Field label="Адрес">
                  <input
                    value={restaurantForm.address}
                    onChange={(event) =>
                      setRestaurantForm((current) => ({
                        ...current,
                        address: event.target.value,
                      }))
                    }
                    required
                    className="w-full rounded-lg border p-3"
                  />
                </Field>

                <Field label="Метро">
                  <input
                    value={restaurantForm.metro}
                    onChange={(event) =>
                      setRestaurantForm((current) => ({
                        ...current,
                        metro: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border p-3"
                  />
                </Field>

                <Field label="Широта">
                  <input
                    value={restaurantForm.lat}
                    onChange={(event) =>
                      setRestaurantForm((current) => ({
                        ...current,
                        lat: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border p-3"
                  />
                </Field>

                <Field label="Долгота">
                  <input
                    value={restaurantForm.lng}
                    onChange={(event) =>
                      setRestaurantForm((current) => ({
                        ...current,
                        lng: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border p-3"
                  />
                </Field>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="mt-5 rounded-lg bg-red-500 px-5 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Сохраняю...' : 'Добавить ресторан'}
              </button>
            </form>

            <div className="grid gap-3 md:grid-cols-2">
              {restaurants.map((restaurant) => (
                <div key={restaurant.id} className="rounded-xl border bg-white p-4">
                  <div className="font-semibold text-gray-900">{restaurant.name}</div>
                  <div className="mt-1 text-sm text-gray-600">
                    {[restaurant.city, restaurant.address].filter(Boolean).join(' · ')}
                  </div>
                  {restaurant.metro && (
                    <div className="mt-2 text-sm text-gray-500">Метро: {restaurant.metro}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'employees' && admin.isGlobalAdmin && (
          <section className="space-y-4">
            <SectionTitle
              title="Сотрудники"
              description="Этот раздел доступен только глобальным ролям."
            />

            {employees.length === 0 ? (
              <EmptyState>Сотрудников пока нет.</EmptyState>
            ) : (
              <div className="space-y-3">
                {employees.map((employee) => {
                  const homeRestaurant = restaurantMap.get(employee.home_restaurant_id);

                  return (
                    <div
                      key={employee.user_id}
                      className="rounded-2xl border bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="font-semibold text-gray-900">
                            {employee.full_name || employee.email}
                          </div>
                          <div className="mt-1 text-sm text-gray-600">
                            {employee.email} · {employee.phone || 'телефон не указан'}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-700">
                            <span className="rounded-full bg-gray-100 px-2 py-1">
                              {employee.role || 'роль не указана'}
                            </span>
                            <span className="rounded-full bg-gray-100 px-2 py-1">
                              {homeRestaurant?.name || 'домашний ресторан не найден'}
                            </span>
                            <span
                              className={`rounded-full px-2 py-1 ${
                                employee.is_blocked
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {employee.is_blocked ? 'Заблокирован' : 'Активен'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            runAdminAction('toggleEmployeeBlock', {
                              user_id: employee.user_id,
                              next_blocked: !employee.is_blocked,
                            })
                          }
                          className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {employee.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'access' && admin.canManageAccess && <AdminAccessManager />}
      </div>
    </main>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-2 text-sm text-gray-600">{description}</p>}
    </section>
  );
}

function SlotList({
  title,
  description,
  slots,
  restaurants,
  applicationsBySlotId,
  approvedApplicationsBySlotId,
  saving,
  onEdit,
  onClose,
  onReopen,
}: {
  title: string;
  description: string;
  slots: Slot[];
  restaurants: Map<number, Restaurant>;
  applicationsBySlotId: Map<number, Application[]>;
  approvedApplicationsBySlotId: Map<number, Application[]>;
  saving: boolean;
  onEdit: ((slot: Slot) => void) | null;
  onClose: ((slot: Slot) => void) | null;
  onReopen: ((slot: Slot) => void) | null;
}) {
  return (
    <section className="space-y-4">
      <SectionTitle title={title} description={description} />

      {slots.length === 0 ? (
        <EmptyState>По выбранным фильтрам ничего нет.</EmptyState>
      ) : (
        slots.map((slot) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            restaurant={restaurants.get(slot.restaurant_id) || null}
            applications={applicationsBySlotId.get(slot.id) || []}
            approvedApplications={approvedApplicationsBySlotId.get(slot.id) || []}
            saving={saving}
            onEdit={onEdit}
            onClose={onClose}
            onReopen={onReopen}
          />
        ))
      )}
    </section>
  );
}

function SlotCard({
  slot,
  restaurant,
  applications,
  approvedApplications,
  saving,
  onEdit,
  onClose,
  onReopen,
}: {
  slot: Slot;
  restaurant: Restaurant | null;
  applications: Application[];
  approvedApplications: Application[];
  saving: boolean;
  onEdit: ((slot: Slot) => void) | null;
  onClose: ((slot: Slot) => void) | null;
  onReopen: ((slot: Slot) => void) | null;
}) {
  const meta = getShiftMeta(slot.time_from, slot.time_to);
  const pendingCount = applications.filter(
    (application) => !application.status || application.status === 'pending'
  ).length;

  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
              {slotStatusLabel(slot)}
            </span>
            {slot.is_hot && (
              <span className="rounded-full bg-red-100 px-2 py-1 text-red-700">
                Горячая смена
              </span>
            )}
            <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
              Принято {getAcceptedCount(slot)} из {getNeededCount(slot)}
            </span>
            {getRemainingCount(slot) > 0 && (
              <span className="rounded-full bg-yellow-50 px-2 py-1 text-yellow-800">
                Осталось {getRemainingCount(slot)}
              </span>
            )}
            {pendingCount > 0 && (
              <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-700">
                Новых откликов: {pendingCount}
              </span>
            )}
          </div>

          <h3 className="text-lg font-semibold text-gray-900">{slot.position}</h3>
          <div className="mt-1 text-sm text-gray-600">
            {restaurant?.name || 'Ресторан не найден'} · {formatDateRu(slot.work_date)} ·{' '}
            {formatShiftTimeRange(slot.time_from, slot.time_to, meta.overnight)}
          </div>
          <div className="mt-1 text-sm text-gray-600">
            {formatHours(meta.hours)} · {formatMoney(slot.hourly_rate)}
          </div>
          {slot.comment && <div className="mt-3 text-sm text-gray-700">{slot.comment}</div>}

          {approvedApplications.length > 0 && (
            <div className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">
              <div className="mb-1 font-medium">Принятые сотрудники</div>
              <div className="space-y-1">
                {approvedApplications.map((application) => (
                  <div key={application.id}>
                    {application.full_name} · {application.employee_phone || application.contact}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(slot)}
              className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Редактировать
            </button>
          )}
          {onClose && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onClose(slot)}
              className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Закрыть
            </button>
          )}
          {onReopen && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onReopen(slot)}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Повторить как новый
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function ApplicationCard({
  application,
  slot,
  restaurant,
  saving,
  reason,
  onReasonChange,
  onApprove,
  onReject,
}: {
  application: Application;
  slot?: Slot | null;
  restaurant?: Restaurant | null;
  saving: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const meta = slot ? getShiftMeta(slot.time_from, slot.time_to) : null;

  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-700">
              {applicationStatusLabel(application.status)}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
              Отклик #{application.id}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">
              {formatDateTime(application.created_at)}
            </span>
          </div>

          <h3 className="text-lg font-semibold text-gray-900">{application.full_name}</h3>
          <div className="mt-1 text-sm text-gray-600">
            {application.employee_phone || application.contact || 'телефон не указан'}
            {application.employee_email ? ` · ${application.employee_email}` : ''}
          </div>
          <div className="mt-1 text-sm text-gray-600">
            {application.employee_role || 'роль не указана'}
          </div>

          {slot && (
            <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
              <div className="font-medium text-gray-900">
                {restaurant?.name || 'Ресторан не найден'} · {slot.position}
              </div>
              <div className="mt-1">
                {formatDateRu(slot.work_date)} ·{' '}
                {formatShiftTimeRange(slot.time_from, slot.time_to, Boolean(meta?.overnight))}
                {meta ? ` · ${formatHours(meta.hours)}` : ''}
              </div>
              <div className="mt-1">
                Принято {getAcceptedCount(slot)} из {getNeededCount(slot)}, осталось{' '}
                {getRemainingCount(slot)}
              </div>
            </div>
          )}
        </div>

        <div className="w-full max-w-md space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onApprove}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Принять
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onReject}
              className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Отклонить
            </button>
          </div>

          <input
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Причина отклонения"
            className="w-full rounded-lg border p-3 text-sm"
          />
        </div>
      </div>
    </article>
  );
}
