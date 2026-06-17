import { NextRequest, NextResponse } from 'next/server';

import { sanitizeActivityPage, touchUserActivity } from '@/lib/activity';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      return NextResponse.json({ success: true });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json({ success: true });
    }

    let lastPage: string | null = null;

    try {
      const body = (await req.json()) as { last_page?: unknown };
      lastPage = sanitizeActivityPage(body.last_page);
    } catch {
      lastPage = null;
    }

    try {
      await touchUserActivity({
        userId: userData.user.id,
        email: userData.user.email || null,
        lastPage,
        source: 'web',
        markLogin: true,
      });
    } catch (error) {
      console.error('[activity/ping] failed:', error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[activity/ping] unexpected error:', error);
    return NextResponse.json({ success: true });
  }
}
