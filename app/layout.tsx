import type { Metadata } from 'next';
import Script from 'next/script';
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
        <Script
          id="yandex-maps-api"
          src={`https://api-maps.yandex.ru/2.1/?apikey=${process.env.NEXT_PUBLIC_YANDEX_MAP_API_KEY}&lang=ru_RU`}
          strategy="beforeInteractive"
        />
        <ErrorReporter />
        {children}
      </body>
    </html>
  );
}
