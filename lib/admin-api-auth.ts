import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAdminContextByEmail, type AdminContext } from '@/lib/admin-access';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function jsonError(error: unknown, fallback = 'Ошибка сервера') {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof Error) {
    return NextResponse.json({ error: error.message || fallback }, { status: 500 });
  }

  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function getCurrentAdminContext(req: NextRequest): Promise<AdminContext> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '').trim();

  if (!token) {
    throw new ApiError('Нет авторизации', 401);
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    throw new ApiError('Сессия недействительна', 401);
  }

  const context = await getAdminContextByEmail({
    email: data.user.email,
    userId: data.user.id,
  });

  if (!context.isAdmin) {
    throw new ApiError('Недостаточно прав', 403);
  }

  return context;
}
