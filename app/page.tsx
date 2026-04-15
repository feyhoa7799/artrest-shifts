import Image from 'next/image';
import Link from 'next/link';
import ContactCard from '@/app/components/ContactCard';
import AuthGate from '@/app/components/AuthGate';

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
                АртРест | ROSTIC’S
              </p>

              <h1 className="mb-3 text-3xl font-bold md:text-5xl">
                Подработки рядом с домом
              </h1>

              <p className="max-w-2xl text-white/90">
                Сначала войди по email и заполни профиль. Когда будешь готов,
                открой страницу со сменами и выбери удобный ресторан.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/slots"
                  className="inline-flex items-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                >
                  Перейти к открытым сменам
                </Link>
              </div>
            </div>

            <div className="rounded-2xl bg-white/95 p-4 text-gray-900 backdrop-blur">
              <ContactCard />
            </div>
          </div>
        </div>

        <div className="mb-6">
          <AuthGate />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">Как всё работает</h2>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="mb-2 text-2xl">1</div>
                <h3 className="mb-2 font-semibold">Вход и профиль</h3>
                <p className="text-sm text-gray-600">
                  Войди по email, проверь ФИО, телефон, должность и домашний ресторан.
                </p>
              </div>

              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="mb-2 text-2xl">2</div>
                <h3 className="mb-2 font-semibold">Список смен</h3>
                <p className="text-sm text-gray-600">
                  Открой страницу открытых смен, отфильтруй рестораны по дате, должности и метро.
                </p>
              </div>

              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="mb-2 text-2xl">3</div>
                <h3 className="mb-2 font-semibold">Карта и отклик</h3>
                <p className="text-sm text-gray-600">
                  Посмотри ресторан на карте и перейди в карточку со сменами, чтобы откликнуться.
                </p>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/slots"
                className="inline-flex items-center rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-600"
              >
                Открыть страницу смен
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold">Что важно сотруднику</h2>
              <p className="text-sm text-gray-600">
                Войдите в сервис, заполните профиль и выберите удобную смену в подходящем ресторане.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}