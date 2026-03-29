'use client';

import { useState } from 'react';

type ApplyButtonProps = {
  slotId: number;
};

export default function ApplyButton({ slotId }: ApplyButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleApply = async () => {
    setLoading(true);

    try {
      const stored = localStorage.getItem('userData');

      if (!stored) {
        alert('Сначала заполните профиль');
        return;
      }

      const user = JSON.parse(stored);

      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slotId,
          fullName: user.fullName,
          homeRestaurant: user.homeRestaurant,
          contact: user.contact,
          comment: user.comment || '',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Ошибка при отправке отклика');
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