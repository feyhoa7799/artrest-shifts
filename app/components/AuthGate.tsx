'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import MyApplications from '@/app/components/MyApplications';

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

function profileFingerprint(profile: Profile) {
  return JSON.stringify({
    full_name: profile.full_name.trim(),
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

export default function AuthGate() {
  const [loading, setLoading] = useState(true);
  const [authStep, setAuthStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailSentTo, setEmailSentTo] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [savedProfileKey, setSavedProfileKey] = useState(profileFingerprint(emptyProfile));
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(true);
  const [notice, setNotice] = useState('');

  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const noticeTimeoutRef = useRef<number | null>(null);

  const phoneIsValid = useMemo(() => /^\+7\d{10}$/.test(profile.phone || ''), [profile.phone]);
  const currentProfileKey = useMemo(() => profileFingerprint(profile), [profile]);
  const profileDirty = currentProfileKey !== savedProfileKey;

  const profileReady =
    !!user &&
    !!profile.full_name &&
    !!profile.role &&
    !!profile.home_restaurant_id &&
    /^\+7\d{10}$/.test(profile.phone || '');

  function showNotice(text: string) {
    setNotice(text);

    if (noticeTimeoutRef.current) {
      window.clearTimeout(noticeTimeoutRef.current);
    }

    noticeTimeoutRef.current = window.setTimeout(() => {
      setNotice('');
      noticeTimeoutRef.current = null;
    }, 5000);
  }

  function setFallbackProfile(sessionUser: User | null) {
    const fallback: Profile = {
      ...emptyProfile,
      user_id: sessionUser?.id || '',
      email: sessionUser?.email || '',
    };

    setProfile(fallback);
    setSavedProfileKey(profileFingerprint(fallback));
    setProfileEditorOpen(true);
  }

  async function getAccessToken() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      return session?.access_token || null;
    } catch {
      return null;
    }
  }

  async function loadStats(accessToken?: string | null) {
    try {
      const token = accessToken ?? (await getAccessToken());

      if (!token) {
        if (mountedRef.current) setStats(null);
        return;
      }

      const res = await fetch('/api/my-applications', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      const data = await readJsonSafe(res);

      if (!mountedRef.current) return;

      if (!res.ok || !data) {
        setStats(null);
        return;
      }

      setStats(data.stats || null);
    } catch {
      if (mountedRef.current) setStats(null);
    }
  }

  async function loadProfile(accessToken?: string | null, sessionUser?: User | null) {
    try {
      const token = accessToken ?? (await getAccessToken());

      if (!token) {
        if (mountedRef.current) setFallbackProfile(sessionUser || null);
        return;
      }

      const res = await fetch('/api/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      const data = await readJsonSafe(res);

      if (!mountedRef.current) return;

      if (!res.ok || !data) {
        setFallbackProfile(sessionUser || null);
        return;
      }

      if (data.profile) {
        const loadedProfile: Profile = {
          user_id: data.profile.user_id,
          email: data.profile.email,
          full_name: data.profile.full_name,
          phone: data.profile.phone || '+7',
          role: data.profile.role || '',
          home_restaurant_id: data.profile.home_restaurant_id || '',
          is_blocked: Boolean(data.profile.is_blocked),
        };

        setProfile(loadedProfile);
        setSavedProfileKey(profileFingerprint(loadedProfile));
        setProfileEditorOpen(
          !loadedProfile.full_name || !loadedProfile.role || !loadedProfile.home_restaurant_id
        );
      } else {
        setFallbackProfile(sessionUser || null);
      }
    } catch {
      if (mountedRef.current) setFallbackProfile(sessionUser || null);
    }
  }

  async function loadInitial() {
    const currentRequestId = ++requestIdRef.current;

    if (mountedRef.current) {
      setLoading(true);
      setProfileLoaded(false);
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const sessionUser = session?.user ?? null;
      const accessToken = session?.access_token ?? null;

      if (!mountedRef.current || currentRequestId !== requestIdRef.current) return;

      setUser(sessionUser);

      const { data: restaurantData } = await supabase
        .from('restaurants')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (!mountedRef.current || currentRequestId !== requestIdRef.current) return;

      setRestaurants((restaurantData || []) as Restaurant[]);

      if (sessionUser) {
        await Promise.allSettled([loadProfile(accessToken, sessionUser), loadStats(accessToken)]);
      } else {
        setProfile(emptyProfile);
        setSavedProfileKey(profileFingerprint(emptyProfile));
        setStats(null);
        setProfileEditorOpen(true);
      }
    } catch {
      if (!mountedRef.current || currentRequestId !== requestIdRef.current) return;

      setUser(null);
      setRestaurants([]);
      setProfile(emptyProfile);
      setSavedProfileKey(profileFingerprint(emptyProfile));
      setStats(null);
      setProfileEditorOpen(true);
    } finally {
      if (mountedRef.current && currentRequestId === requestIdRef.current) {
        setProfileLoaded(true);
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    loadInitial();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        setAuthStep('email');
        setCode('');
        setEmailSentTo('');
        showNotice('Вход выполнен. Личный кабинет обновлен.');
      }
      loadInitial();
    });

    return () => {
      mountedRef.current = false;
      if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
      subscription.unsubscribe();
    };
  }, []);

  async function sendCode() {
    if (!email.trim()) {
      alert('Введите email');
      return;
    }

    setSendingCode(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        alert(error.message);
        return;
      }

      setEmailSentTo(email.trim());
      setAuthStep('code');
      showNotice('Код отправлен на email.');
    } finally {
      setSendingCode(false);
    }
  }

  async function verifyCode() {
    if (!email.trim() || !code.trim()) {
      alert('Введите email и код');
      return;
    }

    setVerifyingCode(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email',
      });

      if (error) {
        alert(error.message);
        return;
      }

      setCode('');
      await loadInitial();
    } finally {
      setVerifyingCode(false);
    }
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

    if (!profileDirty) {
      showNotice('Изменений нет.');
      return;
    }

    setSaving(true);

    try {
      const accessToken = await getAccessToken();

      if (!accessToken) {
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

      const data = await readJsonSafe(res);

      if (!res.ok) {
        alert(data?.error || 'Ошибка сохранения профиля');
        return;
      }

      if (data?.profile) {
        const savedProfile: Profile = {
          user_id: data.profile.user_id,
          email: data.profile.email,
          full_name: data.profile.full_name,
          phone: data.profile.phone || '+7',
          role: data.profile.role || '',
          home_restaurant_id: data.profile.home_restaurant_id || '',
          is_blocked: Boolean(data.profile.is_blocked),
        };

        setProfile(savedProfile);
        setSavedProfileKey(profileFingerprint(savedProfile));
      }

      setProfileEditorOpen(false);
      await loadStats(accessToken);
      showNotice('Профиль сохранен. Личный кабинет обновлен.');
    } catch {
      alert('Ошибка сети при сохранении профиля');
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setAuthStep('email');
    setEmail('');
    setCode('');
    setEmailSentTo('');
    await loadInitial();
  }

  const homeRestaurantName = restaurants.find(
    (restaurant) => restaurant.id === profile.home_restaurant_id
  )?.name;

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
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Вход сотрудника</h2>
          <p className="mt-1 text-sm text-gray-500">
            Введите email, получите код и подтвердите вход.
          </p>
        </div>

        {notice && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</div>
        )}

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
              disabled={sendingCode}
              className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-60"
            >
              {sendingCode ? 'Отправляю код...' : 'Получить код на email'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              Код отправлен на <span className="font-semibold">{emailSentTo || email}</span>
            </div>
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
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
              className="w-full rounded-lg border p-3"
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={verifyCode}
                disabled={verifyingCode}
                className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-60"
              >
                {verifyingCode ? 'Проверяю...' : 'Войти'}
              </button>
              <button
                onClick={() => {
                  setAuthStep('email');
                  setCode('');
                }}
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
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Личный кабинет сотрудника</h2>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setProfileEditorOpen((prev) => !prev)}
              className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {profileEditorOpen ? 'Свернуть профиль' : 'Редактировать профиль'}
            </button>
            <button
              onClick={logout}
              className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Выйти
            </button>
          </div>
        </div>

        {notice && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</div>
        )}

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

        {!profileEditorOpen ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">ФИО</p>
              <p className="mt-2 font-medium text-gray-900">{profile.full_name || 'Не заполнено'}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Телефон</p>
              <p className="mt-2 font-medium text-gray-900">{profile.phone || 'Не заполнено'}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Должность</p>
              <p className="mt-2 font-medium text-gray-900">{profile.role || 'Не заполнено'}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Домашний ресторан</p>
              <p className="mt-2 font-medium text-gray-900">
                {homeRestaurantName || 'Не заполнено'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">ФИО</label>
                <input
                  value={profile.full_name}
                  onChange={(e) => setProfile((prev) => ({ ...prev, full_name: e.target.value }))}
                  className="w-full rounded-lg border p-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Телефон РФ</label>
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
                <p className="mt-1 text-xs text-gray-500">Формат: +7 и 10 цифр</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Должность</label>
                <select
                  value={profile.role}
                  onChange={(e) => setProfile((prev) => ({ ...prev, role: e.target.value }))}
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

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={saveProfile}
                disabled={saving || profile.is_blocked || !profileDirty}
                className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600 disabled:opacity-60"
              >
                {saving ? 'Сохраняю...' : profileDirty ? 'Сохранить профиль' : 'Сохранено'}
              </button>

              <button
                onClick={() => setProfileEditorOpen(false)}
                className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Свернуть
              </button>
            </div>
          </>
        )}

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

      <MyApplications embedded />
    </div>
  );
}