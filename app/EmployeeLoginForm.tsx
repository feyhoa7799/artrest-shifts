'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function EmployeeLoginForm() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const sendMagicLink = async () => {
    setError('');
    // Проверяем формат телефона РФ
    if (!/^\+7\d{10}$/.test(phone)) {
      setError('Неверный формат телефона. Используйте +7XXXXXXXXXX');
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
    });

    if (error) setError(error.message);
    else setCodeSent(true);
  };

  return (
    <div className="max-w-md mx-auto mt-12 p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Авторизация сотрудника</h2>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {!codeSent ? (
        <>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 mb-2 border rounded"
          />
          <input
            type="tel"
            placeholder="Телефон +7XXXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full p-2 mb-4 border rounded"
          />
          <button
            onClick={sendMagicLink}
            className="w-full py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Отправить код на Email
          </button>
        </>
      ) : (
        <div>Проверьте email, чтобы войти</div>
      )}
    </div>
  );
}