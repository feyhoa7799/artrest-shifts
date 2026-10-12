import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseAuthServerClient } from '@/lib/supabase-auth-server';
import { validateSmartCaptcha } from '@/lib/yandex-smartcaptcha';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
      captchaToken?: unknown;
    };
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || email.length > 320 || !password || password.length > 1_024) {
      return NextResponse.json(
        { error: 'Введите email и пароль' },
        { status: 400 }
      );
    }

    const captcha = await validateSmartCaptcha(request, body.captchaToken);

    if (!captcha.ok) {
      return NextResponse.json(
        {
          error:
            captcha.reason === 'invalid'
              ? 'Проверка CAPTCHA не пройдена. Попробуйте ещё раз.'
              : 'Сервис CAPTCHA временно недоступен. Попробуйте позже.',
        },
        { status: captcha.reason === 'invalid' ? 400 : 503 }
      );
    }

    const { data, error } =
      await getSupabaseAuthServerClient().auth.signInWithPassword({
        email,
        password,
      });

    if (error || !data.session) {
      return NextResponse.json(
        { error: error?.message || 'Не удалось войти в аккаунт' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[auth/password-login] failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json(
      { error: 'Не удалось выполнить вход. Попробуйте ещё раз.' },
      { status: 500 }
    );
  }
}
