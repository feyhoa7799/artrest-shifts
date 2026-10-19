type PasswordAuthAction = 'login' | 'recovery';

const invalidCredentialsMessage =
  'Неверный email или пароль. Если забыли пароль, восстановите его через «Забыли пароль?».';

export function getPasswordAuthErrorMessage(
  error: unknown,
  action: PasswordAuthAction = 'login'
): string {
  const details =
    error && typeof error === 'object'
      ? (error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown })
      : {};
  const code = typeof details.code === 'string' ? details.code : '';

  switch (code) {
    case 'invalid_credentials':
    case 'user_not_found':
      if (action === 'login') return invalidCredentialsMessage;
      break;
    case 'email_not_confirmed':
      return 'Email ещё не подтверждён. Подтвердите его с помощью кода из письма.';
    case 'user_banned':
      return 'Доступ к аккаунту ограничен. Обратитесь к администратору.';
    case 'over_request_rate_limit':
      return 'Слишком много попыток. Подождите несколько минут и попробуйте снова.';
    case 'over_email_send_rate_limit':
      return 'Письма запрашиваются слишком часто. Подождите несколько минут и попробуйте снова.';
    case 'email_address_invalid':
      return 'Проверьте правильность email и попробуйте снова.';
    case 'session_not_found':
    case 'session_expired':
    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
    case 'bad_jwt':
      return 'Не удалось подтвердить сеанс. Повторите вход в аккаунт.';
    case 'request_timeout':
      return 'Сервер не ответил вовремя. Попробуйте ещё раз.';
  }

  if (details.status === 429) {
    return 'Слишком много попыток. Подождите несколько минут и попробуйте снова.';
  }

  // Older Auth versions can return these errors without a machine-readable code.
  const message = typeof details.message === 'string' ? details.message.trim() : '';
  if (!code && action === 'login' && /^invalid login credentials\.?$/i.test(message)) {
    return invalidCredentialsMessage;
  }
  if (!code && /^email not confirmed\.?$/i.test(message)) {
    return 'Email ещё не подтверждён. Подтвердите его с помощью кода из письма.';
  }
  if (
    details.name === 'AuthRetryableFetchError' ||
    /^(failed to fetch|fetch failed|load failed|network request failed)$/i.test(message)
  ) {
    return 'Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.';
  }

  // Never expose raw provider messages, which may be English or contain internals.
  return action === 'recovery'
    ? 'Не удалось отправить письмо для восстановления пароля. Попробуйте позже.'
    : 'Не удалось войти в аккаунт. Попробуйте позже.';
}
