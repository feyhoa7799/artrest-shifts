'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  active: boolean;
};

function itemClass(active: boolean, pending: boolean) {
  if (pending) {
    return 'bg-red-500 text-white shadow-md scale-[0.98]';
  }

  if (active) {
    return 'bg-red-50 text-red-600 shadow-sm';
  }

  return 'bg-transparent text-gray-500 active:bg-gray-100 active:scale-[0.98]';
}

export default function MobileBottomNav() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/reset-password')
  ) {
    return null;
  }

  const items: NavItem[] = [
    {
      href: '/',
      label: 'Главная',
      icon: '⌂',
      active: pathname === '/',
    },
    {
      href: '/slots',
      label: 'Смены',
      icon: '◷',
      active: pathname.startsWith('/slots') || pathname.startsWith('/restaurants'),
    },
    {
      href: '/my-applications',
      label: 'Отклики',
      icon: '✓',
      active: pathname.startsWith('/my-applications'),
    },
    {
      href: '/profile',
      label: 'Профиль',
      icon: '●',
      active: pathname.startsWith('/profile'),
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1.5">
        {items.map((item) => {
          const pending = pendingHref === item.href;

          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              onPointerDown={() => setPendingHref(item.href)}
              onClick={() => setPendingHref(item.href)}
              className={`flex min-h-[66px] touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl px-1.5 py-2 text-center text-[11px] font-semibold transition duration-150 ${itemClass(
                item.active,
                pending
              )}`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className="leading-none">
                {pending ? 'Открываю...' : item.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}