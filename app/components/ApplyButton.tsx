'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type ApplyButtonProps = {
  slotId: number;
  disabled?: boolean;
};

async function readJsonSafe(res: Response) {
  const text = await res.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function ApplyButton({ slotId, disabled = false }: ApplyButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleApply() {
    if (loading || disabled) return;

    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        alert('Сначала войдите в личный кабинет');
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

      const data = await readJsonSafe(res);

      if (!res.ok) {
        alert(data?.error || 'Не удалось отправить отклик');
        return;
      }

      setSuccess(true);
      router.refresh();
    } catch {
      alert('Ошибка сети при отправке отклика');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <span className="inline-flex items-center rounded-lg bg-green-100 px-4 py-2 text-sm font-medium text-green-700">
        Отклик отправлен
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleApply}
      disabled={loading || disabled}
      className="inline-flex items-center rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? 'Отправляю...' : 'Откликнуться'}
    </button>
  );
}