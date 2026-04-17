import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';

type ApplicationRow = {
  id: number;
  slot_id: number;
  status: 'pending' | 'approved' | 'rejected';
  employee_user_id: string;
};

function getNumericId(value: string) {
  const id = Number(value);
  return Number.isFinite(id) ? id : 0;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Нет авторизации' }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Сессия недействительна' }, { status: 401 });
    }

    const user = userData.user;
    const params = await context.params;
    const applicationId = getNumericId(params.id);

    if (!applicationId) {
      return NextResponse.json({ error: 'Некорректный id отклика' }, { status: 400 });
    }

    const { data: application, error: applicationError } = await supabaseAdmin
      .from('applications')
      .select('id, slot_id, status, employee_user_id')
      .eq('id', applicationId)
      .eq('employee_user_id', user.id)
      .single();

    if (applicationError || !application) {
      return NextResponse.json({ error: 'Отклик не найден' }, { status: 404 });
    }

    const currentApplication = application as ApplicationRow;

    if (currentApplication.status !== 'pending') {
      return NextResponse.json(
        {
          error:
            'Можно отменить только отклик со статусом «ожидает подтверждения». Подтверждённые смены отменяются через HR-менеджера.',
        },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from('applications')
      .update({
        status: 'rejected',
        rejection_reason: 'Отклик отменён сотрудником',
      })
      .eq('id', currentApplication.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { data: otherApplications } = await supabaseAdmin
      .from('applications')
      .select('id')
      .eq('slot_id', currentApplication.slot_id)
      .in('status', ['pending', 'approved']);

    if (!otherApplications || otherApplications.length === 0) {
      await supabaseAdmin
        .from('slots')
        .update({ status: 'open' })
        .eq('id', currentApplication.slot_id);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Ошибка отмены отклика' },
      { status: 500 }
    );
  }
}