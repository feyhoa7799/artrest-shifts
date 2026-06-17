import Link from 'next/link';

import AdminDashboard from './AdminDashboard';

type SearchParams = Promise<{
  tab?: string;
  q?: string;
  restaurant?: string;
  from?: string;
  to?: string;
  edit?: string;
}>;

export default async function AdminPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;

  return (
    <>
      <div className="bg-[#fafafa] px-6 pt-6">
        <div className="mx-auto max-w-7xl">
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-red-600 hover:underline"
          >
            ← На главную
          </Link>
        </div>
      </div>

      <AdminDashboard initialSearchParams={searchParams} />
    </>
  );
}
