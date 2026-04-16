import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAdminAccessByEmail } from '@/lib/admin-access';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Нет авторизации' }, { status: 401 });
    }

    const { data: userData, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !userData.user) {
      return NextResponse.json({ error: 'Нет авторизации' }, { status: 401 });
    }

    const user = userData.user;
    const access = await getAdminAccessByEmail(user.email);

    return NextResponse.json({
      email: user.email || '',
      isAdmin: access.isAdmin,
      isSuperadmin: access.isSuperadmin,
      role: access.role,
    });
  } catch {
    return NextResponse.json({ error: 'Ошибка проверки доступа' }, { status: 500 });
  }
}