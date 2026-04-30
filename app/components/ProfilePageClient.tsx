'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import ChangePasswordForm from '@/app/components/ChangePasswordForm';
import TelegramLinkCard, {
  type TelegramStatus,
} from '@/app/components/TelegramLinkCard';
import { supabase } from '@/lib/supabase';

const ROLES = [
  'Член команды',
  'Член команды 1 уровня',
  'Тренер',
  'Младший менеджер смены',
  'Менеджер смены 1 уровня',
  'Менеджер смены 2 уровня',
  'Заместитель директора',
  'Директор',
];

type Restaurant = {
  id: number;
  name: string;
};

type Profile = {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  role: string;
  home_restaurant_id: number | '';
  is_blocked: boolean;
};

type ProfileBootstrapResponse = {
  profile?: Profile;
  restaurants?: Restaurant[];
  telegram?: TelegramStatus | null;
  error?: string;
};

const emptyProfile: Profile = {
  user_id: '',
  email: '',
  full_name: '',
  phone: '+7',
  role: '',
  home_restaurant_id: '',
  is_blocked: false,
};

function normalizeRussianPhoneInput(value: string) {
  if (!value) return '+7';

  const raw = value.replace(/\D/g, '');
  let digits = raw;

  if (digits.startsWith('8')) {
    digits = digits.slice(1);
  } else if (digits.startsWith('7')) {
    digits = digits.slice(1);
  }

  if (digits.length > 10) {
    digits = digits.slice(0, 10);
  }

  return `+7${digits}`;
}

function normalizeFullNameInput(value: string) {
  return value.replace(/[^А-Яа-яЁё\s-]/g, '');
}

function normalizeFullNameForSave(value: string) {
  return normalizeFullNameInput(value)
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim();
}

function isValidCyrillicFullName(value: string) {
  const normalized = normalizeFullNameForSave(value);

  if (!normalized) return false;
  if (normalized.length < 5) return false;

  if (!/^[А-Яа-яЁё]+(?:[\s-][А-Яа-яЁё]+)*$/.test(normalized)) {
    return false;
  }

  const words = normalized.split(/\s+/).filter(Boolean);

  return words.length >= 2;
}

function profileFingerprint(profile: Profile) {
  return JSON.stringify({
    full_name: normalizeFullNameForSave(profile.full_name),
    phone: profile.phone.trim(),
    role: profile.role,
    home_restaurant_id: profile.home_restaurant_id || '',
  });
}

async function readJsonSafe(res: Response) {
  const text = await res.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T) {
  return new Promise<T>((resolve) => {
    const timer = window.setTimeout(() => {
      resolve(fallback);
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        window.clearTimeout(timer);
        resolve(fallback);
      });
  });
}

export default function ProfilePageClient() {
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [accessToken, setAccessToken] = useState('');
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [savedProfileKey, setSavedProfileKey] = useState(
    profileFingerprint(emptyProfile)
  );
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const mountedRef = useRef(false);

  const currentProfileKey = useMemo(() => profileFingerprint(profile), [profile]);
  const profileDirty = currentProfileKey !== savedProfileKey;

  const phoneIsValid = /^\+7\d{10}$/.test(profile.phone || '');
  const fullNameIsValid = isValidCyrillicFullName(profile.full_name);

  const homeRestaurantName = restaurants.find(
    (restaurant) => restaurant.id === profile.home_restaurant_id
  )?.name;

  function showError(message: string) {
    setError(message);
    setNotice('');
  }

  function showNotice(message: string) {
    setNotice(message);
    setError('');
  }

  async function getAccessToken() {
    const emptySessionResult = {
      data: { session: null },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>;

    const {
      data: { session },
    } = await withTimeout(supabase.auth.getSession(), 5000, emptySessionResult);

    return session?.access_token || null;
  }

  async function loadBootstrap(token: string) {
    const res = await fetch('/api/profile/bootstrap', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    const data = (await readJsonSafe(res)) as ProfileBootstrapResponse | null;

    if (!res.ok || !data) {
      showError(data?.error || 'Не удалось загрузить профиль');
      return;
    }

    const loadedProfile: Profile = data.profile
      ? {
          user_id: data.profile.user_id || '',
          email: data.profile.email || '',
          full_name: data.profile.full_name || '',
          phone: data.profile.phone || '+7',
          role: data.profile.role || '',
          home_restaurant_id: data.profile.home_restaurant_id || '',
          is_blocked: Boolean(data.profile.is_blocked),
        }
      : emptyProfile;

    setProfile(loadedProfile);
    setSavedProfileKey(profileFingerprint(loadedProfile));
    setEmail(loadedProfile.email);
    setRestaurants(Array.isArray(data.restaurants) ? data.restaurants : []);
    setTelegramStatus(data.telegram || null);
  }

  async function hydrate() {
    setLoading(true);
    setError('');
    setNotice('');

    try {
      const token = await getAccessToken();

      if (!token) {
        window.location.href = '/?auth=login';
        return;
      }

      setAccessToken(token);

      await loadBootstrap(token);
    } catch {
      showError('Ошибка загрузки профиля');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }

  async function handleSaveProfile() {
    showError('');

    const fullName = normalizeFullNameForSave(profile.full_name);

    if (!fullName) {
      showError('Введите ФИО');
      return;
    }

    if (!isValidCyrillicFullName(fullName)) {
      showError('ФИО должно быть кириллицей: фамилия и имя, без латиницы и цифр');
      return;
    }

    if (!phoneIsValid) {
      showError('Телефон должен быть в формате +7XXXXXXXXXX');
      return;
    }

    if (!profile.role) {
      showError('Выберите должность');
      return;
    }

    if (!profile.home_restaurant_id) {
      showError('Выберите домашний ресторан');
      return;
    }

    setSavingProfile(true);

    try {
      const token = accessToken || (await getAccessToken());

      if (!token) {
        showError('Сессия не найдена. Войдите заново.');
        return;
      }

      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          full_name: fullName,
          phone: profile.phone.trim(),
          role: profile.role,
          home_restaurant_id: Number(profile.home_restaurant_id),
        }),
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        showError(data?.error || 'Ошибка сохранения профиля');
        return;
      }

      const savedProfile: Profile = {
        user_id: data.profile.user_id,
        email: data.profile.email,
        full_name: data.profile.full_name || '',
        phone: data.profile.phone || '+7',
        role: data.profile.role || '',
        home_restaurant_id: data.profile.home_restaurant_id || '',
        is_blocked: Boolean(data.profile.is_blocked),
      };

      setProfile(savedProfile);
      setSavedProfileKey(profileFingerprint(savedProfile));
      setEmail(savedProfile.email);
      showNotice('Профиль сохранён.');
    } catch {
      showError('Ошибка сохранения профиля');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await supabase.auth.signOut();

      await fetch('/api/session-flags/clear', {
        method: 'POST',
      });

      window.location.href = '/?auth=login';
    } finally {
      setLoggingOut(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    void hydrate();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (loading) {
    return (
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        Загрузка профиля...
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-5">
          <div className="mb-2 text-sm font-medium text-red-600">
            Личный раздел
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Профиль
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Здесь можно изменить данные профиля, пароль и выйти из аккаунта.
          </p>
        </div>

        {notice && (
          <div className="mb-4 rounded-xl bg-green-50 p-4 text-sm text-green-700">
            {notice}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {profile.is_blocked && (
          <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            Ваш профиль заблокирован. Доступ к откликам на смены ограничен.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              value={email || profile.email}
              disabled
              className="w-full rounded-lg border bg-gray-50 p-3 text-gray-600"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              ФИО
            </label>
            <input
              value={profile.full_name}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  full_name: normalizeFullNameInput(e.target.value),
                }))
              }
              onBlur={() =>
                setProfile((prev) => ({
                  ...prev,
                  full_name: normalizeFullNameForSave(prev.full_name),
                }))
              }
              className="w-full rounded-lg border p-3"
              placeholder="Иванов Иван Иванович"
            />

            {!fullNameIsValid && profile.full_name && (
              <p className="mt-1 text-xs text-red-600">
                ФИО должно быть кириллицей: фамилия и имя, без латиницы, цифр и
                спецсимволов.
              </p>
            )}

            <p className="mt-1 text-xs text-gray-500">
              Допустимы только русские буквы, пробел и дефис.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Телефон
            </label>
            <input
              value={profile.phone}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  phone: normalizeRussianPhoneInput(e.target.value),
                }))
              }
              className="w-full rounded-lg border p-3"
              placeholder="+7XXXXXXXXXX"
            />

            {!phoneIsValid && (
              <p className="mt-1 text-xs text-red-600">
                Телефон должен быть в формате +7XXXXXXXXXX.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Должность
            </label>
            <select
              value={profile.role}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  role: e.target.value,
                }))
              }
              className="w-full rounded-lg border p-3"
            >
              <option value="">Выберите должность</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Домашний ресторан
            </label>
            <select
              value={profile.home_restaurant_id}
              onChange={(e) =>
                setProfile((prev) => ({
                  ...prev,
                  home_restaurant_id: e.target.value ? Number(e.target.value) : '',
                }))
              }
              className="w-full rounded-lg border p-3"
            >
              <option value="">Выберите ресторан</option>
              {restaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>

            {homeRestaurantName && (
              <p className="mt-1 text-xs text-gray-500">
                Сейчас выбран: {homeRestaurantName}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingProfile ? 'Сохраняю...' : 'Сохранить профиль'}
            </button>

            {profileDirty && (
              <div className="text-sm text-gray-500">
                Есть несохранённые изменения
              </div>
            )}
          </div>
        </div>
      </section>

      {accessToken && (
        <TelegramLinkCard
          accessToken={accessToken}
          initialStatus={telegramStatus}
        />
      )}

      <ChangePasswordForm email={email || profile.email} />

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-xl font-semibold">Выход из аккаунта</h2>

        <p className="mb-4 text-sm text-gray-600">
          Используйте эту кнопку, если работаете не со своего устройства.
        </p>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loggingOut ? 'Выхожу...' : 'Выйти из аккаунта'}
        </button>
      </section>
    </div>
  );
}