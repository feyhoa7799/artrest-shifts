'use client';

import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { validatePasswordStrength } from '@/lib/password';

type ChangePasswordFormProps = {
  email?: string;
};

export default function ChangePasswordForm({ email }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordRepeat, setNewPasswordRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const passwordCheck = useMemo(
    () => validatePasswordStrength(newPassword, email),
    [newPassword, email]
  );

  async function handleSubmit() {
    setNotice('');
    setError('');

    if (!currentPassword || !newPassword || !newPasswordRepeat) {
      setError('Заполните все поля');
      return;
    }

    if (newPassword !== newPasswordRepeat) {
      setError('Новые пароли не совпадают');
      return;
    }

    if (currentPassword === newPassword) {
      setError('Новый пароль должен отличаться от текущего');
      return;
    }

    if (!passwordCheck.valid) {
      setError(passwordCheck.errors[0] || 'Пароль слишком простой');
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const actualEmail = user?.email;

      if (!actualEmail) {
        setError('Не удалось определить email пользователя');
        return;
      }

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: actualEmail,
        password: currentPassword,
      });

      if (reauthError) {
        setError('Текущий пароль введён неверно');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordRepeat('');
      setNotice('Пароль успешно изменён');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-gray-50 p-5">
      <h3 className="mb-2 text-lg font-semibold">Изменить пароль</h3>
      <p className="mb-4 text-sm text-gray-600">
        Укажите текущий пароль и дважды введите новый.
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

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Текущий пароль
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-lg border p-3"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Новый пароль
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg border p-3"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Повторите новый пароль
          </label>
          <input
            type="password"
            value={newPasswordRepeat}
            onChange={(e) => setNewPasswordRepeat(e.target.value)}
            className="w-full rounded-lg border p-3"
          />
        </div>

        <div className="rounded-xl bg-white p-4 text-sm text-gray-700">
          <p className="mb-2 font-medium">Требования к паролю:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>минимум 8 символов</li>
            <li>минимум 1 заглавная латинская буква</li>
            <li>минимум 1 строчная латинская буква</li>
            <li>минимум 1 цифра</li>
          </ul>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Сохраняю...' : 'Сменить пароль'}
        </button>
      </div>
    </div>
  );
}