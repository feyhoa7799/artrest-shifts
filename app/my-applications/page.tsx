import Link from 'next/link';
import MyApplications from '@/app/components/MyApplications';

export default function MyApplicationsPage() {
  return (
    <main className="min-h-screen bg-[#fafafa] p-6">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="mb-4 inline-flex items-center text-sm font-medium text-red-600 hover:underline"
        >
          ← На главную
        </Link>

        <MyApplications />
      </div>
    </main>
  );
}