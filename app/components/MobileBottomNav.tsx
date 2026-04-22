'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function itemClass(active: boolean) {
  return active ? 'text-red-600' : 'text-gray-500';
}

export default function MobileBottomNav() {
  const pathname = usePathname();

  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/reset-password')
  ) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-3xl grid-cols-3">
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 px-3 py-3 text-xs font-medium ${itemClass(
            pathname === '/'
          )}`}
        >
          <span>Главная</span>
        </Link>

        <Link
          href="/slots"
          className={`flex flex-col items-center gap-1 px-3 py-3 text-xs font-medium ${itemClass(
            pathname.startsWith('/slots') || pathname.startsWith('/restaurants')
          )}`}
        >
          <span>Смены</span>
        </Link>

        <Link
          href="/my-applications"
          className={`flex flex-col items-center gap-1 px-3 py-3 text-xs font-medium ${itemClass(
            pathname.startsWith('/my-applications')
          )}`}
        >
          <span>Отклики</span>
        </Link>
      </div>
    </nav>
  );
}