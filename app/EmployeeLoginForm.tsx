'use client';

import { FormEvent, useState } from 'react';
import Turnstile from 'react-turnstile';
import { supabase } from '@/lib/supabase';

export default function EmployeeLoginForm() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaKey((prev) => prev + 1);
  };

  const validatePhone = (value: string) => /^\+7\d{10}$/.test(value);

  const sendMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!email.trim()) {
      setError('Укажите email');
      return;
    }

    if (!validatePhone(phone)) {
      setError('Неверный формат телефона. Используйте +7XXXXXXXXXX');
      return;
    }

    if (!captchaToken) {
      setError('Подтвердите, что вы не робот');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          captchaToken,
        },
      });

      if (error) {
        setError(error.message);
        resetCaptcha();
        return;
      }

      setCodeSent(true);
      setSuccessMessage('Письмо отправлено. Проверьте email, чтобы войти.');
      resetCaptcha();
    } catch {
      setError('Не удалось отправить код. Попробуйте ещё раз.');
      resetCaptcha();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-md">
      <h2 className="mb-4 text-2xl font-bold text-gray-900">
        Авторизация сотрудника TEST123
      </h2>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      ) : null}

      {!codeSent ? (
        <form onSubmit={sendMagicLink} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              placeholder="example@mail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-3 outline-none transition focus:border-black"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Телефон
            </label>
            <input
              type="tel"
              placeholder="+79991234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-3 outline-none transition focus:border-black"
              autoComplete="tel"
              required
            />
          </div>

          <div className="pt-1">
            <div className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              TURNSTILE KEY: {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? 'ЕСТЬ' : 'НЕТ'}
            </div>
            <Turnstile
              key={captchaKey}
              sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''}
              onVerify={(token) => {
                setCaptchaToken(token);
                setError('');
              }}
              onExpire={() => {
                setCaptchaToken(null);
              }}
              onError={() => {
                setCaptchaToken(null);
                setError('Ошибка проверки CAPTCHA. Попробуйте ещё раз.');
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !captchaToken}
            className="w-full rounded-lg bg-black px-4 py-3 text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Отправка...' : 'Отправить код на Email'}
          </button>
        </form>
      ) : (
        <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
          Проверьте email, чтобы войти в систему.
        </div>
      )}
    </div>
  );
}