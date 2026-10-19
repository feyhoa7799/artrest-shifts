import { NextRequest, NextResponse } from 'next/server';

import { getPasswordAuthErrorMessage } from '@/lib/auth-error-messages';
import { getSupabaseAuthServerClient } from '@/lib/supabase-auth-server';
import { validateSmartCaptcha } from '@/lib/yandex-smartcaptcha';

function getResetRedirectUrl(request: NextRequest) {
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim();
  const baseUrl = configuredBaseUrl || request.nextUrl.origin;

  return new URL('/reset-password', baseUrl).toString();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: unknown;
      captchaToken?: unknown;
    };
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    if (!email || email.length > 320) {
      return NextResponse.json({ error: 'Введите корректный email' }, { status: 400 });
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

    const { error } =
      await getSupabaseAuthServerClient().auth.resetPasswordForEmail(email, {
        redirectTo: getResetRedirectUrl(request),
      });

    if (error) {
      return NextResponse.json(
        { error: getPasswordAuthErrorMessage(error, 'recovery') },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[auth/password-recovery] failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json(
      { error: 'Не удалось отправить письмо. Попробуйте ещё раз.' },
      { status: 500 }
    );
  }
}
