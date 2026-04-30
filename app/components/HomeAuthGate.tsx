'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Turnstile from 'react-turnstile';

import ApprovedShiftsCard from '@/app/components/ApprovedShiftsCard';
import { validatePasswordStrength } from '@/lib/password';
import { supabase } from '@/lib/supabase';

const PENDING_PASSWORD_SETUP_KEY = 'pending-password-setup-email';

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

type HydrateOptions = {
  force?: boolean;
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

function normalizeFullName(value: string) {
  return String(value || '')
    .replace(/[^А-Яа-яЁё\s-]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim();
}

function isValidCyrillicFullName(value: string) {
  const normalized = normalizeFullName(value);

  if (!normalized) return false;
  if (normalized.length < 5) return false;

  if (!/^[А-Яа-яЁё]+(?:[\s-][А-Яа-яЁё]+)*$/.test(normalized)) {
    return false;
  }

  return normalized.split(/\s+/).filter(Boolean).length >= 2;
}

function isProfileComplete(profile: Profile) {
  return Boolean(
    isValidCyrillicFullName(profile.full_name) &&
      profile.role &&
      profile.home_restaurant_id &&
      /^\+7\d{10}$/.test(profile.phone || '')
  );
}

function getFirstName(profile: Profile, user: User | null) {
  const parts = normalizeFullName(profile.full_name).split(/\s+/).filter(Boolean);

  if (parts.length >= 2) return parts[1];
  if (parts.length === 1) return parts[0];

  return user?.email || 'коллега';
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

export default function HomeAuthGate() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [sessionAccessToken, setSessionAccessToken] = useState('');
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

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  const mountedRef = useRef(false);
  const hydratingRef = useRef(false);
  const lastHydrateStartedAtRef = useRef(0);

  const completeProfileRequired = searchParams.get('completeProfile') === '1';
  const profileReady = isProfileComplete(profile);
  const firstName = getFirstName(profile, sessionUser);

  const passwordCheck = useMemo(
    () => validatePasswordStrength(registerPassword, registerEmail),
    [registerPassword, registerEmail]
  );

  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaKey((prev) => prev + 1);
  }

  function showError(message: string) {
    setError(message);
    setNotice('');
  }

  function showNotice(message: string) {
    setNotice(message);
    setError('');
  }

  function goTo(path: string) {
    window.location.href = path;
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

  async function loadProfile(accessToken: string, currentUser: User | null) {
    try {
      const res = await fetch('/api/profile', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const data = await readJsonSafe(res);

      if (!res.ok || !data?.profile) {
        setProfile({
          ...emptyProfile,
          user_id: currentUser?.id || '',
          email: currentUser?.email || '',
        });
        return;
      }

      setProfile({
        user_id: data.profile.user_id || '',
        email: data.profile.email || currentUser?.email || '',
        full_name: data.profile.full_name || '',
        phone: data.profile.phone || '+7',
        role: data.profile.role || '',
        home_restaurant_id: data.profile.home_restaurant_id || '',
        is_blocked: Boolean(data.profile.is_blocked),
      });
    } catch {
      setProfile({
        ...emptyProfile,
        user_id: currentUser?.id || '',
        email: currentUser?.email || '',
      });
    }
  }

  async function loadAdminAccess(accessToken: string) {
    try {
      const res = await fetch('/api/admin/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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

  async function hydrate(options: HydrateOptions = {}) {
    const now = Date.now();

    if (hydratingRef.current) return;
    if (!options.force && now - lastHydrateStartedAtRef.current < 1500) return;

    hydratingRef.current = true;
    lastHydrateStartedAtRef.current = now;

    const emptySessionResult = {
      data: { session: null },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>;

    try {
      const {
        data: { session },
      } = await withTimeout(supabase.auth.getSession(), 5000, emptySessionResult);

      const user = session?.user || null;
      const accessToken = session?.access_token || null;

      if (!mountedRef.current) return;

      if (!user || !accessToken) {
        setSessionUser(null);
        setSessionAccessToken('');
        setNeedsPasswordSetup(false);
        setProfile(emptyProfile);
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
        setSessionAccessToken(accessToken);
        setNeedsPasswordSetup(true);
        setMode('register');
        setRegisterEmail(user.email);
        setRegisterStep('password');
        setLoading(false);
        return;
      }

      setLoading(true);
      setSessionUser(user);
      setSessionAccessToken(accessToken);
      setNeedsPasswordSetup(false);

      await syncSessionFlags(accessToken);
      await Promise.all([loadProfile(accessToken, user), loadAdminAccess(accessToken)]);

      if (!mountedRef.current) return;
      setLoading(false);
    } catch {
      if (!mountedRef.current) return;
      setLoading(false);
    } finally {
      hydratingRef.current = false;
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

    void hydrate({ force: true });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') return;
      void hydrate();
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

    if (!captchaToken) {
      showError('Подтвердите, что вы не робот');
      return;
    }

    setSendingCode(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: registerEmail.trim(),
        options: {
          shouldCreateUser: true,
          captchaToken,
        },
      });

      if (error) {
        showError(error.message);
        resetCaptcha();
        return;
      }

      setRegisterStep('code');
      showNotice('Код отправлен на почту.');
      resetCaptcha();
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
      await hydrate({ force: true });
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
        setSessionAccessToken(accessToken);
        await savePrivacyConsent(accessToken);
        await syncSessionFlags(accessToken);
      }

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(PENDING_PASSWORD_SETUP_KEY);
      }

      setNeedsPasswordSetup(false);
      setRegisterPassword('');
      setRegisterPasswordRepeat('');
      showNotice('Пароль сохранён. Осталось заполнить профиль.');
      await hydrate({ force: true });
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

    if (!captchaToken) {
      showError('Подтвердите, что вы не робот');
      return;
    }

    setLoggingIn(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
        options: {
          captchaToken,
        },
      });

      if (error) {
        showError(error.message);
        resetCaptcha();
        return;
      }

      showNotice('Вход выполнен.');
      resetCaptcha();
      await hydrate({ force: true });
      router.refresh();
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

    if (!captchaToken) {
      showError('Подтвердите, что вы не робот');
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
        captchaToken,
      });

      if (error) {
        showError(error.message);
        resetCaptcha();
        return;
      }

      showNotice('Письмо для восстановления пароля отправлено.');
      resetCaptcha();
    } finally {
      setSendingReset(false);
    }
  }

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
            <ul className="list-disc space-y-1 pl-5">
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
              resetCaptcha();
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
              resetCaptcha();
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
              Войдите по email и паролю, чтобы увидеть доступные смены и свои отклики.
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

              <div className="rounded-2xl border bg-gray-50 p-4">
                <Turnstile
                  key={captchaKey}
                  sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''}
                  onVerify={(token) => {
                    setCaptchaToken(token);
                    setError('');
                  }}
                  onExpire={() => {
                    setCaptchaToken(null);
                  }}
                  onError={() => {
                    setCaptchaToken(null);
                    showError('Ошибка проверки CAPTCHA. Попробуйте ещё раз.');
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={loggingIn || !captchaToken}
                  className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loggingIn ? 'Вхожу...' : 'Войти'}
                </button>

                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={sendingReset || !captchaToken}
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

                <div className="rounded-2xl border bg-gray-50 p-4">
                  <Turnstile
                    key={captchaKey}
                    sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''}
                    onVerify={(token) => {
                      setCaptchaToken(token);
                      setError('');
                    }}
                    onExpire={() => {
                      setCaptchaToken(null);
                    }}
                    onError={() => {
                      setCaptchaToken(null);
                      showError('Ошибка проверки CAPTCHA. Попробуйте ещё раз.');
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendingCode || !consentChecked || !captchaToken}
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
                      resetCaptcha();
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

  if (!profileReady) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-2 text-sm font-medium text-red-600">
            Остался последний шаг
          </div>

          <h2 className="mb-2 text-2xl font-semibold">Заполните профиль</h2>

          <p className="mb-5 text-sm text-gray-600">
            Чтобы смотреть смены и отправлять отклики, нужно указать ФИО, телефон,
            должность и домашний ресторан.
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

          <button
            type="button"
            onClick={() => goTo('/profile?completeProfile=1')}
            className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600"
          >
            Заполнить профиль
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-2 text-sm font-medium text-red-600">
          Личный кабинет
        </div>

        <h2 className="mb-2 text-2xl font-semibold">Привет, {firstName}</h2>

        <p className="mb-5 text-sm text-gray-600">
          Здесь коротко показано главное. Данные профиля, пароль, Telegram и выход
          теперь находятся во вкладке «Профиль».
        </p>

        {profile.is_blocked ? (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            Ваш профиль заблокирован. Доступ к откликам на смены ограничен.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => goTo('/slots')}
              className="rounded-lg bg-red-500 px-4 py-3 text-white hover:bg-red-600"
            >
              Смотреть смены
            </button>

            <button
              type="button"
              onClick={() => goTo('/my-applications')}
              className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50"
            >
              Мои отклики
            </button>

            <button
              type="button"
              onClick={() => goTo('/profile')}
              className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50"
            >
              Профиль
            </button>

            {adminState.isAdmin && (
              <button
                type="button"
                onClick={() => goTo('/admin')}
                className="rounded-lg border px-4 py-3 text-gray-700 hover:bg-gray-50"
              >
                Админ-панель
              </button>
            )}
          </div>
        )}
      </section>

      {!profile.is_blocked && sessionAccessToken && (
        <ApprovedShiftsCard accessToken={sessionAccessToken} />
      )}
    </div>
  );
}
