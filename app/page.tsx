import Image from 'next/image';
import { Suspense } from 'react';
import ContactCard from '@/app/components/ContactCard';
import AuthGate from '@/app/components/AuthGate';

function AuthGateFallback() {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      Загрузка...
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="mx-auto max-w-6xl p-6">
        <div className="relative mb-6 overflow-hidden rounded-[28px] bg-red-600 text-white shadow-lg">
          <div className="absolute inset-0">
            <Image
              src="/brand/rostics-team-hero.jpg"
              alt="Команда ROSTIC'S"
              fill
              sizes="(max-width: 768px) 100vw, 1200px"
              className="object-cover opacity-35"
              priority
            />
          </div>

          <div className="relative grid gap-6 p-8 md:grid-cols-[1.15fr_0.85fr] md:p-10">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/90">
                АртРест × ROSTIC’S
              </p>

              <h1 className="mb-3 text-3xl font-bold md:text-5xl">
                Подработки рядом с домом
              </h1>

              <p className="max-w-2xl text-white/90">
                Сервис помогает сотрудникам быстро находить открытые смены в ресторанах,
                откликаться на них и отслеживать свои заявки в одном личном кабинете.
              </p>

              <div className="mt-4 max-w-2xl text-sm text-white/90">
                Зарегистрируйтесь один раз, подтвердите почту, задайте пароль и заполните профиль.
                После этого вы сможете входить по email и паролю, без постоянных писем на почту.
              </div>
            </div>

            <div className="rounded-2xl bg-white/95 p-4 text-gray-900 backdrop-blur">
              <ContactCard />
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <Suspense fallback={<AuthGateFallback />}>
              <AuthGate />
            </Suspense>

            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold">Как всё работает</h2>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <div className="mb-2 text-2xl">1</div>
                  <h3 className="mb-2 font-semibold">Регистрация или вход</h3>
                  <p className="text-sm text-gray-600">
                    Зарегистрируйтесь по email или войдите в существующий аккаунт.
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <div className="mb-2 text-2xl">2</div>
                  <h3 className="mb-2 font-semibold">Профиль сотрудника</h3>
                  <p className="text-sm text-gray-600">
                    Укажите ФИО, телефон, должность и домашний ресторан.
                  </p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <div className="mb-2 text-2xl">3</div>
                  <h3 className="mb-2 font-semibold">Смены и отклики</h3>
                  <p className="text-sm text-gray-600">
                    Выбирайте подходящие смены, отправляйте отклик и отслеживайте статус заявки.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold">Для кого этот сервис</h2>
              <p className="text-sm text-gray-600">
                Для сотрудников компании Арт Рест, которые хотят брать дополнительные смены в удобных ресторанах
                и видеть все свои отклики в одном месте.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}