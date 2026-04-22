'use client';

import { useState } from 'react';

import { supabase } from '@/lib/supabase';

type ApplyButtonProps = {
  slotId: number;
};

export default function ApplyButton({ slotId }: ApplyButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleApply() {
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        alert('Сначала войдите в аккаунт и заполните профиль сотрудника.');
        return;
      }

      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ slotId }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || 'Не удалось отправить отклик');
        return;
      }

      alert('Отклик отправлен. Теперь он появится в разделе «Мои отклики».');
      window.location.href = '/my-applications';
    } catch {
      alert('Ошибка сети. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleApply}
      disabled={loading}
      className="w-full rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? 'Отправка...' : 'Откликнуться'}
    </button>
  );
}