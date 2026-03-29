'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AdminRefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRefresh = () => {
    setLoading(true);
    router.refresh();
    setTimeout(() => setLoading(false), 700);
  };

  return (
    <button
      type="button"
      onClick={handleRefresh}
      className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
    >
      {loading ? 'Обновляю...' : 'Обновить'}
    </button>
  );
}