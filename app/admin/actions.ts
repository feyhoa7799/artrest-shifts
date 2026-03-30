'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase-admin';

function getString(formData: FormData, key: string) {
  return String(formData.get(key) || '').trim();
}

function getNumber(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return Number(value);
}

function isPositiveMoney(value: number) {
  return Number.isFinite(value) && value > 0;
}

function buildDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function validateFutureSlot(workDate: string, timeFrom: string, timeTo: string) {
  const start = buildDateTime(workDate, timeFrom);
  const end = buildDateTime(workDate, timeTo);
  const now = new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Некорректная дата или время');
  }

  if (start < now) {
    throw new Error('Нельзя создавать слот в прошедшую дату или время');
  }

  if (timeFrom === timeTo) {
    throw new Error('Время начала и окончания не может совпадать');
  }

  return true;
}

export async function saveRestaurant(formData: FormData) {
  const name = getString(formData, 'name');
  const address = getString(formData, 'address');
  const city = getString(formData, 'city');
  const metro = getString(formData, 'metro');
  const latRaw = getString(formData, 'lat');
  const lngRaw = getString(formData, 'lng');

  if (!name || !address || !city) {
    throw new Error('Заполнены не все обязательные поля ресторана');
  }

  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;

  if (latRaw && !Number.isFinite(lat)) {
    throw new Error('Широта ресторана указана некорректно');
  }

  if (lngRaw && !Number.isFinite(lng)) {
    throw new Error('Долгота ресторана указана некорректно');
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

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function saveSlot(formData: FormData) {
  const slotId = getNumber(formData, 'slot_id');
  const restaurantId = getNumber(formData, 'restaurant_id');
  const workDate = getString(formData, 'work_date');
  const timeFrom = getString(formData, 'time_from');
  const timeTo = getString(formData, 'time_to');
  const position = getString(formData, 'position');
  const hourlyRate = getNumber(formData, 'hourly_rate');
  const comment = getString(formData, 'comment');
  const isHot = formData.get('is_hot') === 'on';
  const status = getString(formData, 'status') || 'open';

  if (!restaurantId || !workDate || !timeFrom || !timeTo || !position) {
    throw new Error('Заполнены не все обязательные поля слота');
  }

  if (!isPositiveMoney(hourlyRate)) {
    throw new Error('Оплата в час должна быть положительным числом');
  }

  validateFutureSlot(workDate, timeFrom, timeTo);

  const payload = {
    restaurant_id: restaurantId,
    work_date: workDate,
    time_from: timeFrom,
    time_to: timeTo,
    position,
    hourly_rate: hourlyRate,
    comment,
    is_hot: isHot,
    status,
  };

  if (slotId) {
    const { error } = await supabaseAdmin.from('slots').update(payload).eq('id', slotId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin.from('slots').insert([payload]);
    if (error) throw new Error(error.message);
  }

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function closeSlot(formData: FormData) {
  const slotId = getNumber(formData, 'slot_id');
  if (!slotId) throw new Error('Не найден слот');

  const { error } = await supabaseAdmin
    .from('slots')
    .update({ status: 'closed' })
    .eq('id', slotId);

  if (error) throw new Error(error.message);

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function reopenSlotAsNew(formData: FormData) {
  const slotId = getNumber(formData, 'slot_id');
  if (!slotId) throw new Error('Не найден слот');

  const { data: slot, error: readError } = await supabaseAdmin
    .from('slots')
    .select('*')
    .eq('id', slotId)
    .single();

  if (readError || !slot) {
    throw new Error(readError?.message || 'Слот не найден');
  }

  const { error: insertError } = await supabaseAdmin.from('slots').insert([
    {
      restaurant_id: slot.restaurant_id,
      work_date: slot.work_date,
      time_from: slot.time_from,
      time_to: slot.time_to,
      position: slot.position,
      hourly_rate: slot.hourly_rate,
      comment: slot.comment,
      is_hot: slot.is_hot ?? false,
      status: 'open',
    },
  ]);

  if (insertError) throw new Error(insertError.message);

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function rejectApplication(formData: FormData) {
  const applicationId = getNumber(formData, 'application_id');
  const slotId = getNumber(formData, 'slot_id');
  const rejectionReason = getString(formData, 'rejection_reason');

  if (!applicationId || !slotId) {
    throw new Error('Не хватает данных для отклонения');
  }

  if (!rejectionReason) {
    throw new Error('Нужно указать причину отклонения');
  }

  const { error: appError } = await supabaseAdmin
    .from('applications')
    .update({
      status: 'rejected',
      rejection_reason: rejectionReason,
    })
    .eq('id', applicationId);

  if (appError) throw new Error(appError.message);

  const { error: slotError } = await supabaseAdmin
    .from('slots')
    .update({ status: 'open' })
    .eq('id', slotId);

  if (slotError) throw new Error(slotError.message);

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function approveApplication(formData: FormData) {
  const applicationId = getNumber(formData, 'application_id');
  const slotId = getNumber(formData, 'slot_id');

  if (!applicationId || !slotId) {
    throw new Error('Не хватает данных для подтверждения');
  }

  const { error: approveError } = await supabaseAdmin
    .from('applications')
    .update({
      status: 'approved',
      rejection_reason: null,
    })
    .eq('id', applicationId);

  if (approveError) throw new Error(approveError.message);

  const { error: rejectOthersError } = await supabaseAdmin
    .from('applications')
    .update({
      status: 'rejected',
      rejection_reason: 'Слот назначен другому сотруднику',
    })
    .eq('slot_id', slotId)
    .neq('id', applicationId)
    .eq('status', 'pending');

  if (rejectOthersError) throw new Error(rejectOthersError.message);

  const { error: slotError } = await supabaseAdmin
    .from('slots')
    .update({ status: 'assigned' })
    .eq('id', slotId);

  if (slotError) throw new Error(slotError.message);

  revalidatePath('/');
  revalidatePath('/admin');
}

export async function toggleEmployeeBlock(formData: FormData) {
  const userId = getString(formData, 'user_id');
  const nextBlockedValue = getString(formData, 'next_blocked') === 'true';

  if (!userId) {
    throw new Error('Не найден пользователь');
  }

  const { error } = await supabaseAdmin
    .from('employee_profiles')
    .update({
      is_blocked: nextBlockedValue,
    })
    .eq('user_id', userId);

  if (error) throw new Error(error.message);

  revalidatePath('/admin');
}