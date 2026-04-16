'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { validatePasswordStrength } from '@/lib/password';
import ChangePasswordForm from '@/app/components/ChangePasswordForm';

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

const PENDING_PASSWORD_SETUP_KEY = 'pending-password-setup-email';

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

type AdminState = {
  isAdmin: boolean;
  isSuperadmin: boolean;
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

function isProfileComplete(profile: Profile) {
  return Boolean(
    profile.full_name &&
      profile.role &&
      profile.home_restaurant_id &&
      /^\+7\d{10}$/.test(profile.phone || '')
  );
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);

  const [mode, setMode] = useState<'login' | 'register'>(
    searchParams.get('auth') === 'register' ? 'register' : 'login'
  );
  const [registerStep, setRegisterStep] = useState<'email' | 'code' | 'password'>('email');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [registerEmail, setRegisterEmail] = useState('');
  const [registerCode, setRegisterCode] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPasswordRepeat, setRegisterPasswordRepeat] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);

  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [savedProfileKey, setSavedProfileKey] = useState(profileFingerprint(emptyProfile));
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [profileEditorOpen, setProfileEditorOpen] = useState(true);
  const [adminState, setAdminState] = useState<AdminState>({
    isAdmin: false,
    isSuperadmin: false,
  });

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const mountedRef = useRef(false);

  const passwordCheck = useMemo(
    () => validatePasswordStrength(registerPassword, registerEmail),
    [registerPassword, registerEmail]
  );

  const currentProfileKey = useMemo(() => profileFingerprint(profile), [profile]);
  const profileDirty = currentProfileKey !== savedProfileKey;
  const phoneIsValid = /^\+7\d{10}$/.test(profile.phone || '');
  const completeProfileRequired = searchParams.get('completeProfile') === '1';

  function showError(message: string) {
    setError(message);
    setNotice('');
  }

  function showNotice(message: string) {
    setNotice(message);
    setError('');
  }

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || null;
  }

  async function syncSessionFlags(accessToken?: string | null) {
    const token = accessToken ?? (await getAccessToken());

    if (!token) return null;

    const res = await fetch('/api/session-flags/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return await readJsonSafe(res);
  }

  async function clearSessionFlags() {
    await fetch('/api/session-flags/clear', {
      method: 'POST',
    });
  }

  async function loadRestaurants() {
    const { data } = await supabase
      .from('restaurants')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true });

    setRestaurants((data || []) as Restaurant[]);
  }

  async function loadAdminAccess(accessToken?: string | null) {
    const token = accessToken ?? (await getAccessToken());

    if (!token) {
      setAdminState({ isAdmin: false, isSuperadmin: false });
      return;
    }

    try {
      const res = await fetch('/api/admin/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      const data = await readJsonSafe(res);

      if (!res.ok || !data) {
        setAdminState({ isAdmin: false, isSuperadmin: false });
        return;
      }

      setAdminState({
        isAdmin: Boolean(data.isAdmin),
        isSuperadmin: Boolean(data.isSuperadmin),
      });
    } catch {
      setAdminState({ isAdmin: false, isSuperadmin: false });
    }
  }

  async function loadProfile(accessToken?: string | null, currentUser?: User | null) {
    const token = accessToken ?? (await getAccessToken());

    if (!token) {
      const fallback = {
        ...emptyProfile,
        user_id: currentUser?.id || '',
        email: currentUser?.email || '',
      };

      setProfile(fallback);
      setSavedProfileKey(profileFingerprint(fallback));
      setProfileEditorOpen(true);
      return;
    }

    const res = await fetch('/api/profile', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    const data = await readJsonSafe(res);

    if (!res.ok || !data) {
      const fallback = {
        ...emptyProfile,
        user_id: currentUser?.id || '',
        email: currentUser?.email || '',
      };

      setProfile(fallback);
      setSavedProfileKey(profileFingerprint(fallback));
      setProfileEditorOpen(true);
      return;
    }

    if (data.profile) {
      const loadedProfile: Profile = {
        user_id: data.profile.user_id,
        email: data.profile.email,
        full_name: data.profile.full_name || '',
        phone: data.profile.phone || '+7',
        role: data.profile.role || '',
        home_restaurant_id: data.profile.home_restaurant_id || '',
        is_blocked: Boolean(data.profile.is_blocked),
      };

      setProfile(loadedProfile);
      setSavedProfileKey(profileFingerprint(loadedProfile));
      setProfileEditorOpen(!isProfileComplete(loadedProfile));
      return;
    }

    const fallback = {
      ...emptyProfile,
      user_id: currentUser?.id || '',
      email: currentUser?.email || '',
    };

    setProfile(fallback);
    setSavedProfileKey(profileFingerprint(fallback));
    setProfileEditorOpen(true);
  }

  async function hydrate() {
    setLoading(true);

    try {
      await loadRestaurants();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user || null;
      const accessToken = session?.access_token || null;

      if (!mountedRef.current) return;

      if (!user) {
        setSessionUser(null);
        setNeedsPasswordSetup(false);
        setProfile(emptyProfile);
        setSavedProfileKey(profileFingerprint(emptyProfile));
        setProfileEditorOpen(true);
        setAdminState({ isAdmin: false, isSuperadmin: false });
        setLoading(false);
        return;
      }

      const pendingEmail =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(PENDING_PASSWORD_SETUP_KEY)
          : null;

      if (
        pendingEmail &&
        user.email &&
        pendingEmail.toLowerCase() === user.email.toLowerCase()
      ) {
        setSessionUser(user);
        setNeedsPasswordSetup(true);
        setMode('register');
        setRegisterEmail(user.email);
        setRegisterStep('password');
        setLoading(false);
        return;
      }

      setSessionUser(user);
      setNeedsPasswordSetup(false);

      await syncSessionFlags(accessToken);
      await Promise.all([
        loadProfile(accessToken, user),
        loadAdminAccess(accessToken),
      ]);

      if (!mountedRef.current) return;

      setLoading(false);
    } catch {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    if (searchParams.get('auth') === 'register') {
      setMode('register');
    } else if (searchParams.get('auth') === 'login') {
      setMode('login');
    }

    if (searchParams.get('reset') === '1') {
      showNotice('Пароль обновлён. Теперь войдите по email и паролю.');
    }

    if (completeProfileRequired) {
      showNotice('Сначала заполните профиль, чтобы получить доступ к сменам.');
    }

    hydrate();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      hydrate();
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSendCode() {
    showError('');

    if (!consentChecked) {
      showError('Подтвердите согласие на обработку персональных данных');
      return;
    }

    if (!registerEmail.trim()) {
      showError('Введите email');
      return;
    }

    setSendingCode(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: registerEmail.trim(),
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        showError(error.message);
        return;
      }

      setRegisterStep('code');
      showNotice('Код отправлен на почту.');
    } finally {
      setSendingCode(false);
    }
  }

  async function handleVerifyCode() {
    showError('');

    if (!registerEmail.trim() || !registerCode.trim()) {
      showError('Введите email и код');
      return;
    }

    setVerifyingCode(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: registerEmail.trim(),
        token: registerCode.trim(),
        type: 'email',
      });

      if (error) {
        showError(error.message);
        return;
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          PENDING_PASSWORD_SETUP_KEY,
          registerEmail.trim().toLowerCase()
        );
      }

      setNeedsPasswordSetup(true);
      setRegisterStep('password');
      showNotice('Почта подтверждена. Теперь задайте пароль.');
      await hydrate();
    } finally {
      setVerifyingCode(false);
    }
  }

  async function savePrivacyConsent(accessToken: string) {
    await fetch('/api/privacy-consent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        accepted: true,
        policy_version: '2025-09-01',
      }),
    });
  }

  async function handleSetPasswordAfterRegistration() {
    showError('');

    if (registerPassword !== registerPasswordRepeat) {
      showError('Пароли не совпадают');
      return;
    }

    if (!passwordCheck.valid) {
      showError(passwordCheck.errors[0] || 'Пароль слишком простой');
      return;
    }

    setSettingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: registerPassword,
      });

      if (error) {
        showError(error.message);
        return;
      }

      const accessToken = await getAccessToken();

      if (accessToken) {
        await savePrivacyConsent(accessToken);
        await syncSessionFlags(accessToken);
        await loadAdminAccess(accessToken);
      }

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(PENDING_PASSWORD_SETUP_KEY);
      }

      setNeedsPasswordSetup(false);
      setRegisterPassword('');
      setRegisterPasswordRepeat('');
      showNotice('Пароль сохранён. Теперь заполните профиль.');
      await hydrate();
    } finally {
      setSettingPassword(false);
    }
  }

  async function handleLogin() {
    showError('');

    if (!loginEmail.trim() || !loginPassword.trim()) {
      showError('Введите email и пароль');
      return;
    }

    setLoggingIn(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (error) {
        showError(error.message);
        return;
      }

      const accessToken = await getAccessToken();

      if (accessToken) {
        await syncSessionFlags(accessToken);
        await loadAdminAccess(accessToken);
      }

      showNotice('Вход выполнен.');
      await hydrate();
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleForgotPassword() {
    showError('');

    if (!loginEmail.trim()) {
      showError('Сначала введите email');
      return;
    }

    setSendingReset(true);

    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/reset-password`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(loginEmail.trim(), {
        redirectTo,
      });

      if (error) {
        showError(error.message);
        return;
      }

      showNotice('Письмо для восстановления пароля отправлено.');
    } finally {
      setSendingReset(false);
    }
  }

  async function handleSaveProfile() {
    showError('');

    if (!sessionUser) {
      showError('Сначала войдите в аккаунт');
      return;
    }

    if (!profile.full_name.trim()) {
      showError('Введите ФИО');
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
      const accessToken = await getAccessToken();

      if (!accessToken) {
        showError('Сессия не найдена');
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
        showError(data?.error || 'Ошибка сохранения профиля');
        return;
      }

      await syncSessionFlags(accessToken);
      await loadAdminAccess(accessToken);
      await hydrate();

      showNotice('Профиль сохранён. Доступ к сервису открыт.');
      router.push('/slots');
      router.refresh();
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    await clearSessionFlags();

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(PENDING_PASSWORD_SETUP_KEY);
    }

    setLoginPassword('');
    setRegisterCode('');
    setRegisterPassword('');
    setRegisterPasswordRepeat('');
    setSessionUser(null);
    setNeedsPasswordSetup(false);
    setAdminState({ isAdmin: false, isSuperadmin: false });
    await hydrate();
  }

  const profileReady = isProfileComplete(profile);

  const homeRestaurantName = restaurants.find(
    (restaurant) => restaurant.id === profile.home_restaurant_id
  )?.name;

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        Загрузка...
      </div>
    );
  }

  if (needsPasswordSetup) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-2xl font-semibold">Задайте пароль</h2>
        <p className="mb-5 text-sm text-gray-600">
          Почта подтверждена. Теперь придумайте пароль для постоянного входа.
        </p>

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

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              value={registerEmail}
              disabled
              className="w-full rounded-lg border bg-gray-50 p-3 text-gray-600"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Новый пароль
            </label>
            <input
              type="password"
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              className="w-full rounded-lg border p-3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Повторите пароль
            </label>
            <input
              type="password"
              value={registerPasswordRepeat}
              onChange={(e) => setRegisterPasswordRepeat(e.target.value)}
              className="w-full rounded-lg border p-3"
            />
          </div>

          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            <p className="mb-2 font-medium">Требования к паролю:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>минимум 8 символов</li>
              <li>минимум 1 заглавная латинская буква</li>
              <li>минимум 1 строчная латинская буква</li>
              <li>минимум 1 цифра</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={handleSetPasswordAfterRegistration}
            disabled={settingPassword}
            className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {settingPassword ? 'Сохраняю пароль...' : 'Сохранить пароль'}
          </button>
        </div>
      </div>
    );
  }

  if (!sessionUser) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
              setNotice('');
            }}
            className={`rounded-full px-4 py-2 text-sm ${
              mode === 'login'
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Войти
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
              setNotice('');
            }}
            className={`rounded-full px-4 py-2 text-sm ${
              mode === 'register'
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Зарегистрироваться
          </button>
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

        {mode === 'login' ? (
          <>
            <h2 className="mb-2 text-2xl font-semibold">Вход в аккаунт</h2>
            <p className="mb-5 text-sm text-gray-600">
              Войдите по email и паролю, чтобы увидеть личный кабинет и доступные смены.
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full rounded-lg border p-3"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Пароль
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-lg border p-3"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={loggingIn}
                  className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loggingIn ? 'Вхожу...' : 'Войти'}
                </button>

                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={sendingReset}
                  className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sendingReset ? 'Отправляю...' : 'Забыли пароль?'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-2 text-2xl font-semibold">Регистрация</h2>
            <p className="mb-5 text-sm text-gray-600">
              Подтвердите email, придумайте пароль и заполните профиль сотрудника.
            </p>

            {registerStep === 'email' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    type="email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    className="w-full rounded-lg border p-3"
                  />
                </div>

                <div className="rounded-2xl border bg-gray-50 p-4">
                  <label className="flex items-start gap-3 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(e) => setConsentChecked(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                    />
                    <span>
                      Я соглашаюсь на обработку персональных данных и ознакомлен(а) с{' '}
                      <Link href="/privacy" className="text-red-600 hover:underline">
                        политикой обработки персональных данных
                      </Link>
                      .
                    </span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendingCode || !consentChecked}
                  className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sendingCode ? 'Отправляю код...' : 'Получить код на почту'}
                </button>
              </div>
            )}

            {registerStep === 'code' && (
              <div className="space-y-4">
                <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                  Код отправлен на {registerEmail}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Код из письма
                  </label>
                  <input
                    value={registerCode}
                    onChange={(e) => setRegisterCode(e.target.value.replace(/\s/g, ''))}
                    className="w-full rounded-lg border p-3"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={verifyingCode}
                    className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {verifyingCode ? 'Проверяю...' : 'Подтвердить email'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRegisterStep('email');
                      setRegisterCode('');
                    }}
                    className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50"
                  >
                    Назад
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Личный кабинет</h2>
            <p className="mt-1 text-sm text-gray-600">{sessionUser.email}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {adminState.isAdmin && (
              <Link
                href="/admin"
                className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Администратор
              </Link>
            )}

            {profileReady && !profile.is_blocked && (
              <>
                <Link
                  href="/slots"
                  className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
                >
                  Открытые смены
                </Link>

                <Link
                  href="/my-applications"
                  className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Мои отклики
                </Link>
              </>
            )}

            <button
              type="button"
              onClick={() => setProfileEditorOpen((prev) => !prev)}
              className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {profileEditorOpen ? 'Свернуть профиль' : 'Редактировать профиль'}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Выйти
            </button>
          </div>
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
            Ваш профиль заблокирован. Обратитесь в HR.
          </div>
        )}

        {!profileReady && !profile.is_blocked && (
          <div className="mb-4 rounded-xl bg-yellow-50 p-4 text-sm text-yellow-700">
            Сначала заполните профиль. Пока профиль не заполнен, смены и внутренние разделы недоступны.
          </div>
        )}

        {!profileEditorOpen ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="mb-1 text-sm text-gray-500">ФИО</div>
              <div className="font-medium">{profile.full_name || 'Не заполнено'}</div>
            </div>

            <div className="rounded-xl bg-gray-50 p-4">
              <div className="mb-1 text-sm text-gray-500">Телефон</div>
              <div className="font-medium">{profile.phone || 'Не заполнено'}</div>
            </div>

            <div className="rounded-xl bg-gray-50 p-4">
              <div className="mb-1 text-sm text-gray-500">Должность</div>
              <div className="font-medium">{profile.role || 'Не заполнено'}</div>
            </div>

            <div className="rounded-xl bg-gray-50 p-4">
              <div className="mb-1 text-sm text-gray-500">Домашний ресторан</div>
              <div className="font-medium">{homeRestaurantName || 'Не заполнено'}</div>
            </div>
          </div>
        ) : (
          <>
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
                  value={profile.phone}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...prev,
                      phone: normalizeRussianPhoneInput(e.target.value),
                    }))
                  }
                  className="w-full rounded-lg border p-3"
                />
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

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={savingProfile || (!profileDirty && profileReady)}
                className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingProfile ? 'Сохраняю...' : 'Сохранить профиль'}
              </button>

              <button
                type="button"
                onClick={() => setProfileEditorOpen(false)}
                className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50"
              >
                Свернуть
              </button>
            </div>
          </>
        )}
      </div>

      <ChangePasswordForm />
    </div>
  );
}