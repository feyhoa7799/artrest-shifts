'use client';

import { useEffect, useMemo, useState } from 'react';
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

type Stats = {
  totalApproved: number;
  totalHours: string;
  uniqueRestaurants: number;
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

export default function AuthGate() {
  const [loading, setLoading] = useState(true);
  const [authStep, setAuthStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [user, setUser] = useState<any>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  const phoneIsValid = useMemo(() => /^\+7\d{10}$/.test(profile.phone || ''), [profile.phone]);

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || null;
  }

  async function loadStats() {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      setStats(null);
      return;
    }

    const res = await fetch('/api/my-applications', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await res.json();
    setStats(data.stats || null);
  }

  async function loadProfile() {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      setProfile(emptyProfile);
      return;
    }

    const res = await fetch('/api/profile', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await res.json();

    if (data.profile) {
      setProfile({
        user_id: data.profile.user_id,
        email: data.profile.email,
        full_name: data.profile.full_name,
        phone: data.profile.phone || '+7',
        role: data.profile.role || '',
        home_restaurant_id: data.profile.home_restaurant_id || '',
        is_blocked: Boolean(data.profile.is_blocked),
      });
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setProfile({
        ...emptyProfile,
        user_id: user?.id || '',
        email: user?.email || '',
      });
    }
  }

  async function loadInitial() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUser(user ?? null);

    const { data: restaurantData } = await supabase
      .from('restaurants')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true });

    setRestaurants((restaurantData || []) as Restaurant[]);

    if (user) {
      await loadProfile();
      await loadStats();
    } else {
      setProfile(emptyProfile);
      setStats(null);
    }

    setProfileLoaded(true);
    setLoading(false);
  }

  useEffect(() => {
    loadInitial();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadInitial();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function sendCode() {
    if (!email) {
      alert('Введите email');
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert('Код отправлен на email');
    setAuthStep('code');
  }

  async function verifyCode() {
    if (!email || !code) {
      alert('Введите email и код');
      return;
    }

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert('Вход выполнен');
    setCode('');
    await loadInitial();
  }

  async function saveProfile() {
    if (!user) {
      alert('Сначала войдите');
      return;
    }

    if (!profile.full_name.trim()) {
      alert('Введите ФИО');
      return;
    }

    if (!phoneIsValid) {
      alert('Телефон должен быть в формате +7XXXXXXXXXX');
      return;
    }

    if (!profile.role) {
      alert('Выберите должность');
      return;
    }

    if (!profile.home_restaurant_id) {
      alert('Выберите домашний ресторан');
      return;
    }

    setSaving(true);

    const accessToken = await getAccessToken();

    if (!accessToken) {
      setSaving(false);
      alert('Сессия не найдена');
      return;
    }

    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        full_name: profile.full_name.trim(),
        phone: profile.phone.trim(),
        role: profile.role,
        home_restaurant_id: Number(profile.home_restaurant_id),
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      alert(data.error || 'Ошибка сохранения профиля');
      return;
    }

    if (data.profile) {
      setProfile({
        user_id: data.profile.user_id,
        email: data.profile.email,
        full_name: data.profile.full_name,
        phone: data.profile.phone || '+7',
        role: data.profile.role || '',
        home_restaurant_id: data.profile.home_restaurant_id || '',
        is_blocked: Boolean(data.profile.is_blocked),
      });
    }

    await loadStats();
    alert('Профиль сохранен');
  }

  async function logout() {
    await supabase.auth.signOut();
    setAuthStep('email');
    setEmail('');
    setCode('');
    await loadInitial();
  }

  const profileReady =
    !!user &&
    !!profile.full_name &&
    !!profile.role &&
    !!profile.home_restaurant_id &&
    /^\+7\d{10}$/.test(profile.phone || '');

  if (loading || !profileLoaded) {
    return (
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <p className="text-sm text-gray-500">Загрузка авторизации...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Вход сотрудника</h2>

        {authStep === 'email' ? (
          <div className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border p-3"
            />
            <button
              onClick={sendCode}
              className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600"
            >
              Получить код на email
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border p-3"
            />
            <input
              type="text"
              placeholder="Код из письма"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border p-3"
            />
            <div className="flex gap-2">
              <button
                onClick={verifyCode}
                className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600"
              >
                Войти
              </button>
              <button
                onClick={() => setAuthStep('email')}
                className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Назад
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Профиль сотрудника</h2>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>

        <button
          onClick={logout}
          className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Выйти
        </button>
      </div>

      {profile.is_blocked && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Ваш профиль заблокирован. Обратитесь к HR BP.
        </div>
      )}

      {!profileReady && !profile.is_blocked && (
        <div className="mb-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
          Заполни профиль до конца. Без этого нельзя отправлять отклики.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ФИО</label>
          <input
            value={profile.full_name}
            onChange={(e) =>
              setProfile((prev) => ({ ...prev, full_name: e.target.value }))
            }
            className="w-full rounded-lg border p-3"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Телефон РФ
          </label>
          <input
            placeholder="+7XXXXXXXXXX"
            value={profile.phone}
            onChange={(e) =>
              setProfile((prev) => ({
                ...prev,
                phone: normalizeRussianPhoneInput(e.target.value),
              }))
            }
            className="w-full rounded-lg border p-3"
          />
          <p className="mt-1 text-xs text-gray-500">
            Формат: +7 и 10 цифр
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Должность
          </label>
          <select
            value={profile.role}
            onChange={(e) =>
              setProfile((prev) => ({ ...prev, role: e.target.value }))
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
                home_restaurant_id: Number(e.target.value),
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
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={saveProfile}
          disabled={saving || profile.is_blocked}
          className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-60"
        >
          {saving ? 'Сохраняю...' : 'Сохранить профиль'}
        </button>
      </div>

      {stats && (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-sm text-gray-500">Подтвержденных смен</p>
            <p className="text-2xl font-semibold">{stats.totalApproved}</p>
          </div>

          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-sm text-gray-500">Отработано часов</p>
            <p className="text-2xl font-semibold">{stats.totalHours}</p>
          </div>

          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-sm text-gray-500">Ресторанов посещено</p>
            <p className="text-2xl font-semibold">{stats.uniqueRestaurants}</p>
          </div>
        </div>
      )}
    </div>
  );
}