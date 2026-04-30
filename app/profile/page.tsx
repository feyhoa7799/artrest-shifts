import ProfilePageClient from '@/app/components/ProfilePageClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ProfilePage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <ProfilePageClient />
    </main>
  );
}