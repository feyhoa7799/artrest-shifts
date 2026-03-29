'use client';

import { useEffect, useState } from 'react';

type UserData = {
  fullName: string;
  homeRestaurant: string;
  contact: string;
  comment: string;
};

const emptyForm: UserData = {
  fullName: '',
  homeRestaurant: '',
  contact: '',
  comment: '',
};

export default function UserForm() {
  const [form, setForm] = useState<UserData>(emptyForm);
  const [savedProfile, setSavedProfile] = useState<UserData | null>(null);
  const [isEditing, setIsEditing] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('userData');

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as UserData;
        setForm(parsed);
        setSavedProfile(parsed);
        setIsEditing(false);
      } catch {
        localStorage.removeItem('userData');
        setForm(emptyForm);
        setSavedProfile(null);
        setIsEditing(true);
      }
    }

    setIsLoaded(true);
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!form.fullName || !form.homeRestaurant || !form.contact) {
      alert('Заполни обязательные поля');
      return;
    }

    localStorage.setItem('userData', JSON.stringify(form));
    setSavedProfile(form);
    setIsEditing(false);
    alert('Профиль сохранён');
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (savedProfile) {
      setForm(savedProfile);
      setIsEditing(false);
    } else {
      setForm(emptyForm);
    }
  };

  const handleClear = () => {
    localStorage.removeItem('userData');
    setForm(emptyForm);
    setSavedProfile(null);
    setIsEditing(true);
  };

  if (!isLoaded) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-sm text-gray-500">Загрузка профиля...</p>
      </div>
    );
  }

  if (!isEditing && savedProfile) {
    return (
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Ваш профиль</h2>
            <p className="text-sm text-gray-500">
              Эти данные будут подставляться в отклик автоматически
            </p>
          </div>

          <button
            type="button"
            onClick={handleEdit}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ✏️ Редактировать
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">ФИО</p>
            <p className="mt-1 font-medium text-gray-900">{savedProfile.fullName}</p>
          </div>

          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Ваш ресторан</p>
            <p className="mt-1 font-medium text-gray-900">{savedProfile.homeRestaurant}</p>
          </div>

          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Контакт</p>
            <p className="mt-1 font-medium text-gray-900">{savedProfile.contact}</p>
          </div>

          <div className="rounded-lg bg-gray-50 p-3 sm:col-span-2">
            <p className="text-xs text-gray-500">Комментарий для менеджера</p>
            <p className="mt-1 font-medium text-gray-900">
              {savedProfile.comment || 'Не указан'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-red-600 hover:underline"
          >
            Очистить профиль
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Ваши данные</h2>
          <p className="text-sm text-gray-500">
            Заполните профиль один раз, дальше он будет использоваться в откликах
          </p>
        </div>

        {savedProfile && (
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Отмена
          </button>
        )}
      </div>

      <input
        name="fullName"
        placeholder="ФИО"
        value={form.fullName}
        onChange={handleChange}
        className="w-full rounded-lg border p-3"
      />

      <input
        name="homeRestaurant"
        placeholder="Ваш ресторан"
        value={form.homeRestaurant}
        onChange={handleChange}
        className="w-full rounded-lg border p-3"
      />

      <input
        name="contact"
        placeholder="Телефон / Telegram"
        value={form.contact}
        onChange={handleChange}
        className="w-full rounded-lg border p-3"
      />

      <textarea
        name="comment"
        placeholder="Комментарий для менеджера"
        value={form.comment}
        onChange={handleChange}
        className="w-full rounded-lg border p-3"
        rows={4}
      />

      <button className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600">
        Сохранить профиль
      </button>
    </form>
  );
}