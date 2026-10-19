import assert from 'node:assert/strict';

import { getPasswordAuthErrorMessage } from '../lib/auth-error-messages';

const invalidCredentials = getPasswordAuthErrorMessage({ code: 'invalid_credentials' });
assert.match(invalidCredentials, /Неверный email или пароль/);
assert.match(invalidCredentials, /Забыли пароль\?/);
assert.equal(
  getPasswordAuthErrorMessage({ code: 'user_not_found' }),
  invalidCredentials,
  'Login must not distinguish an unknown email from a wrong password'
);
assert.equal(
  getPasswordAuthErrorMessage({ message: 'Invalid login credentials' }),
  invalidCredentials,
  'Legacy errors without a code must also be translated'
);
assert.match(
  getPasswordAuthErrorMessage({ code: 'email_not_confirmed' }),
  /Email ещё не подтверждён/
);
assert.match(
  getPasswordAuthErrorMessage({ message: 'Email not confirmed' }),
  /Email ещё не подтверждён/
);
assert.match(getPasswordAuthErrorMessage({ code: 'user_banned' }), /Обратитесь к администратору/);
assert.match(getPasswordAuthErrorMessage({ code: 'over_request_rate_limit' }), /Слишком много попыток/);
assert.match(getPasswordAuthErrorMessage({ status: 429 }), /Слишком много попыток/);
assert.match(
  getPasswordAuthErrorMessage({ code: 'over_email_send_rate_limit' }, 'recovery'),
  /Письма запрашиваются слишком часто/
);
assert.match(getPasswordAuthErrorMessage({ code: 'email_address_invalid' }), /правильность email/);
assert.match(getPasswordAuthErrorMessage({ code: 'request_timeout' }), /Сервер не ответил вовремя/);
assert.match(getPasswordAuthErrorMessage(new TypeError('Failed to fetch')), /Проверьте соединение/);
assert.match(
  getPasswordAuthErrorMessage({ name: 'AuthRetryableFetchError' }),
  /Не удалось связаться с сервером/
);

for (const code of [
  'session_not_found', 'session_expired', 'refresh_token_not_found',
  'refresh_token_already_used', 'bad_jwt',
]) {
  const message = getPasswordAuthErrorMessage({ code });
  assert.match(message, /Повторите вход/);
  assert.doesNotMatch(message, /Неверный email или пароль/);
}

for (const error of [
  null, undefined, 'Unexpected English error', { message: 'Database error: internal details' },
  { code: 'new_unknown_error', message: 'Sensitive provider details' }, { status: 503 },
]) {
  assert.equal(getPasswordAuthErrorMessage(error), 'Не удалось войти в аккаунт. Попробуйте позже.');
  assert.equal(
    getPasswordAuthErrorMessage(error, 'recovery'),
    'Не удалось отправить письмо для восстановления пароля. Попробуйте позже.'
  );
}
assert.equal(
  getPasswordAuthErrorMessage({ code: 'user_not_found' }, 'recovery'),
  'Не удалось отправить письмо для восстановления пароля. Попробуйте позже.'
);
assert.equal(
  getPasswordAuthErrorMessage({ code: 'request_timeout', message: 'Invalid login credentials' }),
  'Сервер не ответил вовремя. Попробуйте ещё раз.',
  'Machine-readable codes take precedence over message matching'
);

console.log('Password auth error message checks passed');
