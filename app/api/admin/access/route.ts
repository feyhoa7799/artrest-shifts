import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  SUPERADMIN_EMAIL,
  getAdminAccessByEmail,
  isConfiguredSuperadminEmail,
  listActiveAdminUsers,
  listAdminAccessAudit,
  normalizeAdminEmail,
  writeAdminAccessAudit,
  type AdminRole,
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

    const [items, audit] = await Promise.all([
      listActiveAdminUsers(),
      listAdminAccessAudit(50),
    ]);

    return NextResponse.json({
      items,
      audit,
      configuredSuperadminEmail: SUPERADMIN_EMAIL || null,
    });
  } catch {
    return NextResponse.json(
      { error: 'Ошибка загрузки администраторов' },
      { status: 500 }
    );
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
    const action = String(body?.action || '').trim();
    const targetEmail = normalizeAdminEmail(body?.email);

    if (!targetEmail) {
      return NextResponse.json({ error: 'Введите email' }, { status: 400 });
    }

    if (action === 'grant') {
      const role: AdminRole =
        isConfiguredSuperadminEmail(targetEmail) ? 'superadmin' : 'admin';

      const { error } = await supabaseAdmin.from('admin_users').upsert(
        {
          email: targetEmail,
          role,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await writeAdminAccessAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        targetEmail,
        action: 'grant',
        assignedRole: role,
      });

      const [items, audit] = await Promise.all([
        listActiveAdminUsers(),
        listAdminAccessAudit(50),
      ]);

      return NextResponse.json({
        success: true,
        items,
        audit,
        configuredSuperadminEmail: SUPERADMIN_EMAIL || null,
      });
    }

    if (action === 'revoke') {
      if (isConfiguredSuperadminEmail(targetEmail)) {
        return NextResponse.json(
          { error: 'Нельзя отозвать права у суперюзера из конфигурации' },
          { status: 400 }
        );
      }

      const { error } = await supabaseAdmin
        .from('admin_users')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('email', targetEmail);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await writeAdminAccessAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        targetEmail,
        action: 'revoke',
        assignedRole: null,
      });

      const [items, audit] = await Promise.all([
        listActiveAdminUsers(),
        listAdminAccessAudit(50),
      ]);

      return NextResponse.json({
        success: true,
        items,
        audit,
        configuredSuperadminEmail: SUPERADMIN_EMAIL || null,
      });
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Ошибка изменения доступа' }, { status: 500 });
  }
}