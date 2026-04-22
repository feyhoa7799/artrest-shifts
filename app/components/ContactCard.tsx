import Link from 'next/link';

export default function ContactCard() {
  const botUsername = (process.env.TELEGRAM_BOT_USERNAME || '')
    .trim()
    .replace(/^@/, '');
  const botUrl = botUsername ? `https://t.me/${botUsername}` : null;

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-2xl font-semibold text-gray-900">Обратная связь</h2>
      <p className="mb-5 text-sm text-gray-600">
        Если есть вопросы по откликам, отменам, подтверждённым сменам или работе
        платформы, напишите нам.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-gray-50 p-4">
          <div className="mb-1 text-sm text-gray-500">Email</div>
          <a
            href="mailto:hr@akrussia.com"
            className="font-medium text-red-600 hover:underline"
          >
            hr@akrussia.com
          </a>
        </div>

        <div className="rounded-xl bg-gray-50 p-4">
          <div className="mb-1 text-sm text-gray-500">Telegram-бот помощник</div>
          {botUrl ? (
            <Link
              href={botUrl}
              target="_blank"
              className="font-medium text-red-600 hover:underline"
            >
              @{botUsername}
            </Link>
          ) : (
            <div className="font-medium text-gray-400">Будет добавлен позже</div>
          )}
        </div>
      </div>
    </section>
  );
}