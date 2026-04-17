import Link from 'next/link';

import MyApplications from '@/app/components/MyApplications';

export default function MyApplicationsPage() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← На главную
        </Link>
      </div>

      <MyApplications />
    </div>
  );
}