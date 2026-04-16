import { supabaseAdmin } from '@/lib/supabase-admin';

export const SUPERADMIN_EMAIL = 'f.hakimov@akrussia.com';

export type AdminAccess = {
  isAdmin: boolean;
  isSuperadmin: boolean;
  role: 'user' | 'admin' | 'superadmin';
};

export type AdminUserRecord = {
  id: number;
  email: string;
  role: 'admin' | 'superadmin';
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function normalizeEmail(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

export async function getAdminAccessByEmail(email?: string | null): Promise<AdminAccess> {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return {
      isAdmin: false,
      isSuperadmin: false,
      role: 'user',
    };
  }

  if (normalizedEmail === SUPERADMIN_EMAIL) {
    return {
      isAdmin: true,
      isSuperadmin: true,
      role: 'superadmin',
    };
  }

  const { data, error } = await supabaseAdmin
    .from('admin_users')
    .select('role, is_active')
    .eq('email', normalizedEmail)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return {
      isAdmin: false,
      isSuperadmin: false,
      role: 'user',
    };
  }

  const role = data.role === 'superadmin' ? 'superadmin' : 'admin';

  return {
    isAdmin: true,
    isSuperadmin: role === 'superadmin',
    role,
  };
}

export async function listActiveAdminUsers(): Promise<AdminUserRecord[]> {
  const { data } = await supabaseAdmin
    .from('admin_users')
    .select('id, email, role, is_active, created_at, updated_at')
    .eq('is_active', true)
    .order('email', { ascending: true });

  const items = ((data || []) as AdminUserRecord[]).map((item) => ({
    ...item,
    email: normalizeEmail(item.email),
  }));

  const hasSuperadmin = items.some(
    (item) => normalizeEmail(item.email) === SUPERADMIN_EMAIL
  );

  if (!hasSuperadmin) {
    items.unshift({
      id: 0,
      email: SUPERADMIN_EMAIL,
      role: 'superadmin',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return items.sort((a, b) => {
    if (a.role !== b.role) {
      return a.role === 'superadmin' ? -1 : 1;
    }

    return a.email.localeCompare(b.email, 'ru');
  });
}

export function normalizeAdminEmail(email?: string | null) {
  return normalizeEmail(email);
}