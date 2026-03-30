'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  approveApplication,
  closeSlot,
  rejectApplication,
  reopenSlotAsNew,
  saveRestaurant,
  saveSlot,
  toggleEmployeeBlock,
} from './actions';
import AdminRefreshButton from './AdminRefreshButton';
import { getShiftMeta } from '@/lib/shift';

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

type Props = {
  restaurants: Restaurant[];
  openSlots: Slot[];
  closedSlots: Slot[];
  assignedSlots: Slot[];
  pendingApplications: Application[];
  approvedAppBySlotId: Record<number, Application | undefined>;
  editSlot: Slot | null;
  tab: string;
  q: string;
  restaurantFilter: string;
  from: string;
  to: string;
  allSlots: Slot[];
  employees: EmployeeProfile[];
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
  status: string;
};

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
  status: 'open',
};

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
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function pluralRu(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function formatRelative(value: string) {
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 5 * 60 * 1000) return 'Недавно';

  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 60) {
    return `${diffMinutes} ${pluralRu(diffMinutes, 'минуту', 'минуты', 'минут')} назад`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} ${pluralRu(diffHours, 'час', 'часа', 'часов')} назад`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} ${pluralRu(diffDays, 'день', 'дня', 'дней')} назад`;
  }

  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(date);
}

function buildAdminHref(params: {
  tab: string;
  q?: string;
  restaurantFilter?: string;
  from?: string;
  to?: string;
  edit?: string | number | null;
}) {
  const search = new URLSearchParams();

  search.set('tab', params.tab);

  if (params.q) search.set('q', params.q);
  if (params.restaurantFilter) search.set('restaurant', params.restaurantFilter);
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.edit) search.set('edit', String(params.edit));

  return `/admin?${search.toString()}`;
}

function includesText(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

export default function AdminDashboard({
  restaurants,
  openSlots,
  closedSlots,
  assignedSlots,
  pendingApplications,
  approvedAppBySlotId,
  editSlot,
  tab,
  q,
  restaurantFilter,
  from,
  to,
  allSlots,
  employees,
}: Props) {
  const todayStr = getTodayLocalDate();
  const nowTimeStr = getNowLocalTime();

  const [slotForm, setSlotForm] = useState<SlotFormState>(emptySlotForm);

  const [slotQuickSearch, setSlotQuickSearch] = useState('');
  const [slotQuickRestaurant, setSlotQuickRestaurant] = useState('');
  const [slotQuickPosition, setSlotQuickPosition] = useState('');
  const [slotQuickHotOnly, setSlotQuickHotOnly] = useState(false);

  const [applicationQuickSearch, setApplicationQuickSearch] = useState('');
  const [applicationQuickRole, setApplicationQuickRole] = useState('');
  const [applicationQuickRestaurant, setApplicationQuickRestaurant] = useState('');

  const [employeeQuickSearch, setEmployeeQuickSearch] = useState('');
  const [employeeQuickRole, setEmployeeQuickRole] = useState('');
  const [employeeQuickRestaurant, setEmployeeQuickRestaurant] = useState('');
  const [employeeQuickStatus, setEmployeeQuickStatus] = useState<'all' | 'active' | 'blocked'>('all');

  useEffect(() => {
    if (editSlot) {
      setSlotForm({
        slot_id: String(editSlot.id),
        restaurant_id: String(editSlot.restaurant_id),
        work_date: editSlot.work_date,
        time_from: editSlot.time_from.slice(0, 5),
        time_to: editSlot.time_to.slice(0, 5),
        position: editSlot.position,
        hourly_rate: String(editSlot.hourly_rate),
        comment: editSlot.comment || '',
        is_hot: Boolean(editSlot.is_hot),
        status: editSlot.status,
      });
    } else {
      setSlotForm(emptySlotForm);
    }
  }, [editSlot]);

  const shiftMeta = getShiftMeta(slotForm.time_from, slotForm.time_to);
  const currentMinTime = slotForm.work_date === todayStr ? nowTimeStr : undefined;

  const getRestaurantById = (restaurantId?: number | null) => {
    if (!restaurantId) return null;
    return restaurants.find((restaurant) => restaurant.id === restaurantId) || null;
  };

  const restaurantOptions = useMemo(
    () => restaurants.map((restaurant) => ({ value: String(restaurant.id), label: restaurant.name })),
    [restaurants]
  );

  const slotPositionOptions = useMemo(() => {
    const positions = new Set<string>();
    [...openSlots, ...closedSlots, ...assignedSlots].forEach((slot) => {
      if (slot.position) positions.add(slot.position);
    });
    return [...positions].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [openSlots, closedSlots, assignedSlots]);

  const employeeRoleOptions = useMemo(() => {
    const roles = new Set<string>();
    employees.forEach((employee) => {
      if (employee.role) roles.add(employee.role);
    });
    pendingApplications.forEach((app) => {
      if (app.employee_role) roles.add(app.employee_role);
    });
    return [...roles].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [employees, pendingApplications]);

  const filterSlotsForView = (slots: Slot[]) =>
    slots.filter((slot) => {
      const restaurant = getRestaurantById(slot.restaurant_id);

      if (slotQuickRestaurant && String(slot.restaurant_id) !== slotQuickRestaurant) return false;
      if (slotQuickPosition && slot.position !== slotQuickPosition) return false;
      if (slotQuickHotOnly && !slot.is_hot) return false;

      if (!slotQuickSearch.trim()) return true;

      return includesText(
        [
          slot.position,
          slot.work_date,
          slot.time_from,
          slot.time_to,
          slot.comment || '',
          restaurant?.name || '',
          restaurant?.address || '',
          restaurant?.city || '',
          restaurant?.metro || '',
        ].join(' '),
        slotQuickSearch.trim()
      );
    });

  const openSlotsView = useMemo(() => filterSlotsForView(openSlots), [openSlots, slotQuickSearch, slotQuickRestaurant, slotQuickPosition, slotQuickHotOnly]);
  const closedSlotsView = useMemo(() => filterSlotsForView(closedSlots), [closedSlots, slotQuickSearch, slotQuickRestaurant, slotQuickPosition, slotQuickHotOnly]);
  const assignedSlotsView = useMemo(() => filterSlotsForView(assignedSlots), [assignedSlots, slotQuickSearch, slotQuickRestaurant, slotQuickPosition, slotQuickHotOnly]);

  const pendingApplicationsView = useMemo(
    () =>
      pendingApplications.filter((app) => {
        const slot = allSlots.find((item) => item.id === app.slot_id);
        const workRestaurant = getRestaurantById(slot?.restaurant_id);

        if (applicationQuickRole && app.employee_role !== applicationQuickRole) return false;
        if (applicationQuickRestaurant && String(slot?.restaurant_id || '') !== applicationQuickRestaurant) {
          return false;
        }

        if (!applicationQuickSearch.trim()) return true;

        return includesText(
          [
            app.full_name,
            app.home_restaurant,
            app.contact,
            app.comment || '',
            app.employee_email || '',
            app.employee_phone || '',
            app.employee_role || '',
            workRestaurant?.name || '',
            workRestaurant?.address || '',
            slot?.position || '',
            slot?.work_date || '',
          ].join(' '),
          applicationQuickSearch.trim()
        );
      }),
    [pendingApplications, allSlots, applicationQuickRole, applicationQuickRestaurant, applicationQuickSearch]
  );

  const employeesView = useMemo(
    () =>
      employees.filter((employee) => {
        const homeRestaurant = getRestaurantById(employee.home_restaurant_id);

        if (employeeQuickRole && employee.role !== employeeQuickRole) return false;
        if (employeeQuickRestaurant && String(employee.home_restaurant_id) !== employeeQuickRestaurant) {
          return false;
        }
        if (employeeQuickStatus === 'active' && employee.is_blocked) return false;
        if (employeeQuickStatus === 'blocked' && !employee.is_blocked) return false;

        if (!employeeQuickSearch.trim()) return true;

        return includesText(
          [
            employee.email,
            employee.full_name,
            employee.phone,
            employee.role,
            homeRestaurant?.name || '',
            homeRestaurant?.address || '',
            homeRestaurant?.city || '',
          ].join(' '),
          employeeQuickSearch.trim()
        );
      }),
    [employees, employeeQuickRole, employeeQuickRestaurant, employeeQuickStatus, employeeQuickSearch]
  );

  const renderCreated = (createdAt: string) => (
    <p className="mt-2 text-xs text-gray-500">
      Создано: {formatDateTime(createdAt)} • {formatRelative(createdAt)}
    </p>
  );

  const renderSlotCard = (slot: Slot, extraActions?: ReactNode, extraBlock?: ReactNode) => {
    const restaurant = getRestaurantById(slot.restaurant_id);
    const meta = getShiftMeta(slot.time_from, slot.time_to);

    return (
      <div key={slot.id} className="rounded-xl border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{restaurant?.name || 'Ресторан не найден'}</h3>
            <p className="text-sm text-gray-500">{restaurant?.address || ''}</p>
          </div>

          <div className="flex gap-2">
            {slot.is_hot && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
                🔥 Горячая
              </span>
            )}
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
              {slot.status}
            </span>
          </div>
        </div>

        <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
          <p>
            <span className="font-medium">Дата:</span> {slot.work_date}
          </p>
          <p>
            <span className="font-medium">Должность:</span> {slot.position}
          </p>
          <p>
            <span className="font-medium">Время:</span> {slot.time_from} – {slot.time_to}
            {meta.overnight ? ' (следующий день)' : ''}
          </p>
          <p>
            <span className="font-medium">Оплата:</span> {slot.hourly_rate} ₽/час
          </p>
          <p>
            <span className="font-medium">Длительность:</span> {meta.hours ? `${meta.hours} ч` : '—'}
          </p>
          {restaurant?.metro && (
            <p>
              <span className="font-medium">Метро:</span> {restaurant.metro}
            </p>
          )}
        </div>

        {slot.comment && <p className="mt-2 text-sm text-gray-500">{slot.comment}</p>}

        {renderCreated(slot.created_at)}

        {extraBlock}

        {extraActions && <div className="mt-4 flex flex-wrap gap-2">{extraActions}</div>}
      </div>
    );
  };

  const slotFilters = (
    <div className="mb-4 rounded-xl border bg-gray-50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-gray-800">Фильтры внутри вкладки</p>
        <button
          type="button"
          onClick={() => {
            setSlotQuickSearch('');
            setSlotQuickRestaurant('');
            setSlotQuickPosition('');
            setSlotQuickHotOnly(false);
          }}
          className="rounded-lg border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          Сбросить
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FilterField label="Быстрый поиск">
          <input
            value={slotQuickSearch}
            onChange={(e) => setSlotQuickSearch(e.target.value)}
            placeholder="Ресторан, адрес, должность..."
            className="w-full rounded-lg border p-3"
          />
        </FilterField>

        <FilterField label="Ресторан">
          <select
            value={slotQuickRestaurant}
            onChange={(e) => setSlotQuickRestaurant(e.target.value)}
            className="w-full rounded-lg border p-3"
          >
            <option value="">Все</option>
            {restaurantOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Должность">
          <select
            value={slotQuickPosition}
            onChange={(e) => setSlotQuickPosition(e.target.value)}
            className="w-full rounded-lg border p-3"
          >
            <option value="">Все</option>
            {slotPositionOptions.map((position) => (
              <option key={position} value={position}>
                {position}
              </option>
            ))}
          </select>
        </FilterField>

        <div className="flex items-end">
          <label className="flex w-full items-center gap-3 rounded-lg border bg-white p-3 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={slotQuickHotOnly}
              onChange={(e) => setSlotQuickHotOnly(e.target.checked)}
            />
            Только горячие смены
          </label>
        </div>
      </div>
    </div>
  );

  const applicationFilters = (
    <div className="mb-4 rounded-xl border bg-gray-50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-gray-800">Фильтры внутри вкладки</p>
        <button
          type="button"
          onClick={() => {
            setApplicationQuickSearch('');
            setApplicationQuickRole('');
            setApplicationQuickRestaurant('');
          }}
          className="rounded-lg border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          Сбросить
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FilterField label="Быстрый поиск">
          <input
            value={applicationQuickSearch}
            onChange={(e) => setApplicationQuickSearch(e.target.value)}
            placeholder="ФИО, email, телефон, ресторан..."
            className="w-full rounded-lg border p-3"
          />
        </FilterField>

        <FilterField label="Роль сотрудника">
          <select
            value={applicationQuickRole}
            onChange={(e) => setApplicationQuickRole(e.target.value)}
            className="w-full rounded-lg border p-3"
          >
            <option value="">Все</option>
            {employeeRoleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Ресторан подработки">
          <select
            value={applicationQuickRestaurant}
            onChange={(e) => setApplicationQuickRestaurant(e.target.value)}
            className="w-full rounded-lg border p-3"
          >
            <option value="">Все</option>
            {restaurantOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>
      </div>
    </div>
  );

  const employeeFilters = (
    <div className="mb-4 rounded-xl border bg-gray-50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-gray-800">Фильтры внутри вкладки</p>
        <button
          type="button"
          onClick={() => {
            setEmployeeQuickSearch('');
            setEmployeeQuickRole('');
            setEmployeeQuickRestaurant('');
            setEmployeeQuickStatus('all');
          }}
          className="rounded-lg border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          Сбросить
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FilterField label="Быстрый поиск">
          <input
            value={employeeQuickSearch}
            onChange={(e) => setEmployeeQuickSearch(e.target.value)}
            placeholder="ФИО, email, телефон..."
            className="w-full rounded-lg border p-3"
          />
        </FilterField>

        <FilterField label="Статус">
          <select
            value={employeeQuickStatus}
            onChange={(e) => setEmployeeQuickStatus(e.target.value as 'all' | 'active' | 'blocked')}
            className="w-full rounded-lg border p-3"
          >
            <option value="all">Все</option>
            <option value="active">Только активные</option>
            <option value="blocked">Только заблокированные</option>
          </select>
        </FilterField>

        <FilterField label="Должность">
          <select
            value={employeeQuickRole}
            onChange={(e) => setEmployeeQuickRole(e.target.value)}
            className="w-full rounded-lg border p-3"
          >
            <option value="">Все</option>
            {employeeRoleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Домашний ресторан">
          <select
            value={employeeQuickRestaurant}
            onChange={(e) => setEmployeeQuickRestaurant(e.target.value)}
            className="w-full rounded-lg border p-3"
          >
            <option value="">Все</option>
            {restaurantOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterField>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Админка смен</h1>
            <p className="text-gray-600">Управление слотами, откликами, ресторанами и сотрудниками</p>
          </div>

          <AdminRefreshButton />
        </div>

        {pendingApplications.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">
            <span className="font-semibold">NEW!</span> Новые отклики ждут решения: {pendingApplications.length}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Открытые слоты</p>
            <p className="text-2xl font-semibold">{openSlots.length}</p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-gray-500">Отклики</p>
                <p className="text-2xl font-semibold">{pendingApplications.length}</p>
              </div>
              {pendingApplications.length > 0 && (
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                  NEW! {pendingApplications.length}
                </span>
              )}
            </div>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Подтвержденные смены</p>
            <p className="text-2xl font-semibold">{assignedSlots.length}</p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Сотрудники</p>
            <p className="text-2xl font-semibold">{employees.length}</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[430px_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold">
                {editSlot ? 'Редактировать слот' : 'Добавить слот'}
              </h2>

              <form action={saveSlot} className="space-y-4">
                <input type="hidden" name="slot_id" value={slotForm.slot_id} />
                <input type="hidden" name="status" value={slotForm.status} />

                <FilterField label="Ресторан">
                  <select
                    name="restaurant_id"
                    required
                    value={slotForm.restaurant_id}
                    onChange={(e) =>
                      setSlotForm((prev) => ({ ...prev, restaurant_id: e.target.value }))
                    }
                    className="w-full rounded-lg border p-3"
                  >
                    <option value="">Выберите ресторан</option>
                    {restaurants.map((restaurant) => (
                      <option key={restaurant.id} value={restaurant.id}>
                        {restaurant.name} — {restaurant.address}
                      </option>
                    ))}
                  </select>
                </FilterField>

                <FilterField label="Должность">
                  <input
                    type="text"
                    name="position"
                    required
                    value={slotForm.position}
                    onChange={(e) => setSlotForm((prev) => ({ ...prev, position: e.target.value }))}
                    className="w-full rounded-lg border p-3"
                  />
                </FilterField>

                <div className="grid gap-4 md:grid-cols-2">
                  <FilterField label="Дата">
                    <input
                      type="date"
                      name="work_date"
                      min={todayStr}
                      required
                      value={slotForm.work_date}
                      onChange={(e) => setSlotForm((prev) => ({ ...prev, work_date: e.target.value }))}
                      className="w-full rounded-lg border p-3"
                    />
                  </FilterField>

                  <FilterField label="Оплата в час">
                    <input
                      type="number"
                      name="hourly_rate"
                      min="0.01"
                      step="0.01"
                      required
                      value={slotForm.hourly_rate}
                      onChange={(e) => setSlotForm((prev) => ({ ...prev, hourly_rate: e.target.value }))}
                      className="w-full rounded-lg border p-3"
                    />
                  </FilterField>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FilterField label="Время с">
                    <input
                      type="time"
                      name="time_from"
                      min={currentMinTime}
                      required
                      value={slotForm.time_from}
                      onChange={(e) => setSlotForm((prev) => ({ ...prev, time_from: e.target.value }))}
                      className="w-full rounded-lg border p-3"
                    />
                  </FilterField>

                  <FilterField label="Время по">
                    <input
                      type="time"
                      name="time_to"
                      required
                      value={slotForm.time_to}
                      onChange={(e) => setSlotForm((prev) => ({ ...prev, time_to: e.target.value }))}
                      className="w-full rounded-lg border p-3"
                    />
                  </FilterField>
                </div>

                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  {shiftMeta.hours ? (
                    <>
                      Общая длительность смены: <span className="font-semibold">{shiftMeta.hours} ч</span>
                      {shiftMeta.overnight ? ' • переход через полночь' : ''}
                    </>
                  ) : (
                    <>Укажи корректное время, чтобы увидеть длительность смены</>
                  )}
                </div>

                <p className="text-xs text-gray-500">
                  Если смена заканчивается на следующий день, поставь время окончания меньше времени начала.
                  Пример: 23:00 → 10:00.
                </p>

                <FilterField label="Комментарий">
                  <textarea
                    name="comment"
                    rows={4}
                    value={slotForm.comment}
                    onChange={(e) => setSlotForm((prev) => ({ ...prev, comment: e.target.value }))}
                    className="w-full rounded-lg border p-3"
                  />
                </FilterField>

                <label className="flex items-center gap-3 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    name="is_hot"
                    checked={slotForm.is_hot}
                    onChange={(e) => setSlotForm((prev) => ({ ...prev, is_hot: e.target.checked }))}
                  />
                  <span className="font-medium">Горячая смена 🔥</span>
                </label>

                <div className="flex gap-2">
                  <button className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600">
                    {editSlot ? 'Сохранить изменения' : 'Добавить слот'}
                  </button>

                  {editSlot && (
                    <a
                      href={buildAdminHref({ tab, q, restaurantFilter, from, to })}
                      className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      Отменить
                    </a>
                  )}
                </div>
              </form>
            </div>

            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold">Добавить ресторан</h2>

              <form action={saveRestaurant} className="space-y-4">
                <FilterField label="Название">
                  <input name="name" required className="w-full rounded-lg border p-3" />
                </FilterField>

                <FilterField label="Адрес">
                  <input name="address" required className="w-full rounded-lg border p-3" />
                </FilterField>

                <FilterField label="Город">
                  <input name="city" required placeholder="Например: Москва или Казань" className="w-full rounded-lg border p-3" />
                </FilterField>

                <FilterField label="Метро">
                  <input name="metro" placeholder="Необязательно" className="w-full rounded-lg border p-3" />
                </FilterField>

                <div className="grid gap-4 md:grid-cols-2">
                  <FilterField label="Широта">
                    <input name="lat" type="number" step="0.000001" className="w-full rounded-lg border p-3" />
                  </FilterField>

                  <FilterField label="Долгота">
                    <input name="lng" type="number" step="0.000001" className="w-full rounded-lg border p-3" />
                  </FilterField>
                </div>

                <button className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50">
                  Добавить ресторан
                </button>
              </form>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <input type="hidden" name="tab" value={tab} />

                <FilterField label="Поиск">
                  <input
                    type="text"
                    name="q"
                    defaultValue={q}
                    placeholder="Ресторан, сотрудник, телефон, должность..."
                    className="w-full rounded-lg border p-3"
                  />
                </FilterField>

                <FilterField label="Ресторан">
                  <select name="restaurant" defaultValue={restaurantFilter} className="w-full rounded-lg border p-3">
                    <option value="">Все</option>
                    {restaurants.map((restaurant) => (
                      <option key={restaurant.id} value={restaurant.id}>
                        {restaurant.name}
                      </option>
                    ))}
                  </select>
                </FilterField>

                <FilterField label="С даты">
                  <input type="date" name="from" defaultValue={from} className="w-full rounded-lg border p-3" />
                </FilterField>

                <FilterField label="По дату">
                  <input type="date" name="to" defaultValue={to} className="w-full rounded-lg border p-3" />
                </FilterField>

                <div className="flex items-end gap-2 xl:col-span-5">
                  <button className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600">
                    Применить
                  </button>
                  <a href={buildAdminHref({ tab })} className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50">
                    Сбросить
                  </a>
                </div>
              </form>
            </div>

            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                <a
                  href={buildAdminHref({ tab: 'open', q, restaurantFilter, from, to })}
                  className={`rounded-lg px-4 py-2 ${
                    tab === 'open' ? 'bg-red-500 text-white' : 'border text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Открытые слоты
                </a>

                <a
                  href={buildAdminHref({ tab: 'applications', q, restaurantFilter, from, to })}
                  className={`rounded-lg px-4 py-2 ${
                    tab === 'applications' ? 'bg-red-500 text-white' : 'border text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    Отклики
                    {pendingApplications.length > 0 && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tab === 'applications' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'}`}>
                        NEW! {pendingApplications.length}
                      </span>
                    )}
                  </span>
                </a>

                <a
                  href={buildAdminHref({ tab: 'assigned', q, restaurantFilter, from, to })}
                  className={`rounded-lg px-4 py-2 ${
                    tab === 'assigned' ? 'bg-red-500 text-white' : 'border text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Подтвержденные
                </a>

                <a
                  href={buildAdminHref({ tab: 'closed', q, restaurantFilter, from, to })}
                  className={`rounded-lg px-4 py-2 ${
                    tab === 'closed' ? 'bg-red-500 text-white' : 'border text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Закрытые слоты
                </a>

                <a
                  href={buildAdminHref({ tab: 'employees', q, restaurantFilter, from, to })}
                  className={`rounded-lg px-4 py-2 ${
                    tab === 'employees' ? 'bg-red-500 text-white' : 'border text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Сотрудники
                </a>
              </div>
            </div>

            {tab === 'open' && (
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Открытые слоты</h2>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">{openSlotsView.length}</span>
                </div>

                {slotFilters}

                {openSlotsView.length === 0 ? (
                  <p className="text-gray-500">Ничего не найдено</p>
                ) : (
                  <div className="space-y-4">
                    {openSlotsView.map((slot) =>
                      renderSlotCard(
                        slot,
                        <>
                          <a
                            href={buildAdminHref({ tab: 'open', q, restaurantFilter, from, to, edit: slot.id })}
                            className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Редактировать
                          </a>

                          <form action={closeSlot}>
                            <input type="hidden" name="slot_id" value={slot.id} />
                            <button className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                              Закрыть слот
                            </button>
                          </form>
                        </>
                      )
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'applications' && (
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Отклики</h2>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">{pendingApplicationsView.length}</span>
                </div>

                {applicationFilters}

                {pendingApplicationsView.length === 0 ? (
                  <p className="text-gray-500">Ничего не найдено</p>
                ) : (
                  <div className="space-y-4">
                    {pendingApplicationsView.map((app) => {
                      const slot = allSlots.find((s) => s.id === app.slot_id);
                      const restaurant = getRestaurantById(slot?.restaurant_id);
                      const employeeHomeRestaurant = getRestaurantById(app.employee_home_restaurant_id);
                      const meta = slot ? getShiftMeta(slot.time_from, slot.time_to) : { hours: null, overnight: false };

                      return (
                        <div key={app.id} className="rounded-xl border p-4">
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="font-semibold">{app.full_name}</h3>
                              <p className="text-sm text-gray-500">{app.contact}</p>
                            </div>
                            <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
                              NEW!
                            </span>
                          </div>

                          <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                            <p><span className="font-medium">Свой ресторан:</span> {app.home_restaurant}</p>
                            <p><span className="font-medium">Дата отклика:</span> {formatDateTime(app.created_at)}</p>
                            <p><span className="font-medium">Ресторан подработки:</span> {restaurant?.name || 'Не найден'}</p>
                            <p><span className="font-medium">Должность на смене:</span> {slot?.position || '—'}</p>
                            <p><span className="font-medium">Дата смены:</span> {slot?.work_date || '—'}</p>
                            <p><span className="font-medium">Часы:</span> {meta.hours ? `${meta.hours} ч${meta.overnight ? ' • через полночь' : ''}` : '—'}</p>
                            <p><span className="font-medium">Email сотрудника:</span> {app.employee_email || '—'}</p>
                            <p><span className="font-medium">Телефон сотрудника:</span> {app.employee_phone || app.contact || '—'}</p>
                            <p><span className="font-medium">Роль сотрудника:</span> {app.employee_role || '—'}</p>
                            <p><span className="font-medium">Домашний ресторан:</span> {employeeHomeRestaurant?.name || app.home_restaurant || '—'}</p>
                          </div>

                          {app.comment && <p className="mt-2 text-sm text-gray-500">{app.comment}</p>}

                          <p className="mt-2 text-xs text-gray-500">
                            Получен: {formatDateTime(app.created_at)} • {formatRelative(app.created_at)}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <form action={approveApplication} className="flex gap-2">
                              <input type="hidden" name="application_id" value={app.id} />
                              <input type="hidden" name="slot_id" value={app.slot_id} />
                              <button className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600">
                                Подтвердить
                              </button>
                            </form>

                            <form action={rejectApplication} className="flex flex-wrap gap-2">
                              <input type="hidden" name="application_id" value={app.id} />
                              <input type="hidden" name="slot_id" value={app.slot_id} />
                              <input
                                type="text"
                                name="rejection_reason"
                                required
                                placeholder="Причина отклонения"
                                className="rounded-lg border px-3 py-2 text-sm"
                              />
                              <button className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                Отклонить
                              </button>
                            </form>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === 'assigned' && (
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Подтвержденные смены</h2>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">{assignedSlotsView.length}</span>
                </div>

                {slotFilters}

                {assignedSlotsView.length === 0 ? (
                  <p className="text-gray-500">Ничего не найдено</p>
                ) : (
                  <div className="space-y-4">
                    {assignedSlotsView.map((slot) => {
                      const approvedApp = approvedAppBySlotId[slot.id];
                      const approvedHomeRestaurant = getRestaurantById(approvedApp?.employee_home_restaurant_id || null);

                      return renderSlotCard(
                        slot,
                        undefined,
                        <div className="mt-4 rounded-lg bg-gray-50 p-4">
                          <p className="mb-2 text-sm font-semibold text-gray-700">Назначенный сотрудник</p>
                          {approvedApp ? (
                            <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                              <p><span className="font-medium">ФИО:</span> {approvedApp.full_name}</p>
                              <p><span className="font-medium">Контакт:</span> {approvedApp.contact}</p>
                              <p><span className="font-medium">Email:</span> {approvedApp.employee_email || '—'}</p>
                              <p><span className="font-medium">Роль:</span> {approvedApp.employee_role || '—'}</p>
                              <p><span className="font-medium">Свой ресторан:</span> {approvedHomeRestaurant?.name || approvedApp.home_restaurant}</p>
                              <p><span className="font-medium">Отклик:</span> {formatDateTime(approvedApp.created_at)}</p>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">Данные сотрудника не найдены</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === 'closed' && (
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Закрытые слоты</h2>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">{closedSlotsView.length}</span>
                </div>

                {slotFilters}

                {closedSlotsView.length === 0 ? (
                  <p className="text-gray-500">Ничего не найдено</p>
                ) : (
                  <div className="space-y-4">
                    {closedSlotsView.map((slot) =>
                      renderSlotCard(
                        slot,
                        <>
                          <a
                            href={buildAdminHref({ tab: 'closed', q, restaurantFilter, from, to, edit: slot.id })}
                            className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            Редактировать
                          </a>

                          <form action={reopenSlotAsNew}>
                            <input type="hidden" name="slot_id" value={slot.id} />
                            <button className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                              Возобновить как новую
                            </button>
                          </form>
                        </>
                      )
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'employees' && (
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Зарегистрированные сотрудники</h2>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">{employeesView.length}</span>
                </div>

                {employeeFilters}

                {employeesView.length === 0 ? (
                  <p className="text-gray-500">Сотрудники пока не найдены</p>
                ) : (
                  <div className="space-y-4">
                    {employeesView.map((employee) => {
                      const homeRestaurant = getRestaurantById(employee.home_restaurant_id);

                      return (
                        <div key={employee.user_id} className="rounded-xl border p-4">
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="font-semibold">{employee.full_name || 'Без ФИО'}</h3>
                              <p className="text-sm text-gray-500">{employee.email || 'Email не указан'}</p>
                            </div>

                            <span className={`rounded-full px-3 py-1 text-sm font-medium ${employee.is_blocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {employee.is_blocked ? 'Заблокирован' : 'Активен'}
                            </span>
                          </div>

                          <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                            <p><span className="font-medium">Телефон:</span> {employee.phone || '—'}</p>
                            <p><span className="font-medium">Должность:</span> {employee.role || '—'}</p>
                            <p><span className="font-medium">Домашний ресторан:</span> {homeRestaurant?.name || '—'}</p>
                            <p><span className="font-medium">Город:</span> {homeRestaurant?.city || '—'}</p>
                            <p><span className="font-medium">Регистрация:</span> {formatDateTime(employee.created_at)}</p>
                            <p><span className="font-medium">Обновлен:</span> {formatDateTime(employee.updated_at)}</p>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <form action={toggleEmployeeBlock}>
                              <input type="hidden" name="user_id" value={employee.user_id} />
                              <input type="hidden" name="next_blocked" value={employee.is_blocked ? 'false' : 'true'} />
                              <button className={`rounded-lg px-4 py-2 text-sm text-white ${employee.is_blocked ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'}`}>
                                {employee.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                              </button>
                            </form>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
