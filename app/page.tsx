import { Suspense } from 'react';

import HomeAuthGate from '@/app/components/HomeAuthGate';
import ContactCard from '@/app/components/ContactCard';

function AuthGateFallback() {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      Загрузка...
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="max-w-3xl">
          <div className="mb-2 text-sm font-medium text-red-600">
            Арт Рест · ROSTIC’S
          </div>

          <h1 className="mb-3 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            Подработки рядом с домом
          </h1>

          <p className="max-w-2xl text-base leading-7 text-gray-600">
            Платформа помогает быстро найти открытую смену, откликнуться на неё и не
            потерять подтверждённые выходы. Всё важное теперь на одном экране и в
            понятной последовательности.
          </p>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-red-50 p-4">
            <div className="mb-1 text-sm font-semibold text-red-700">1. Войдите</div>
            <div className="text-sm text-gray-700">
              Зарегистрируйтесь или войдите по email.
            </div>
          </div>

          <div className="rounded-2xl bg-red-50 p-4">
            <div className="mb-1 text-sm font-semibold text-red-700">2. Заполните профиль</div>
            <div className="text-sm text-gray-700">
              Укажите ФИО, телефон, должность и домашний ресторан.
            </div>
          </div>

          <div className="rounded-2xl bg-red-50 p-4">
            <div className="mb-1 text-sm font-semibold text-red-700">3. Выберите смену</div>
            <div className="text-sm text-gray-700">
              Посмотрите доступные рестораны, отправьте отклик и отслеживайте статус.
            </div>
          </div>
        </div>
      </section>

      <Suspense fallback={<AuthGateFallback />}>
        <HomeAuthGate />
      </Suspense>

      <ContactCard />
    </main>
  );
}
