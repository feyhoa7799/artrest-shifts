'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
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
import {
  formatDateRu,
  formatHours,
  formatShiftTimeRange,
  getShiftMeta,
} from '@/lib/shift';

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
  approvedAppBySlotId: Record<number, Application>;
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
  const [employeeQuickStatus, setEmployeeQuickStatus] = useState<'all' | 'active' | 'blocked'>(
    'all'
  );

  useEffect(() => {
    if (editSlot) {
      setSlotForm({
        slot_id: String(editSlot.id),
        restaurant_id: String(editSlot.restaurant_id),
        work_date: editSlot.work_date,
        time_from: editSlot.time_from.slice(0, 5),
        time_to: editSlot.time_to.slice(0, 5),
        position: editSlot.position,
        hourly_rate: editSlot.hourly_rate ? String(editSlot.hourly_rate) : '',
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

  const openSlotsView = useMemo(
    () => filterSlotsForView(openSlots),
    [openSlots, slotQuickSearch, slotQuickRestaurant, slotQuickPosition, slotQuickHotOnly]
  );

  const closedSlotsView = useMemo(
    () => filterSlotsForView(closedSlots),
    [closedSlots, slotQuickSearch, slotQuickRestaurant, slotQuickPosition, slotQuickHotOnly]
  );

  const assignedSlotsView = useMemo(
    () => filterSlotsForView(assignedSlots),
    [assignedSlots, slotQuickSearch, slotQuickRestaurant, slotQuickPosition, slotQuickHotOnly]
  );

  const pendingApplicationsView = useMemo(
    () =>
      pendingApplications.filter((app) => {
        const slot = allSlots.find((item) => item.id === app.slot_id);
        const workRestaurant = getRestaurantById(slot?.restaurant_id);

        if (applicationQuickRole && app.employee_role !== applicationQuickRole) return false;
        if (
          applicationQuickRestaurant &&
          String(slot?.restaurant_id || '') !== applicationQuickRestaurant
        ) {
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

        if (
          employeeQuickRestaurant &&
          String(employee.home_restaurant_id) !== employeeQuickRestaurant
        ) {
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
    <p className="mt-2 text-xs text-gray-500">Создано: {formatDateTime(createdAt)}</p>
  );

  const renderSlotCard = (slot: Slot, extraActions?: ReactNode, extraBlock?: ReactNode) => {
    const restaurant = getRestaurantById(slot.restaurant_id);
    const meta = getShiftMeta(slot.time_from, slot.time_to);

    return (
      <div key={slot.id} className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              {restaurant?.name || 'Ресторан не найден'}
            </h3>
            <p className="text-sm text-gray-600">{restaurant?.address || ''}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {slot.is_hot && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
                Горячая
              </span>
            )}

            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
              {slot.status}
            </span>
          </div>
        </div>

        <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
          <p>Дата: {formatDateRu(slot.work_date)}</p>
          <p>Должность: {slot.position}</p>
          <p>Время: {formatShiftTimeRange(slot.time_from, slot.time_to, meta.overnight)}</p>
          <p>Длительность: {formatHours(meta.hours)}</p>
          <p>
            Оплата:{' '}
            {slot.hourly_rate ? `${slot.hourly_rate} ₽/час` : 'Не указана'}
          </p>
          {restaurant?.metro && <p>Метро: {restaurant.metro}</p>}
        </div>

        {slot.comment && (
          <div className="mt-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            {slot.comment}
          </div>
        )}

        {renderCreated(slot.created_at)}
        {extraBlock}

        {extraActions && <div className="mt-4 flex flex-wrap gap-2">{extraActions}</div>}
      </div>
    );
  };

  const slotFilters = (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold">Фильтры внутри вкладки</h3>
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

      <div className="grid gap-3 md:grid-cols-4">
        <FilterField label="Поиск">
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

        <FilterField label=" ">
          <label className="flex h-full items-center gap-2 rounded-lg border p-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={slotQuickHotOnly}
              onChange={(e) => setSlotQuickHotOnly(e.target.checked)}
            />
            Только горячие смены
          </label>
        </FilterField>
      </div>
    </div>
  );

  const applicationFilters = (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold">Фильтры внутри вкладки</h3>
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

      <div className="grid gap-3 md:grid-cols-3">
        <FilterField label="Поиск">
          <input
            value={applicationQuickSearch}
            onChange={(e) => setApplicationQuickSearch(e.target.value)}
            placeholder="ФИО, email, телефон, ресторан..."
            className="w-full rounded-lg border p-3"
          />
        </FilterField>

        <FilterField label="Роль">
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

        <FilterField label="Ресторан">
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
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold">Фильтры внутри вкладки</h3>
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

      <div className="grid gap-3 md:grid-cols-4">
        <FilterField label="Поиск">
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
            onChange={(e) =>
              setEmployeeQuickStatus(e.target.value as 'all' | 'active' | 'blocked')
            }
            className="w-full rounded-lg border p-3"
          >
            <option value="all">Все</option>
            <option value="active">Только активные</option>
            <option value="blocked">Только заблокированные</option>
          </select>
        </FilterField>

        <FilterField label="Роль">
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

        <FilterField label="Ресторан">
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

  const currentSlotsView =
    tab === 'closed'
      ? closedSlotsView
      : tab === 'assigned'
      ? assignedSlotsView
      : openSlotsView;

  return (
    <main className="min-h-screen bg-[#fafafa] p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Админка смен</h1>
            <p className="mt-2 text-gray-600">
              Управление слотами, откликами, ресторанами и сотрудниками
            </p>
          </div>

          <AdminRefreshButton />
        </div>

        {pendingApplications.length > 0 && (
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-yellow-800">
            Новые отклики ждут решения: {pendingApplications.length}
          </div>
        )}

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <form className="grid gap-4 md:grid-cols-5">
            <input type="hidden" name="tab" value={tab} />

            <FilterField label="Общий поиск">
              <input
                name="q"
                defaultValue={q}
                placeholder="Ресторан, сотрудник, слот..."
                className="w-full rounded-lg border p-3"
              />
            </FilterField>

            <FilterField label="Ресторан">
              <select
                name="restaurant"
                defaultValue={restaurantFilter}
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

            <FilterField label="От">
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="w-full rounded-lg border p-3"
              />
            </FilterField>

            <FilterField label="До">
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="w-full rounded-lg border p-3"
              />
            </FilterField>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600"
              >
                Применить
              </button>

              <Link
                href={`/admin?tab=${tab}`}
                className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50"
              >
                Сбросить
              </Link>
            </div>
          </form>
        </div>

        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-6">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold">
                {slotForm.slot_id ? 'Редактировать слот' : 'Новый слот'}
              </h2>

              <form action={saveSlot} className="space-y-4">
                <input type="hidden" name="slot_id" value={slotForm.slot_id} />

                <FilterField label="Ресторан">
                  <select
                    name="restaurant_id"
                    value={slotForm.restaurant_id}
                    onChange={(e) =>
                      setSlotForm((prev) => ({ ...prev, restaurant_id: e.target.value }))
                    }
                    className="w-full rounded-lg border p-3"
                  >
                    <option value="">Выберите ресторан</option>
                    {restaurantOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </FilterField>

                <div className="grid gap-4 md:grid-cols-2">
                  <FilterField label="Дата">
                    <input
                      type="date"
                      name="work_date"
                      value={slotForm.work_date}
                      min={todayStr}
                      onChange={(e) =>
                        setSlotForm((prev) => ({ ...prev, work_date: e.target.value }))
                      }
                      className="w-full rounded-lg border p-3"
                    />
                  </FilterField>

                  <FilterField label="Должность">
                    <input
                      name="position"
                      value={slotForm.position}
                      onChange={(e) =>
                        setSlotForm((prev) => ({ ...prev, position: e.target.value }))
                      }
                      className="w-full rounded-lg border p-3"
                    />
                  </FilterField>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FilterField label="Начало">
                    <input
                      type="time"
                      name="time_from"
                      value={slotForm.time_from}
                      min={currentMinTime}
                      onChange={(e) =>
                        setSlotForm((prev) => ({ ...prev, time_from: e.target.value }))
                      }
                      className="w-full rounded-lg border p-3"
                    />
                  </FilterField>

                  <FilterField label="Окончание">
                    <input
                      type="time"
                      name="time_to"
                      value={slotForm.time_to}
                      onChange={(e) =>
                        setSlotForm((prev) => ({ ...prev, time_to: e.target.value }))
                      }
                      className="w-full rounded-lg border p-3"
                    />
                  </FilterField>
                </div>

                <FilterField label="Оплата в час, ₽ (необязательно)">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    name="hourly_rate"
                    value={slotForm.hourly_rate}
                    onChange={(e) =>
                      setSlotForm((prev) => ({ ...prev, hourly_rate: e.target.value }))
                    }
                    placeholder="Можно оставить пустым"
                    className="w-full rounded-lg border p-3"
                  />
                </FilterField>

                <FilterField label="Комментарий">
                  <textarea
                    name="comment"
                    value={slotForm.comment}
                    onChange={(e) =>
                      setSlotForm((prev) => ({ ...prev, comment: e.target.value }))
                    }
                    rows={4}
                    className="w-full rounded-lg border p-3"
                  />
                </FilterField>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-lg border p-3 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      name="is_hot"
                      checked={slotForm.is_hot}
                      onChange={(e) =>
                        setSlotForm((prev) => ({ ...prev, is_hot: e.target.checked }))
                      }
                    />
                    Горячая смена
                  </label>

                  <FilterField label="Статус">
                    <select
                      name="status"
                      value={slotForm.status}
                      onChange={(e) =>
                        setSlotForm((prev) => ({ ...prev, status: e.target.value }))
                      }
                      className="w-full rounded-lg border p-3"
                    >
                      <option value="open">open</option>
                      <option value="closed">closed</option>
                      <option value="assigned">assigned</option>
                    </select>
                  </FilterField>
                </div>

                {(slotForm.time_from || slotForm.time_to) && (
                  <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                    Длительность смены: {formatHours(shiftMeta.hours)}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600"
                  >
                    {slotForm.slot_id ? 'Сохранить изменения' : 'Создать слот'}
                  </button>

                  <Link
                    href="/admin"
                    className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50"
                  >
                    Сбросить форму
                  </Link>
                </div>
              </form>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold">Новый ресторан</h2>

              <form action={saveRestaurant} className="space-y-4">
                <FilterField label="Название">
                  <input name="name" className="w-full rounded-lg border p-3" />
                </FilterField>

                <FilterField label="Адрес">
                  <input name="address" className="w-full rounded-lg border p-3" />
                </FilterField>

                <div className="grid gap-4 md:grid-cols-2">
                  <FilterField label="Город">
                    <input name="city" className="w-full rounded-lg border p-3" />
                  </FilterField>

                  <FilterField label="Метро">
                    <input name="metro" className="w-full rounded-lg border p-3" />
                  </FilterField>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FilterField label="Широта">
                    <input name="lat" className="w-full rounded-lg border p-3" />
                  </FilterField>

                  <FilterField label="Долгота">
                    <input name="lng" className="w-full rounded-lg border p-3" />
                  </FilterField>
                </div>

                <button
                  type="submit"
                  className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600"
                >
                  Сохранить ресторан
                </button>
              </form>
            </div>
          </div>

          <div className="space-y-6 min-w-0">
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildAdminHref({ tab: 'open', q, restaurantFilter, from, to })}
                className={`rounded-full px-4 py-2 text-sm ${
                  tab === 'open' ? 'bg-red-500 text-white' : 'bg-white text-gray-700 border'
                }`}
              >
                Открытые слоты · {openSlots.length}
              </Link>

              <Link
                href={buildAdminHref({ tab: 'applications', q, restaurantFilter, from, to })}
                className={`rounded-full px-4 py-2 text-sm ${
                  tab === 'applications'
                    ? 'bg-red-500 text-white'
                    : 'bg-white text-gray-700 border'
                }`}
              >
                Отклики · {pendingApplications.length}
              </Link>

              <Link
                href={buildAdminHref({ tab: 'assigned', q, restaurantFilter, from, to })}
                className={`rounded-full px-4 py-2 text-sm ${
                  tab === 'assigned' ? 'bg-red-500 text-white' : 'bg-white text-gray-700 border'
                }`}
              >
                Назначенные · {assignedSlots.length}
              </Link>

              <Link
                href={buildAdminHref({ tab: 'closed', q, restaurantFilter, from, to })}
                className={`rounded-full px-4 py-2 text-sm ${
                  tab === 'closed' ? 'bg-red-500 text-white' : 'bg-white text-gray-700 border'
                }`}
              >
                Закрытые · {closedSlots.length}
              </Link>

              <Link
                href={buildAdminHref({ tab: 'employees', q, restaurantFilter, from, to })}
                className={`rounded-full px-4 py-2 text-sm ${
                  tab === 'employees' ? 'bg-red-500 text-white' : 'bg-white text-gray-700 border'
                }`}
              >
                Сотрудники · {employees.length}
              </Link>
            </div>

            {(tab === 'open' || tab === 'closed' || tab === 'assigned') && slotFilters}
            {tab === 'applications' && applicationFilters}
            {tab === 'employees' && employeeFilters}

            {(tab === 'open' || tab === 'closed' || tab === 'assigned') && (
              <div className="space-y-4">
                {currentSlotsView.length === 0 ? (
                  <div className="rounded-2xl border bg-white p-6 text-gray-500 shadow-sm">
                    По выбранным условиям ничего не найдено.
                  </div>
                ) : (
                  currentSlotsView.map((slot) =>
                    renderSlotCard(
                      slot,
                      <>
                        <Link
                          href={buildAdminHref({
                            tab,
                            q,
                            restaurantFilter,
                            from,
                            to,
                            edit: slot.id,
                          })}
                          className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
                        >
                          Изменить
                        </Link>

                        {tab === 'open' && (
                          <form action={closeSlot}>
                            <input type="hidden" name="slot_id" value={slot.id} />
                            <button
                              type="submit"
                              className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
                            >
                              Закрыть
                            </button>
                          </form>
                        )}

                        {tab === 'closed' && (
                          <form action={reopenSlotAsNew}>
                            <input type="hidden" name="slot_id" value={slot.id} />
                            <button
                              type="submit"
                              className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
                            >
                              Возобновить как новую
                            </button>
                          </form>
                        )}
                      </>,
                      tab === 'assigned' && approvedAppBySlotId[slot.id] ? (
                        <div className="mt-3 rounded-xl bg-green-50 p-4 text-sm text-green-700">
                          Назначен: {approvedAppBySlotId[slot.id].full_name}
                          {approvedAppBySlotId[slot.id].employee_phone
                            ? ` • ${approvedAppBySlotId[slot.id].employee_phone}`
                            : ''}
                        </div>
                      ) : null
                    )
                  )
                )}
              </div>
            )}

            {tab === 'applications' && (
              <div className="space-y-4">
                {pendingApplicationsView.length === 0 ? (
                  <div className="rounded-2xl border bg-white p-6 text-gray-500 shadow-sm">
                    Новых откликов нет.
                  </div>
                ) : (
                  pendingApplicationsView.map((app) => {
                    const slot = allSlots.find((item) => item.id === app.slot_id);
                    const restaurant = slot ? getRestaurantById(slot.restaurant_id) : null;
                    const shiftMeta =
                      slot?.time_from && slot?.time_to
                        ? getShiftMeta(slot.time_from, slot.time_to)
                        : { hours: null, overnight: false };

                    return (
                      <div key={app.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold">{app.full_name}</h3>
                            <p className="text-sm text-gray-600">
                              {[app.employee_email, app.employee_phone, app.employee_role]
                                .filter(Boolean)
                                .join(' • ')}
                            </p>
                          </div>

                          <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-700">
                            На рассмотрении
                          </span>
                        </div>

                        <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                          <p>Домашний ресторан: {app.home_restaurant || '—'}</p>
                          <p>Контакт: {app.contact || '—'}</p>
                          <p>Рабочий ресторан: {restaurant?.name || '—'}</p>
                          <p>Дата: {slot ? formatDateRu(slot.work_date) : '—'}</p>
                          <p>
                            Время:{' '}
                            {slot
                              ? formatShiftTimeRange(slot.time_from, slot.time_to, shiftMeta.overnight)
                              : '—'}
                          </p>
                          <p>Должность: {slot?.position || '—'}</p>
                        </div>

                        <div className="mt-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                          Оплата:{' '}
                          {slot?.hourly_rate ? `${slot.hourly_rate} ₽/час` : 'Не указана'}
                          <br />
                          Длительность: {formatHours(shiftMeta.hours)}
                        </div>

                        {app.comment && (
                          <div className="mt-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                            Комментарий: {app.comment}
                          </div>
                        )}

                        <p className="mt-2 text-xs text-gray-500">
                          Отклик отправлен: {formatDateTime(app.created_at)}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <form action={approveApplication}>
                            <input type="hidden" name="application_id" value={app.id} />
                            <input type="hidden" name="slot_id" value={app.slot_id} />
                            <button
                              type="submit"
                              className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                            >
                              Подтвердить
                            </button>
                          </form>

                          <form action={rejectApplication} className="flex flex-wrap gap-2">
                            <input type="hidden" name="application_id" value={app.id} />
                            <input type="hidden" name="slot_id" value={app.slot_id} />
                            <input
                              name="rejection_reason"
                              placeholder="Причина отказа"
                              className="rounded-lg border p-2"
                            />
                            <button
                              type="submit"
                              className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
                            >
                              Отклонить
                            </button>
                          </form>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {tab === 'employees' && (
              <div className="space-y-4">
                {employeesView.length === 0 ? (
                  <div className="rounded-2xl border bg-white p-6 text-gray-500 shadow-sm">
                    Сотрудники не найдены.
                  </div>
                ) : (
                  employeesView.map((employee) => {
                    const restaurant = getRestaurantById(employee.home_restaurant_id);

                    return (
                      <div key={employee.user_id} className="rounded-2xl border bg-white p-5 shadow-sm">
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold">{employee.full_name}</h3>
                            <p className="text-sm text-gray-600">
                              {[employee.email, employee.phone, employee.role]
                                .filter(Boolean)
                                .join(' • ')}
                            </p>
                          </div>

                          <span
                            className={`rounded-full px-3 py-1 text-sm font-medium ${
                              employee.is_blocked
                                ? 'bg-red-100 text-red-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {employee.is_blocked ? 'Заблокирован' : 'Активен'}
                          </span>
                        </div>

                        <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                          <p>Домашний ресторан: {restaurant?.name || '—'}</p>
                          <p>Создан: {formatDateTime(employee.created_at)}</p>
                        </div>

                        <div className="mt-4">
                          <form action={toggleEmployeeBlock}>
                            <input type="hidden" name="user_id" value={employee.user_id} />
                            <input
                              type="hidden"
                              name="next_blocked"
                              value={employee.is_blocked ? 'false' : 'true'}
                            />
                            <button
                              type="submit"
                              className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
                            >
                              {employee.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                            </button>
                          </form>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}