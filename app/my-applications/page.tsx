import Link from 'next/link';

import MyApplications from '@/app/components/MyApplications';

export default function MyApplicationsPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <Link
          href="/"
          className="inline-flex rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← На главную
        </Link>
      </div>

      <MyApplications />
    </main>
  );
}