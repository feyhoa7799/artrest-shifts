type AuthApiError = {
  error?: unknown;
};

type PasswordLoginResponse = {
  access_token: string;
  refresh_token: string;
};

async function postAuthRequest<T>(path: string, body: Record<string, string>) {
  let response: Response;

  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Не удалось связаться с сервером. Попробуйте ещё раз.');
  }

  const payload = (await response.json().catch(() => ({}))) as T & AuthApiError;

  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : 'Не удалось выполнить запрос. Попробуйте ещё раз.'
    );
  }

  return payload;
}

export function sendRegistrationCode(email: string, captchaToken: string) {
  return postAuthRequest<{ success: true }>('/api/auth/registration-code', {
    email,
    captchaToken,
  });
}

export function loginWithPassword(
  email: string,
  password: string,
  captchaToken: string
) {
  return postAuthRequest<PasswordLoginResponse>('/api/auth/password-login', {
    email,
    password,
    captchaToken,
  });
}

export function sendPasswordRecovery(email: string, captchaToken: string) {
  return postAuthRequest<{ success: true }>('/api/auth/password-recovery', {
    email,
    captchaToken,
  });
}
