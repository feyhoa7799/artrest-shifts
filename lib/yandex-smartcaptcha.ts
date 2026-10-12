import type { NextRequest } from 'next/server';

const SMARTCAPTCHA_VALIDATE_URL =
  'https://smartcaptcha.cloud.yandex.ru/validate';
const TOKEN_MAX_LENGTH = 16_384;

type SmartCaptchaResponse = {
  status?: unknown;
  message?: unknown;
  host?: unknown;
};

export type SmartCaptchaValidationResult =
  | { ok: true; host: string | null }
  | { ok: false; reason: 'invalid' | 'unavailable' | 'not_configured' };

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const candidate = forwardedFor?.split(',')[0]?.trim();

  if (!candidate || candidate.length > 64 || /[\r\n]/.test(candidate)) {
    return null;
  }

  return candidate;
}

export async function validateSmartCaptcha(
  request: NextRequest,
  token: unknown
): Promise<SmartCaptchaValidationResult> {
  const serverKey = process.env.YANDEX_SMARTCAPTCHA_SERVER_KEY?.trim();

  if (!serverKey) {
    console.error('[smartcaptcha] server key is not configured');
    return { ok: false, reason: 'not_configured' };
  }

  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > TOKEN_MAX_LENGTH
  ) {
    return { ok: false, reason: 'invalid' };
  }

  const body = new URLSearchParams({
    secret: serverKey,
    token,
  });
  const clientIp = getClientIp(request);

  if (clientIp) {
    body.set('ip', clientIp);
  }

  try {
    const response = await fetch(SMARTCAPTCHA_VALIDATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });

    if (!response.ok) {
      console.error('[smartcaptcha] validation service returned an error', {
        status: response.status,
      });
      return { ok: false, reason: 'unavailable' };
    }

    const result = (await response.json()) as SmartCaptchaResponse;

    if (result.status !== 'ok') {
      return { ok: false, reason: 'invalid' };
    }

    return {
      ok: true,
      host: typeof result.host === 'string' ? result.host : null,
    };
  } catch (error) {
    console.error('[smartcaptcha] validation request failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return { ok: false, reason: 'unavailable' };
  }
}
