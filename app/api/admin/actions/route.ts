import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import { getCurrentAdminContext, jsonError, ApiError } from '@/lib/admin-api-auth';
import { assertCanAccessRestaurant, type AdminContext } from '@/lib/admin-access';
import { clearActiveRestaurantOptionsCache } from '@/lib/restaurants-cache';
import { getShiftEndDate } from '@/lib/shift';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  getApprovedApplicationsCount,
  normalizeNeededCount,
  syncSlotCapacity,
} from '@/lib/slot-capacity';

type SlotRow = {
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
};

type ApplicationRow = {
  id: number;
  slot_id: number;
  status: 'pending' | 'approved' | 'rejected' | null;
};

type RestaurantRow = {
  id: number;
  name: string;
  is_active: boolean | null;
};

function getString(body: Record<string, unknown>, key: string) {
  return String(body[key] || '').trim();
}

function getNumberOrNull(body: Record<string, unknown>, key: string) {
  const value = String(body[key] ?? '').trim();

  if (!value) return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : NaN;
}

function buildDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function validateFutureSlot(workDate: string, timeFrom: string, timeTo: string) {
  const start = buildDateTime(workDate, timeFrom);
  const end = buildDateTime(workDate, timeTo);
  const now = new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ApiError('Некорректная дата или время', 400);
  }

  if (start < now) {
    throw new ApiError('Нельзя создавать слот в прошедшую дату или время', 400);
  }

  if (timeFrom === timeTo) {
    throw new ApiError('Время начала и окончания не может совпадать', 400);
  }
}

function revalidateOperationalPaths() {
  revalidatePath('/');
  revalidatePath('/slots');
  revalidatePath('/admin');
  revalidatePath('/my-applications');
}

async function getSlot(slotId: number) {
  const { data, error } = await supabaseAdmin
    .from('slots')
    .select(
      'id, restaurant_id, work_date, time_from, time_to, position, hourly_rate, comment, status, is_hot, needed_count, accepted_count'
    )
    .eq('id', slotId)
    .single();

  if (error || !data) {
    throw new ApiError('Слот не найден', 404);
  }

  return data as SlotRow;
}

async function getApplicationWithSlot(applicationId: number) {
  const { data, error } = await supabaseAdmin
    .from('applications')
    .select('id, slot_id, status')
    .eq('id', applicationId)
    .single();

  if (error || !data) {
    throw new ApiError('Отклик не найден', 404);
  }

  const application = data as ApplicationRow;
  const slot = await getSlot(application.slot_id);

  return { application, slot };
}

async function getRestaurant(restaurantId: number) {
  const { data, error } = await supabaseAdmin
    .from('restaurants')
    .select('id, name, is_active')
    .eq('id', restaurantId)
    .single();

  if (error || !data) {
    throw new ApiError('Ресторан не найден', 404);
  }

  return data as RestaurantRow;
}

async function assertRestaurantIsActive(restaurantId: number) {
  const restaurant = await getRestaurant(restaurantId);

  if (restaurant.is_active === false) {
    throw new ApiError('Нельзя создавать новые слоты для архивного ресторана', 400);
  }

  return restaurant;
}

async function getBlockingFutureSlots(restaurantId: number) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from('slots')
    .select('id, work_date, time_from, time_to, position, status')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'closed')
    .gte('work_date', today)
    .limit(50);

  if (error) throw new Error(error.message);

  const now = new Date();

  return (data || []).filter((slot) => {
    const row = slot as Pick<SlotRow, 'id' | 'work_date' | 'time_from' | 'time_to' | 'position' | 'status'>;
    const end = getShiftEndDate(row.work_date, row.time_from, row.time_to);

    if (!end) return row.work_date >= today;

    return end.getTime() >= now.getTime();
  });
}

async function handleSaveRestaurant(context: AdminContext, body: Record<string, unknown>) {
  if (!context.isGlobalAdmin) {
    throw new ApiError('Ресторанами могут управлять только HR и superadmin', 403);
  }

  const name = getString(body, 'name');
  const address = getString(body, 'address');
  const city = getString(body, 'city');
  const metro = getString(body, 'metro');
  const latRaw = getString(body, 'lat');
  const lngRaw = getString(body, 'lng');

  if (!name || !address || !city) {
    throw new ApiError('Заполнены не все обязательные поля ресторана', 400);
  }

  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;

  if (latRaw && !Number.isFinite(lat)) {
    throw new ApiError('Широта ресторана указана некорректно', 400);
  }

  if (lngRaw && !Number.isFinite(lng)) {
    throw new ApiError('Долгота ресторана указана некорректно', 400);
  }

  const { error } = await supabaseAdmin.from('restaurants').insert([
    {
      name,
      address,
      city,
      metro: metro || null,
      lat,
      lng,
      is_active: true,
    },
  ]);

  if (error) throw new Error(error.message);

  clearActiveRestaurantOptionsCache();
}

async function handleArchiveRestaurant(context: AdminContext, body: Record<string, unknown>) {
  if (!context.isGlobalAdmin) {
    throw new ApiError('Архивировать рестораны могут только HR и superadmin', 403);
  }

  const restaurantId = Number(getString(body, 'restaurant_id'));
  const archiveReason = getString(body, 'archive_reason');

  if (!restaurantId) {
    throw new ApiError('Ресторан не найден', 400);
  }

  if (!archiveReason) {
    throw new ApiError('Укажите причину архивирования ресторана', 400);
  }

  const restaurant = await getRestaurant(restaurantId);

  if (restaurant.is_active === false) {
    throw new ApiError('Ресторан уже в архиве', 400);
  }

  const blockingSlots = await getBlockingFutureSlots(restaurantId);

  if (blockingSlots.length > 0) {
    throw new ApiError(
      `Нельзя архивировать ресторан: есть активные будущие слоты (${blockingSlots.length}). Сначала закройте их.`,
      400
    );
  }

  const { error } = await supabaseAdmin
    .from('restaurants')
    .update({
      is_active: false,
      archived_at: new Date().toISOString(),
      archived_by: context.userId || context.email,
      archive_reason: archiveReason,
    })
    .eq('id', restaurantId);

  if (error) throw new Error(error.message);

  clearActiveRestaurantOptionsCache();
}

async function handleRestoreRestaurant(context: AdminContext, body: Record<string, unknown>) {
  if (!context.isGlobalAdmin) {
    throw new ApiError('Возвращать рестораны из архива могут только HR и superadmin', 403);
  }

  const restaurantId = Number(getString(body, 'restaurant_id'));

  if (!restaurantId) {
    throw new ApiError('Ресторан не найден', 400);
  }

  const { error } = await supabaseAdmin
    .from('restaurants')
    .update({
      is_active: true,
      archived_at: null,
      archived_by: null,
      archive_reason: null,
    })
    .eq('id', restaurantId);

  if (error) throw new Error(error.message);

  clearActiveRestaurantOptionsCache();
}

async function handleSaveSlot(context: AdminContext, body: Record<string, unknown>) {
  const slotIdRaw = getString(body, 'slot_id');
  const slotId = slotIdRaw ? Number(slotIdRaw) : null;
  const restaurantId = Number(getString(body, 'restaurant_id'));
  const workDate = getString(body, 'work_date');
  const timeFrom = getString(body, 'time_from');
  const timeTo = getString(body, 'time_to');
  const position = getString(body, 'position');
  const hourlyRate = getNumberOrNull(body, 'hourly_rate');
  const comment = getString(body, 'comment');
  const isHot = Boolean(body.is_hot);
  const neededCount = normalizeNeededCount(body.needed_count);
  let currentSlot: SlotRow | null = null;
  let approvedCount = 0;

  if (!restaurantId || !workDate || !timeFrom || !timeTo || !position) {
    throw new ApiError('Заполнены не все обязательные поля слота', 400);
  }

  assertCanAccessRestaurant(context, restaurantId);

  if (hourlyRate !== null && !Number.isFinite(hourlyRate)) {
    throw new ApiError('Оплата в час указана некорректно', 400);
  }

  if (hourlyRate !== null && hourlyRate <= 0) {
    throw new ApiError('Оплата в час должна быть больше нуля', 400);
  }

  validateFutureSlot(workDate, timeFrom, timeTo);

  if (slotId) {
    currentSlot = await getSlot(slotId);
    assertCanAccessRestaurant(context, currentSlot.restaurant_id);
    approvedCount = await getApprovedApplicationsCount(slotId);

    if (neededCount < approvedCount) {
      throw new ApiError(
        `Нельзя указать меньше ${approvedCount}: столько сотрудников уже принято`,
        400
      );
    }

    if (approvedCount > 0 && restaurantId !== currentSlot.restaurant_id) {
      throw new ApiError(
        'Нельзя менять ресторан у слота, по которому уже есть принятые отклики',
        400
      );
    }

    if (restaurantId !== currentSlot.restaurant_id) {
      await assertRestaurantIsActive(restaurantId);
    }
  } else {
    await assertRestaurantIsActive(restaurantId);
  }

  const payload = {
    restaurant_id: restaurantId,
    work_date: workDate,
    time_from: timeFrom,
    time_to: timeTo,
    position,
    hourly_rate: hourlyRate,
    comment: comment || null,
    is_hot: isHot,
    needed_count: neededCount,
  };

  if (slotId) {
    const { error } = await supabaseAdmin.from('slots').update(payload).eq('id', slotId);

    if (error) throw new Error(error.message);

    await syncSlotCapacity(slotId);
  } else {
    const { error } = await supabaseAdmin.from('slots').insert([
      {
        ...payload,
        accepted_count: 0,
        status: 'open',
      },
    ]);

    if (error) throw new Error(error.message);
  }
}

async function handleCloseSlot(context: AdminContext, body: Record<string, unknown>) {
  const slotId = Number(getString(body, 'slot_id'));

  if (!slotId) throw new ApiError('Не найден слот', 400);

  const slot = await getSlot(slotId);
  assertCanAccessRestaurant(context, slot.restaurant_id);

  const { error } = await supabaseAdmin
    .from('slots')
    .update({ status: 'closed' })
    .eq('id', slotId);

  if (error) throw new Error(error.message);
}

async function handleReopenSlotAsNew(context: AdminContext, body: Record<string, unknown>) {
  const slotId = Number(getString(body, 'slot_id'));

  if (!slotId) throw new ApiError('Не найден слот', 400);

  const slot = await getSlot(slotId);
  assertCanAccessRestaurant(context, slot.restaurant_id);
  await assertRestaurantIsActive(slot.restaurant_id);

  const { error } = await supabaseAdmin.from('slots').insert([
    {
      restaurant_id: slot.restaurant_id,
      work_date: slot.work_date,
      time_from: slot.time_from,
      time_to: slot.time_to,
      position: slot.position,
      hourly_rate: slot.hourly_rate ?? null,
      comment: slot.comment,
      is_hot: slot.is_hot ?? false,
      needed_count: normalizeNeededCount(slot.needed_count),
      accepted_count: 0,
      status: 'open',
    },
  ]);

  if (error) throw new Error(error.message);
}

async function handleRejectApplication(context: AdminContext, body: Record<string, unknown>) {
  const applicationId = Number(getString(body, 'application_id'));
  const rejectionReason = getString(body, 'rejection_reason');

  if (!applicationId) {
    throw new ApiError('Не хватает данных для отклонения', 400);
  }

  if (!rejectionReason) {
    throw new ApiError('Нужно указать причину отклонения', 400);
  }

  const { application, slot } = await getApplicationWithSlot(applicationId);
  assertCanAccessRestaurant(context, slot.restaurant_id);

  const { error } = await supabaseAdmin
    .from('applications')
    .update({
      status: 'rejected',
      rejection_reason: rejectionReason,
    })
    .eq('id', application.id);

  if (error) throw new Error(error.message);

  await syncSlotCapacity(slot.id);
}

async function handleApproveApplication(context: AdminContext, body: Record<string, unknown>) {
  const applicationId = Number(getString(body, 'application_id'));

  if (!applicationId) {
    throw new ApiError('Не хватает данных для подтверждения', 400);
  }

  const { application, slot } = await getApplicationWithSlot(applicationId);
  assertCanAccessRestaurant(context, slot.restaurant_id);

  if (application.status !== 'pending') {
    throw new ApiError('Этот отклик уже обработан', 400);
  }

  if (slot.status === 'closed') {
    throw new ApiError('Слот закрыт', 400);
  }

  const capacity = await syncSlotCapacity(slot.id);

  if (capacity.isFull) {
    throw new ApiError('Слот уже укомплектован', 400);
  }

  const { error: approveError } = await supabaseAdmin
    .from('applications')
    .update({
      status: 'approved',
      rejection_reason: null,
    })
    .eq('id', application.id);

  if (approveError) throw new Error(approveError.message);

  const updatedCapacity = await syncSlotCapacity(slot.id);

  if (updatedCapacity.isFull) {
    const { error: rejectOthersError } = await supabaseAdmin
      .from('applications')
      .update({
        status: 'rejected',
        rejection_reason: 'Слот укомплектован',
      })
      .eq('slot_id', slot.id)
      .eq('status', 'pending');

    if (rejectOthersError) throw new Error(rejectOthersError.message);

    await syncSlotCapacity(slot.id);
  }
}

async function handleToggleEmployeeBlock(
  context: AdminContext,
  body: Record<string, unknown>
) {
  if (!context.isGlobalAdmin) {
    throw new ApiError('Сотрудниками могут управлять только HR и superadmin', 403);
  }

  const userId = getString(body, 'user_id');
  const nextBlockedValue = Boolean(body.next_blocked);

  if (!userId) {
    throw new ApiError('Не найден пользователь', 400);
  }

  const { error } = await supabaseAdmin
    .from('employee_profiles')
    .update({
      is_blocked: nextBlockedValue,
    })
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

export async function POST(req: NextRequest) {
  try {
    const context = await getCurrentAdminContext(req);
    const body = (await req.json()) as Record<string, unknown>;
    const action = getString(body, 'action');

    if (action === 'saveRestaurant') {
      await handleSaveRestaurant(context, body);
    } else if (action === 'archiveRestaurant') {
      await handleArchiveRestaurant(context, body);
    } else if (action === 'restoreRestaurant') {
      await handleRestoreRestaurant(context, body);
    } else if (action === 'saveSlot') {
      await handleSaveSlot(context, body);
    } else if (action === 'closeSlot') {
      await handleCloseSlot(context, body);
    } else if (action === 'reopenSlotAsNew') {
      await handleReopenSlotAsNew(context, body);
    } else if (action === 'approveApplication') {
      await handleApproveApplication(context, body);
    } else if (action === 'rejectApplication') {
      await handleRejectApplication(context, body);
    } else if (action === 'toggleEmployeeBlock') {
      await handleToggleEmployeeBlock(context, body);
    } else {
      throw new ApiError('Неизвестное действие', 400);
    }

    revalidateOperationalPaths();

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, 'Ошибка выполнения действия');
  }
}
