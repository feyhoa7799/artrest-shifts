export default function ContactCard() {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold">Связь с администратором</h2>
      <p className="text-sm text-gray-700">
        По вопросам подработок можно связаться с HR BP.
      </p>

      <div className="mt-3 space-y-2 text-sm text-gray-700">
        <p>
          👤 <span className="font-medium">Баткаев Алмаз</span>
        </p>
        <p>
          🧑‍💼 HR BP
        </p>
        <p>
          📞{' '}
          <a href="tel:+79068159014" className="text-red-600 hover:underline">
            +7 906 815-90-14
          </a>
        </p>
      </div>
    </div>
  );
}