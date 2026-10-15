import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PRIVACY_POLICY_VERSION } from '@/lib/privacy-policy';

async function getUserFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '').trim();

  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json({ error: 'Нет авторизации' }, { status: 401 });
    }

    const body = await req.json();
    const accepted = Boolean(body.accepted);

    if (!accepted) {
      return NextResponse.json(
        { error: 'Согласие обязательно для авторизации' },
        { status: 400 }
      );
    }

    const payload = {
      user_id: user.id,
      email: user.email || '',
      accepted: true,
      policy_version: PRIVACY_POLICY_VERSION,
      accepted_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('employee_privacy_consents')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Ошибка сохранения согласия' },
      { status: 500 }
    );
  }
}
