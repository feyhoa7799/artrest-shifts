import type { Metadata } from 'next';
import ErrorReporter from '@/app/components/ErrorReporter';
import './globals.css';

export const metadata: Metadata = {
  title: 'Подработки в Rostic’s',
  description: 'Сервис подработок для сотрудников',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <ErrorReporter />
        {children}
      </body>
    </html>
  );
}