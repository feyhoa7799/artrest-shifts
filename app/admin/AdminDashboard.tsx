'use client';

import { useEffect, useState } from 'react';
import {
  approveApplication,
  closeSlot,
  rejectApplication,
  reopenSlotAsNew,
  saveRestaurant,
  saveSlot,
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
}: Props) {
  const todayStr = getTodayLocalDate();
  const nowTimeStr = getNowLocalTime();

  const [slotForm, setSlotForm] = useState<SlotFormState>(emptySlotForm);

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

  const renderCreated = (createdAt: string) => (
    <p className="mt-2 text-xs text-gray-500">
      Создано: {formatDateTime(createdAt)} • {formatRelative(createdAt)}
    </p>
  );

  const renderSlotCard = (
    slot: Slot,
    extraActions?: React.ReactNode,
    extraBlock?: React.ReactNode
  ) => {
    const restaurant = restaurants.find((r) => r.id === slot.restaurant_id);
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
          <p><span className="font-medium">Дата:</span> {slot.work_date}</p>
          <p><span className="font-medium">Должность:</span> {slot.position}</p>
          <p>
            <span className="font-medium">Время:</span> {slot.time_from} – {slot.time_to}
            {meta.overnight ? ' (следующий день)' : ''}
          </p>
          <p><span className="font-medium">Оплата:</span> {slot.hourly_rate} ₽/час</p>
          <p><span className="font-medium">Длительность:</span> {meta.hours ? `${meta.hours} ч` : '—'}</p>
          {restaurant?.metro && <p><span className="font-medium">Метро:</span> {restaurant.metro}</p>}
        </div>

        {slot.comment && <p className="mt-2 text-sm text-gray-500">{slot.comment}</p>}

        {renderCreated(slot.created_at)}

        {extraBlock}

        {extraActions && <div className="mt-4 flex flex-wrap gap-2">{extraActions}</div>}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Админка смен</h1>
            <p className="text-gray-600">Управление слотами, откликами и ресторанами</p>
          </div>

          <AdminRefreshButton />
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

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Ресторан
                  </label>
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
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Должность
                  </label>
                  <input
                    type="text"
                    name="position"
                    required
                    value={slotForm.position}
                    onChange={(e) =>
                      setSlotForm((prev) => ({ ...prev, position: e.target.value }))
                    }
                    className="w-full rounded-lg border p-3"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Дата
                    </label>
                    <input
                      type="date"
                      name="work_date"
                      min={todayStr}
                      required
                      value={slotForm.work_date}
                      onChange={(e) =>
                        setSlotForm((prev) => ({ ...prev, work_date: e.target.value }))
                      }
                      className="w-full rounded-lg border p-3"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Оплата в час
                    </label>
                    <input
                      type="number"
                      name="hourly_rate"
                      min="0.01"
                      step="0.01"
                      required
                      value={slotForm.hourly_rate}
                      onChange={(e) =>
                        setSlotForm((prev) => ({ ...prev, hourly_rate: e.target.value }))
                      }
                      className="w-full rounded-lg border p-3"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Укажи реальное число, например: 350 или 350.50
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Время с
                    </label>
                    <input
                      type="time"
                      name="time_from"
                      min={currentMinTime}
                      required
                      value={slotForm.time_from}
                      onChange={(e) =>
                        setSlotForm((prev) => ({ ...prev, time_from: e.target.value }))
                      }
                      className="w-full rounded-lg border p-3"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Время по
                    </label>
                    <input
                      type="time"
                      name="time_to"
                      required
                      value={slotForm.time_to}
                      onChange={(e) =>
                        setSlotForm((prev) => ({ ...prev, time_to: e.target.value }))
                      }
                      className="w-full rounded-lg border p-3"
                    />
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  {shiftMeta.hours ? (
                    <>
                      Общая длительность смены:{' '}
                      <span className="font-semibold">{shiftMeta.hours} ч</span>
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

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Комментарий
                  </label>
                  <textarea
                    name="comment"
                    rows={4}
                    value={slotForm.comment}
                    onChange={(e) =>
                      setSlotForm((prev) => ({ ...prev, comment: e.target.value }))
                    }
                    className="w-full rounded-lg border p-3"
                  />
                </div>

                <label className="flex items-center gap-3 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    name="is_hot"
                    checked={slotForm.is_hot}
                    onChange={(e) =>
                      setSlotForm((prev) => ({ ...prev, is_hot: e.target.checked }))
                    }
                  />
                  <span className="font-medium">Горячая смена 🔥</span>
                </label>

                <div className="flex gap-2">
                  <button className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600">
                    {editSlot ? 'Сохранить изменения' : 'Добавить слот'}
                  </button>

                  {editSlot && (
                    <a
                      href={`/admin?tab=${tab}`}
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
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Название
                  </label>
                  <input name="name" required className="w-full rounded-lg border p-3" />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Адрес
                  </label>
                  <input name="address" required className="w-full rounded-lg border p-3" />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Город
                  </label>
                  <input
                    name="city"
                    required
                    placeholder="Например: Москва или Казань"
                    className="w-full rounded-lg border p-3"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Метро
                  </label>
                  <input
                    name="metro"
                    placeholder="Необязательно"
                    className="w-full rounded-lg border p-3"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Широта
                    </label>
                    <input
                      name="lat"
                      type="number"
                      step="0.000001"
                      className="w-full rounded-lg border p-3"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Долгота
                    </label>
                    <input
                      name="lng"
                      type="number"
                      step="0.000001"
                      className="w-full rounded-lg border p-3"
                    />
                  </div>
                </div>

                <button className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50">
                  Добавить ресторан
                </button>
              </form>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                <a
                  href="/admin?tab=open"
                  className={`rounded-lg px-4 py-2 ${
                    tab === 'open'
                      ? 'bg-red-500 text-white'
                      : 'border text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Открытые слоты
                </a>

                <a
                  href="/admin?tab=applications"
                  className={`rounded-lg px-4 py-2 ${
                    tab === 'applications'
                      ? 'bg-red-500 text-white'
                      : 'border text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Отклики
                </a>

                <a
                  href="/admin?tab=assigned"
                  className={`rounded-lg px-4 py-2 ${
                    tab === 'assigned'
                      ? 'bg-red-500 text-white'
                      : 'border text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Подтвержденные
                </a>

                <a
                  href="/admin?tab=closed"
                  className={`rounded-lg px-4 py-2 ${
                    tab === 'closed'
                      ? 'bg-red-500 text-white'
                      : 'border text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Закрытые слоты
                </a>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold">Фильтры</h2>

              <form className="grid gap-4 md:grid-cols-5">
                <input type="hidden" name="tab" value={tab} />

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Поиск
                  </label>
                  <input
                    type="text"
                    name="q"
                    defaultValue={q}
                    placeholder="Ресторан, должность, ФИО..."
                    className="w-full rounded-lg border p-3"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Ресторан
                  </label>
                  <select
                    name="restaurant"
                    defaultValue={restaurantFilter}
                    className="w-full rounded-lg border p-3"
                  >
                    <option value="">Все рестораны</option>
                    {restaurants.map((restaurant) => (
                      <option key={restaurant.id} value={restaurant.id}>
                        {restaurant.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Дата с
                  </label>
                  <input
                    type="date"
                    name="from"
                    min={todayStr}
                    defaultValue={from}
                    className="w-full rounded-lg border p-3"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Дата по
                  </label>
                  <input
                    type="date"
                    name="to"
                    min={todayStr}
                    defaultValue={to}
                    className="w-full rounded-lg border p-3"
                  />
                </div>

                <div className="md:col-span-5 flex gap-2">
                  <button className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600">
                    Применить
                  </button>

                  <a
                    href={`/admin?tab=${tab}`}
                    className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
                  >
                    Сбросить
                  </a>
                </div>
              </form>
            </div>

            {tab === 'open' && (
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Открытые слоты</h2>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                    {openSlots.length}
                  </span>
                </div>

                {openSlots.length === 0 ? (
                  <p className="text-gray-500">Ничего не найдено</p>
                ) : (
                  <div className="space-y-4">
                    {openSlots.map((slot) =>
                      renderSlotCard(
                        slot,
                        <>
                          <a
                            href={`/admin?tab=open&edit=${slot.id}&q=${encodeURIComponent(q)}&restaurant=${restaurantFilter}&from=${from}&to=${to}`}
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
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                    {pendingApplications.length}
                  </span>
                </div>

                {pendingApplications.length === 0 ? (
                  <p className="text-gray-500">Ничего не найдено</p>
                ) : (
                  <div className="space-y-4">
                    {pendingApplications.map((app) => {
                      const allSlots = [...openSlots, ...assignedSlots, ...closedSlots];
                      const slot = allSlots.find((s) => s.id === app.slot_id);
                      const restaurant = restaurants.find((r) => r.id === slot?.restaurant_id);
                      const meta = slot
                        ? getShiftMeta(slot.time_from, slot.time_to)
                        : { hours: null, overnight: false };

                      return (
                        <div key={app.id} className="rounded-xl border p-4">
                          <div className="mb-3">
                            <h3 className="font-semibold">{app.full_name}</h3>
                            <p className="text-sm text-gray-500">{app.contact}</p>
                          </div>

                          <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                            <p><span className="font-medium">Свой ресторан:</span> {app.home_restaurant}</p>
                            <p><span className="font-medium">Дата отклика:</span> {formatDateTime(app.created_at)}</p>
                            <p><span className="font-medium">Ресторан подработки:</span> {restaurant?.name || 'Не найден'}</p>
                            <p><span className="font-medium">Должность:</span> {slot?.position || '—'}</p>
                            <p><span className="font-medium">Дата смены:</span> {slot?.work_date || '—'}</p>
                            <p>
                              <span className="font-medium">Часы:</span>{' '}
                              {meta.hours ? `${meta.hours} ч${meta.overnight ? ' • через полночь' : ''}` : '—'}
                            </p>
                          </div>

                          {app.comment && (
                            <p className="mt-2 text-sm text-gray-500">{app.comment}</p>
                          )}

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
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                    {assignedSlots.length}
                  </span>
                </div>

                {assignedSlots.length === 0 ? (
                  <p className="text-gray-500">Ничего не найдено</p>
                ) : (
                  <div className="space-y-4">
                    {assignedSlots.map((slot) =>
                      renderSlotCard(
                        slot,
                        undefined,
                        <div className="mt-4 rounded-lg bg-gray-50 p-4">
                          <p className="mb-2 text-sm font-semibold text-gray-700">
                            Назначенный сотрудник
                          </p>
                          {approvedAppBySlotId[slot.id] ? (
                            <div className="grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                              <p><span className="font-medium">ФИО:</span> {approvedAppBySlotId[slot.id]?.full_name}</p>
                              <p><span className="font-medium">Контакт:</span> {approvedAppBySlotId[slot.id]?.contact}</p>
                              <p><span className="font-medium">Свой ресторан:</span> {approvedAppBySlotId[slot.id]?.home_restaurant}</p>
                              <p><span className="font-medium">Отклик:</span> {formatDateTime(approvedAppBySlotId[slot.id]!.created_at)}</p>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">Данные сотрудника не найдены</p>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'closed' && (
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Закрытые слоты</h2>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                    {closedSlots.length}
                  </span>
                </div>

                {closedSlots.length === 0 ? (
                  <p className="text-gray-500">Ничего не найдено</p>
                ) : (
                  <div className="space-y-4">
                    {closedSlots.map((slot) =>
                      renderSlotCard(
                        slot,
                        <>
                          <a
                            href={`/admin?tab=closed&edit=${slot.id}&q=${encodeURIComponent(q)}&restaurant=${restaurantFilter}&from=${from}&to=${to}`}
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
          </div>
        </div>
      </div>
    </main>
  );
}