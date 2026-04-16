'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { validatePasswordStrength } from '@/lib/password';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const passwordCheck = useMemo(
    () => validatePasswordStrength(password),
    [password]
  );

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted && session) {
        setReady(true);
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setReady(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSave() {
    setError('');
    setNotice('');

    if (!ready) {
      setError('Ссылка для восстановления ещё не подтверждена');
      return;
    }

    if (password !== passwordRepeat) {
      setError('Новые пароли не совпадают');
      return;
    }

    if (!passwordCheck.valid) {
      setError(passwordCheck.errors[0] || 'Пароль слишком простой');
      return;
    }

    setSaving(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      await fetch('/api/session-flags/clear', {
        method: 'POST',
      });

      await supabase.auth.signOut();

      setNotice('Пароль обновлён. Теперь войдите в аккаунт по email и паролю.');

      setTimeout(() => {
        router.push('/?auth=login&reset=1');
      }, 1200);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fafafa] p-6">
      <div className="mx-auto max-w-xl rounded-2xl border bg-white p-6 shadow-sm">
        <Link
          href="/"
          className="mb-4 inline-flex items-center text-sm font-medium text-red-600 hover:underline"
        >
          ← На главную
        </Link>

        <h1 className="mb-2 text-2xl font-semibold">Восстановление пароля</h1>
        <p className="mb-5 text-sm text-gray-600">
          Задайте новый пароль для входа в аккаунт.
        </p>

        {notice && (
          <div className="mb-4 rounded-xl bg-green-50 p-4 text-sm text-green-700">
            {notice}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!ready && (
          <div className="mb-4 rounded-xl bg-yellow-50 p-4 text-sm text-yellow-700">
            Откройте страницу по ссылке из письма для восстановления пароля.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Новый пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border p-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Повторите новый пароль
            </label>
            <input
              type="password"
              value={passwordRepeat}
              onChange={(e) => setPasswordRepeat(e.target.value)}
              className="w-full rounded-lg border p-3"
            />
          </div>

          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            <p className="mb-2 font-medium">Требования к паролю:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>минимум 8 символов</li>
              <li>минимум 1 заглавная латинская буква</li>
              <li>минимум 1 строчная латинская буква</li>
              <li>минимум 1 цифра</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={!ready || saving}
            className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Сохраняю...' : 'Сохранить новый пароль'}
          </button>
        </div>
      </div>
    </main>
  );
}