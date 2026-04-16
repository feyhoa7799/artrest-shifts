export type PasswordValidationResult = {
  valid: boolean;
  errors: string[];
};

const COMMON_WEAK_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  '00000000',
  'qwerty123',
  'password',
  'password123',
  'asdfghjk',
  'qwertyui',
  'qwertyuiop',
  'admin123',
]);

export function validatePasswordStrength(
  password: string,
  email?: string
): PasswordValidationResult {
  const errors: string[] = [];
  const normalized = password.trim();
  const lowered = normalized.toLowerCase();
  const emailLower = (email || '').trim().toLowerCase();

  if (normalized.length < 8) {
    errors.push('Минимум 8 символов');
  }

  if (!/[a-z]/.test(normalized)) {
    errors.push('Добавьте строчную латинскую букву');
  }

  if (!/[A-Z]/.test(normalized)) {
    errors.push('Добавьте заглавную латинскую букву');
  }

  if (!/\d/.test(normalized)) {
    errors.push('Добавьте хотя бы одну цифру');
  }

  if (COMMON_WEAK_PASSWORDS.has(lowered)) {
    errors.push('Пароль слишком простой');
  }

  if (/^(.)\1+$/.test(normalized)) {
    errors.push('Пароль не должен состоять из одного повторяющегося символа');
  }

  if (emailLower) {
    const emailName = emailLower.split('@')[0] || '';

    if (emailLower && lowered.includes(emailLower)) {
      errors.push('Пароль не должен содержать email целиком');
    }

    if (emailName && emailName.length >= 4 && lowered.includes(emailName)) {
      errors.push('Пароль не должен содержать заметную часть email');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}