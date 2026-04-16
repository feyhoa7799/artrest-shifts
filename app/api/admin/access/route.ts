import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  SUPERADMIN_EMAIL,
  getAdminAccessByEmail,
  listActiveAdminUsers,
  normalizeAdminEmail,
} from '@/lib/admin-access';

async function getCurrentUserFromToken(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '').trim();

  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserFromToken(req);

    if (!user) {
      return NextResponse.json({ error: 'Нет авторизации' }, { status: 401 });
    }

    const access = await getAdminAccessByEmail(user.email);

    if (!access.isSuperadmin) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const items = await listActiveAdminUsers();

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Ошибка загрузки администраторов' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserFromToken(req);

    if (!user) {
      return NextResponse.json({ error: 'Нет авторизации' }, { status: 401 });
    }

    const access = await getAdminAccessByEmail(user.email);

    if (!access.isSuperadmin) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const body = await req.json();
    const action = String(body.action || '').trim();
    const targetEmail = normalizeAdminEmail(body.email);

    if (!targetEmail) {
      return NextResponse.json({ error: 'Введите email' }, { status: 400 });
    }

    if (action === 'grant') {
      const role = targetEmail === SUPERADMIN_EMAIL ? 'superadmin' : 'admin';

      const { error } = await supabaseAdmin.from('admin_users').upsert(
        {
          email: targetEmail,
          role,
          is_active: true,
        },
        { onConflict: 'email' }
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'revoke') {
      if (targetEmail === SUPERADMIN_EMAIL) {
        return NextResponse.json(
          { error: 'Нельзя отозвать права у суперюзера' },
          { status: 400 }
        );
      }

      const { error } = await supabaseAdmin
        .from('admin_users')
        .update({ is_active: false })
        .eq('email', targetEmail);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Ошибка изменения доступа' }, { status: 500 });
  }
}