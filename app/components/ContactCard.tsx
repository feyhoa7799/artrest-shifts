import Link from 'next/link';

export default function ContactCard() {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold">Обратная связь</h2>

      <p className="mb-4 text-sm text-gray-600">
        Если у вас есть вопросы, предложения или замечания по работе сервиса подработок,
        напишите нам.
      </p>

      <div className="space-y-3 text-sm text-gray-700">
        <div>
          <div className="font-medium text-gray-900">Email</div>
          <a
            href="mailto:hr@akrussia.com"
            className="text-red-600 hover:underline"
          >
            hr@akrussia.com
            @voice_ar_bot
          </a>
        </div>
      </div>
    </div>
  );
}