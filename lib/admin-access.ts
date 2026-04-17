import { supabaseAdmin } from '@/lib/supabase-admin';

export type AdminRole = 'admin' | 'superadmin';

export type AdminAccess = {
  isAdmin: boolean;
  isSuperadmin: boolean;
  role: 'user' | AdminRole;
};

export type AdminUserRecord = {
  id: number;
  email: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  source: 'db' | 'env';
};

export type AdminAccessAuditRecord = {
  id: number;
  actor_user_id: string | null;
  actor_email: string;
  target_email: string;
  action: 'grant' | 'revoke';
  assigned_role: AdminRole | null;
  created_at: string;
};

type AdminUserDbRecord = {
  id: number;
  email: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function normalizeEmail(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

export const SUPERADMIN_EMAIL = normalizeEmail(process.env.SUPERADMIN_EMAIL);

export function normalizeAdminEmail(email?: string | null) {
  return normalizeEmail(email);
}

export function isConfiguredSuperadminEmail(email?: string | null) {
  if (!SUPERADMIN_EMAIL) return false;
  return normalizeEmail(email) === SUPERADMIN_EMAIL;
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

  if (isConfiguredSuperadminEmail(normalizedEmail)) {
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

  const role: AdminRole = data.role === 'superadmin' ? 'superadmin' : 'admin';

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

  const dbItems: AdminUserDbRecord[] = ((data || []) as AdminUserDbRecord[]).map((item) => ({
    id: item.id,
    email: normalizeEmail(item.email),
    role: item.role === 'superadmin' ? 'superadmin' : 'admin',
    is_active: Boolean(item.is_active),
    created_at: item.created_at,
    updated_at: item.updated_at,
  }));

  const items: AdminUserRecord[] = dbItems.map((item): AdminUserRecord => {
    const isEnvSuperadmin = isConfiguredSuperadminEmail(item.email);

    return {
      id: item.id,
      email: item.email,
      role: isEnvSuperadmin ? 'superadmin' : item.role,
      is_active: item.is_active,
      created_at: item.created_at,
      updated_at: item.updated_at,
      source: isEnvSuperadmin ? 'env' : 'db',
    };
  });

  const hasConfiguredSuperadmin = SUPERADMIN_EMAIL
    ? items.some((item) => item.email === SUPERADMIN_EMAIL)
    : false;

  if (SUPERADMIN_EMAIL && !hasConfiguredSuperadmin) {
    items.unshift({
      id: 0,
      email: SUPERADMIN_EMAIL,
      role: 'superadmin',
      is_active: true,
      created_at: '1970-01-01T00:00:00.000Z',
      updated_at: '1970-01-01T00:00:00.000Z',
      source: 'env',
    });
  }

  return items.sort((a, b) => {
    if (a.role !== b.role) {
      return a.role === 'superadmin' ? -1 : 1;
    }

    return a.email.localeCompare(b.email, 'ru');
  });
}

export async function listAdminAccessAudit(limit = 50): Promise<AdminAccessAuditRecord[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200));

  const { data } = await supabaseAdmin
    .from('admin_access_audit')
    .select(
      'id, actor_user_id, actor_email, target_email, action, assigned_role, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  return ((data || []) as AdminAccessAuditRecord[]).map(
    (item): AdminAccessAuditRecord => ({
      id: item.id,
      actor_user_id: item.actor_user_id,
      actor_email: normalizeEmail(item.actor_email),
      target_email: normalizeEmail(item.target_email),
      action: item.action === 'revoke' ? 'revoke' : 'grant',
      assigned_role:
        item.assigned_role === 'superadmin'
          ? 'superadmin'
          : item.assigned_role === 'admin'
            ? 'admin'
            : null,
      created_at: item.created_at,
    })
  );
}

export async function writeAdminAccessAudit(params: {
  actorUserId?: string | null;
  actorEmail?: string | null;
  targetEmail: string;
  action: 'grant' | 'revoke';
  assignedRole?: AdminRole | null;
}) {
  const payload = {
    actor_user_id: params.actorUserId || null,
    actor_email: normalizeEmail(params.actorEmail),
    target_email: normalizeEmail(params.targetEmail),
    action: params.action,
    assigned_role: params.assignedRole || null,
  };

  const { error } = await supabaseAdmin.from('admin_access_audit').insert(payload);

  if (error) {
    throw new Error(error.message);
  }
}