import { NextRequest, NextResponse } from 'next/server';

import { getCurrentAdminContext, jsonError, ApiError } from '@/lib/admin-api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  SUPERADMIN_EMAIL,
  canAssignRole,
  isConfiguredSuperadminEmail,
  listActiveAdminUsers,
  listAdminAccessAudit,
  normalizeAdminEmail,
  normalizeAdminRole,
  writeAdminAccessAudit,
  type AdminRole,
  type CanonicalAdminRole,
} from '@/lib/admin-access';

type RestaurantOption = {
  id: number;
  name: string;
};

async function listRestaurants(): Promise<RestaurantOption[]> {
  const { data } = await supabaseAdmin
    .from('restaurants')
    .select('id, name')
    .order('name', { ascending: true });

  return ((data || []) as RestaurantOption[]).map((restaurant) => ({
    id: restaurant.id,
    name: restaurant.name,
  }));
}

async function readAdminUser(email: string) {
  const { data } = await supabaseAdmin
    .from('admin_users')
    .select('id, email, role, is_active')
    .eq('email', email)
    .maybeSingle();

  return data as { id: number; email: string; role: AdminRole; is_active: boolean } | null;
}

async function deactivateRestaurantAccess(params: {
  adminUserId?: number | null;
  email: string;
}) {
  const updates = [];

  if (params.adminUserId) {
    updates.push(
      supabaseAdmin
        .from('admin_restaurant_access')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('admin_user_id', params.adminUserId)
    );
  }

  updates.push(
    supabaseAdmin
      .from('admin_restaurant_access')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('admin_email', params.email)
  );

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);

  if (failed?.error) {
    throw new Error(failed.error.message);
  }
}

async function activateRestaurantAccess(params: {
  adminUserId: number;
  email: string;
  restaurantIds: number[];
}) {
  for (const restaurantId of params.restaurantIds) {
    const { data: existing } = await supabaseAdmin
      .from('admin_restaurant_access')
      .select('id')
      .eq('admin_user_id', params.adminUserId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from('admin_restaurant_access')
        .update({
          admin_email: params.email,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from('admin_restaurant_access').insert([
        {
          admin_user_id: params.adminUserId,
          admin_email: params.email,
          restaurant_id: restaurantId,
          is_active: true,
        },
      ]);

      if (error) throw new Error(error.message);
    }
  }
}

async function buildResponse() {
  const [items, audit, restaurants] = await Promise.all([
    listActiveAdminUsers(),
    listAdminAccessAudit(50),
    listRestaurants(),
  ]);

  return {
    items,
    audit,
    restaurants,
    configuredSuperadminEmail: SUPERADMIN_EMAIL || null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const context = await getCurrentAdminContext(req);

    if (!context.canManageAccess) {
      throw new ApiError('Недостаточно прав', 403);
    }

    return NextResponse.json(await buildResponse());
  } catch (error) {
    return jsonError(error, 'Ошибка загрузки администраторов');
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getCurrentAdminContext(req);

    if (!context.canManageAccess) {
      throw new ApiError('Недостаточно прав', 403);
    }

    const body = await req.json();
    const action = String(body?.action || '').trim();
    const targetEmail = normalizeAdminEmail(body?.email);

    if (!targetEmail) {
      throw new ApiError('Введите email', 400);
    }

    if (action === 'grant') {
      const requestedRole = normalizeAdminRole(body?.role || 'restaurant_admin');
      const role: CanonicalAdminRole = isConfiguredSuperadminEmail(targetEmail)
        ? 'superadmin'
        : requestedRole;

      if (!canAssignRole(context.canonicalRole, role)) {
        throw new ApiError('Недостаточно прав для выдачи этой роли', 403);
      }

      const rawRestaurantIds: unknown[] = Array.isArray(body?.restaurantIds)
        ? body.restaurantIds
        : [];
      const parsedRestaurantIds = rawRestaurantIds
        .map((value) => Number(value))
        .filter((value): value is number => Number.isInteger(value) && value > 0);
      const restaurantIds = Array.from(new Set<number>(parsedRestaurantIds));

      if (
        (role === 'restaurant_admin' || role === 'territory_admin') &&
        restaurantIds.length === 0
      ) {
        throw new ApiError('Для этой роли нужно выбрать хотя бы один ресторан', 400);
      }

      const { data: savedUser, error } = await supabaseAdmin
        .from('admin_users')
        .upsert(
          {
            email: targetEmail,
            role,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'email' }
        )
        .select('id, email, role, is_active')
        .single();

      if (error || !savedUser) {
        throw new Error(error?.message || 'Не удалось сохранить администратора');
      }

      await deactivateRestaurantAccess({
        adminUserId: Number(savedUser.id),
        email: targetEmail,
      });

      if (role === 'restaurant_admin' || role === 'territory_admin') {
        await activateRestaurantAccess({
          adminUserId: Number(savedUser.id),
          email: targetEmail,
          restaurantIds,
        });
      }

      await writeAdminAccessAudit({
        actorUserId: context.userId,
        actorEmail: context.email,
        targetEmail,
        action: 'grant',
        assignedRole: role,
      });

      return NextResponse.json({
        success: true,
        ...(await buildResponse()),
      });
    }

    if (action === 'revoke') {
      if (isConfiguredSuperadminEmail(targetEmail)) {
        throw new ApiError(
          'Нельзя отозвать права у суперпользователя из конфигурации',
          400
        );
      }

      const target = await readAdminUser(targetEmail);

      if (target?.role === 'superadmin' && !context.canManageSuperadmins) {
        throw new ApiError('HR-админ не может управлять superadmin-доступом', 403);
      }

      const { error } = await supabaseAdmin
        .from('admin_users')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('email', targetEmail);

      if (error) throw new Error(error.message);

      await deactivateRestaurantAccess({
        adminUserId: target?.id,
        email: targetEmail,
      });

      await writeAdminAccessAudit({
        actorUserId: context.userId,
        actorEmail: context.email,
        targetEmail,
        action: 'revoke',
        assignedRole: null,
      });

      return NextResponse.json({
        success: true,
        ...(await buildResponse()),
      });
    }

    throw new ApiError('Неизвестное действие', 400);
  } catch (error) {
    return jsonError(error, 'Ошибка изменения доступа');
  }
}
