'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

type ApplyButtonProps = {
  slotId: number;
};

export default function ApplyButton({ slotId }: ApplyButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleApply = async () => {
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        alert('Сначала войдите через email и заполните профиль');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          slotId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Ошибка при отправке отклика');
        setLoading(false);
        return;
      }

      alert('Отклик отправлен');
      window.location.reload();
    } catch {
      alert('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleApply}
      disabled={loading}
      className="mt-3 rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-50"
    >
      {loading ? 'Отправка...' : 'Откликнуться'}
    </button>
  );
}