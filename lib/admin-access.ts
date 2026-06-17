import { supabaseAdmin } from '@/lib/supabase-admin';

export type LegacyAdminRole = 'admin';
export type CanonicalAdminRole =
  | 'superadmin'
  | 'hr_admin'
  | 'territory_admin'
  | 'restaurant_admin';
export type AdminRole = LegacyAdminRole | CanonicalAdminRole;

export type AdminAccess = {
  isAdmin: boolean;
  isSuperadmin: boolean;
  isHrAdmin: boolean;
  isGlobalAdmin: boolean;
  canManageAccess: boolean;
  canManageSuperadmins: boolean;
  role: 'user' | AdminRole;
  canonicalRole: 'user' | CanonicalAdminRole;
};

export type AdminContext = AdminAccess & {
  email: string;
  userId?: string | null;
  adminUserId?: number | null;
  accessibleRestaurantIds: number[] | null;
};

export type AdminRestaurantAccessRecord = {
  id: number;
  admin_user_id: number | null;
  admin_email: string | null;
  restaurant_id: number;
  restaurant_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminUserRecord = {
  id: number;
  email: string;
  role: AdminRole;
  canonicalRole: CanonicalAdminRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  source: 'db' | 'env';
  restaurantAccess: AdminRestaurantAccessRecord[];
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

type AdminRestaurantAccessDbRecord = {
  id: number;
  admin_user_id: number | null;
  admin_email: string | null;
  restaurant_id: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type RestaurantNameRecord = {
  id: number;
  name: string;
};

type AdminUserListBaseItem = Omit<AdminUserRecord, 'restaurantAccess'>;

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

export function normalizeAdminRole(role?: string | null): CanonicalAdminRole {
  if (role === 'superadmin') return 'superadmin';
  if (role === 'hr_admin') return 'hr_admin';
  if (role === 'territory_admin') return 'territory_admin';
  if (role === 'restaurant_admin') return 'restaurant_admin';

  return 'hr_admin';
}

export function isGlobalAdminRole(role: 'user' | CanonicalAdminRole) {
  return role === 'superadmin' || role === 'hr_admin';
}

export function canManageAdminAccess(role: 'user' | CanonicalAdminRole) {
  return role === 'superadmin' || role === 'hr_admin';
}

export function canAssignRole(
  actorRole: 'user' | CanonicalAdminRole,
  targetRole: CanonicalAdminRole
) {
  if (actorRole === 'superadmin') return true;
  if (actorRole === 'hr_admin') {
    return targetRole === 'restaurant_admin' || targetRole === 'territory_admin';
  }
  return false;
}

export function buildAdminAccess(role: 'user' | AdminRole): AdminAccess {
  if (role === 'user') {
    return {
      isAdmin: false,
      isSuperadmin: false,
      isHrAdmin: false,
      isGlobalAdmin: false,
      canManageAccess: false,
      canManageSuperadmins: false,
      role: 'user',
      canonicalRole: 'user',
    };
  }

  const canonicalRole = normalizeAdminRole(role);

  return {
    isAdmin: true,
    isSuperadmin: canonicalRole === 'superadmin',
    isHrAdmin: canonicalRole === 'hr_admin',
    isGlobalAdmin: isGlobalAdminRole(canonicalRole),
    canManageAccess: canManageAdminAccess(canonicalRole),
    canManageSuperadmins: canonicalRole === 'superadmin',
    role,
    canonicalRole,
  };
}

async function getAdminUserRecord(email?: string | null) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) return null;

  const { data, error } = await supabaseAdmin
    .from('admin_users')
    .select('id, email, role, is_active, created_at, updated_at')
    .eq('email', normalizedEmail)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  return data as AdminUserDbRecord;
}

async function getRestaurantAccessRows(params: {
  adminUserId?: number | null;
  email?: string | null;
}) {
  const normalizedEmail = normalizeEmail(params.email);
  const rowsById = new Map<number, AdminRestaurantAccessDbRecord>();

  if (params.adminUserId) {
    const { data } = await supabaseAdmin
      .from('admin_restaurant_access')
      .select('id, admin_user_id, admin_email, restaurant_id, is_active, created_at, updated_at')
      .eq('admin_user_id', params.adminUserId)
      .eq('is_active', true);

    ((data || []) as AdminRestaurantAccessDbRecord[]).forEach((row) =>
      rowsById.set(row.id, row)
    );
  }

  if (normalizedEmail) {
    const { data } = await supabaseAdmin
      .from('admin_restaurant_access')
      .select('id, admin_user_id, admin_email, restaurant_id, is_active, created_at, updated_at')
      .eq('admin_email', normalizedEmail)
      .eq('is_active', true);

    ((data || []) as AdminRestaurantAccessDbRecord[]).forEach((row) =>
      rowsById.set(row.id, row)
    );
  }

  return [...rowsById.values()];
}

async function attachRestaurantNames(
  rows: AdminRestaurantAccessDbRecord[]
): Promise<AdminRestaurantAccessRecord[]> {
  const restaurantIds = [...new Set(rows.map((row) => row.restaurant_id).filter(Boolean))];
  const restaurantNameById = new Map<number, string>();

  if (restaurantIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('restaurants')
      .select('id, name')
      .in('id', restaurantIds);

    ((data || []) as RestaurantNameRecord[]).forEach((restaurant) => {
      restaurantNameById.set(restaurant.id, restaurant.name);
    });
  }

  return rows
    .map((row) => ({
      id: row.id,
      admin_user_id: row.admin_user_id,
      admin_email: row.admin_email ? normalizeEmail(row.admin_email) : null,
      restaurant_id: row.restaurant_id,
      restaurant_name: restaurantNameById.get(row.restaurant_id) || `#${row.restaurant_id}`,
      is_active: Boolean(row.is_active),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
    .sort((a, b) => a.restaurant_name.localeCompare(b.restaurant_name, 'ru'));
}

export async function getAdminAccessByEmail(email?: string | null): Promise<AdminAccess> {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) return buildAdminAccess('user');

  if (isConfiguredSuperadminEmail(normalizedEmail)) {
    return buildAdminAccess('superadmin');
  }

  const record = await getAdminUserRecord(normalizedEmail);

  if (!record) return buildAdminAccess('user');

  return buildAdminAccess(record.role);
}

export async function getAdminContextByEmail(params: {
  email?: string | null;
  userId?: string | null;
}): Promise<AdminContext> {
  const normalizedEmail = normalizeEmail(params.email);

  if (!normalizedEmail) {
    return {
      ...buildAdminAccess('user'),
      email: '',
      userId: params.userId || null,
      adminUserId: null,
      accessibleRestaurantIds: [],
    };
  }

  if (isConfiguredSuperadminEmail(normalizedEmail)) {
    return {
      ...buildAdminAccess('superadmin'),
      email: normalizedEmail,
      userId: params.userId || null,
      adminUserId: null,
      accessibleRestaurantIds: null,
    };
  }

  const record = await getAdminUserRecord(normalizedEmail);

  if (!record) {
    return {
      ...buildAdminAccess('user'),
      email: normalizedEmail,
      userId: params.userId || null,
      adminUserId: null,
      accessibleRestaurantIds: [],
    };
  }

  const access = buildAdminAccess(record.role);

  if (access.isGlobalAdmin) {
    return {
      ...access,
      email: normalizedEmail,
      userId: params.userId || null,
      adminUserId: record.id,
      accessibleRestaurantIds: null,
    };
  }

  const accessRows = await getRestaurantAccessRows({
    adminUserId: record.id,
    email: normalizedEmail,
  });

  return {
    ...access,
    email: normalizedEmail,
    userId: params.userId || null,
    adminUserId: record.id,
    accessibleRestaurantIds: [
      ...new Set(accessRows.map((row) => row.restaurant_id).filter(Boolean)),
    ],
  };
}

export function canAccessRestaurant(context: AdminContext, restaurantId?: number | null) {
  if (!context.isAdmin || !restaurantId) return false;
  if (context.accessibleRestaurantIds === null) return true;
  return context.accessibleRestaurantIds.includes(restaurantId);
}

export function assertCanAccessRestaurant(
  context: AdminContext,
  restaurantId?: number | null
) {
  if (!canAccessRestaurant(context, restaurantId)) {
    throw new Error('Недостаточно прав для этого ресторана');
  }
}

export async function listActiveAdminUsers(): Promise<AdminUserRecord[]> {
  const { data } = await supabaseAdmin
    .from('admin_users')
    .select('id, email, role, is_active, created_at, updated_at')
    .eq('is_active', true)
    .order('email', { ascending: true });

  const dbItems: AdminUserListBaseItem[] = ((data || []) as AdminUserDbRecord[]).map((item) => ({
    id: item.id,
    email: normalizeEmail(item.email),
    role: item.role,
    canonicalRole: normalizeAdminRole(item.role),
    is_active: Boolean(item.is_active),
    created_at: item.created_at,
    updated_at: item.updated_at,
    source: isConfiguredSuperadminEmail(item.email) ? 'env' : 'db',
  }));

  const hasConfiguredSuperadmin = SUPERADMIN_EMAIL
    ? dbItems.some((item) => item.email === SUPERADMIN_EMAIL)
    : false;

  const baseItems: AdminUserListBaseItem[] = [...dbItems];

  if (SUPERADMIN_EMAIL && !hasConfiguredSuperadmin) {
    baseItems.unshift({
      id: 0,
      email: SUPERADMIN_EMAIL,
      role: 'superadmin' as const,
      canonicalRole: 'superadmin' as const,
      is_active: true,
      created_at: '1970-01-01T00:00:00.000Z',
      updated_at: '1970-01-01T00:00:00.000Z',
      source: 'env' as const,
    });
  }

  const accessRowsByKey = new Map<string, AdminRestaurantAccessRecord[]>();

  await Promise.all(
    baseItems.map(async (item) => {
      const rows = await getRestaurantAccessRows({
        adminUserId: item.id || null,
        email: item.email,
      });
      accessRowsByKey.set(
        `${item.id}:${item.email}`,
        await attachRestaurantNames(rows)
      );
    })
  );

  const weight: Record<CanonicalAdminRole, number> = {
    superadmin: 0,
    hr_admin: 1,
    territory_admin: 2,
    restaurant_admin: 3,
  };

  return baseItems
    .map((item): AdminUserRecord => ({
      id: item.id,
      email: item.email,
      role: isConfiguredSuperadminEmail(item.email) ? 'superadmin' : item.role,
      canonicalRole: isConfiguredSuperadminEmail(item.email)
        ? 'superadmin'
        : item.canonicalRole,
      is_active: item.is_active,
      created_at: item.created_at,
      updated_at: item.updated_at,
      source: item.source,
      restaurantAccess: accessRowsByKey.get(`${item.id}:${item.email}`) || [],
    }))
    .sort((a, b) => {
      const roleDiff = weight[a.canonicalRole] - weight[b.canonicalRole];

      if (roleDiff !== 0) return roleDiff;

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
      assigned_role: item.assigned_role ? (item.assigned_role as AdminRole) : null,
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
