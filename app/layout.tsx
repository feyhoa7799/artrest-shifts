import type { Metadata, Viewport } from 'next';

import ErrorReporter from './components/ErrorReporter';
import MobileBottomNav from './components/MobileBottomNav';
import './globals.css';

export const metadata: Metadata = {
  title: 'Подработки в ROSTIC’S',
  description: 'Удобный сервис подработок для сотрудников Арт Рест',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="bg-[#f6f7f8] text-gray-900 antialiased">
        <ErrorReporter />
        <div className="min-h-screen pb-24 md:pb-0">{children}</div>
        <MobileBottomNav />
      </body>
    </html>
  );
}