import { supabaseAdmin } from '@/lib/supabase-admin';

type SlotCapacityRow = {
  id: number;
  needed_count: number | null;
  accepted_count: number | null;
  status: 'open' | 'pending' | 'closed' | 'assigned';
};

export function normalizeNeededCount(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 1;

  return Math.max(1, Math.floor(parsed));
}

export async function getApprovedApplicationsCount(slotId: number) {
  const { count, error } = await supabaseAdmin
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('slot_id', slotId)
    .eq('status', 'approved');

  if (error) {
    throw new Error(error.message);
  }

  return count || 0;
}

export async function syncSlotCapacity(slotId: number) {
  const { data, error } = await supabaseAdmin
    .from('slots')
    .select('id, needed_count, accepted_count, status')
    .eq('id', slotId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Слот не найден');
  }

  const slot = data as SlotCapacityRow;
  const neededCount = normalizeNeededCount(slot.needed_count);
  const acceptedCount = await getApprovedApplicationsCount(slotId);
  const isFull = acceptedCount >= neededCount;

  const nextStatus =
    slot.status === 'closed' ? 'closed' : isFull ? 'assigned' : 'open';

  const { error: updateError } = await supabaseAdmin
    .from('slots')
    .update({
      needed_count: neededCount,
      accepted_count: acceptedCount,
      status: nextStatus,
    })
    .eq('id', slotId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    neededCount,
    acceptedCount,
    isFull,
    status: nextStatus,
  };
}
