import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdminContext, jsonError } from '@/lib/admin-api-auth';

export async function GET(req: NextRequest) {
  try {
    const context = await getCurrentAdminContext(req);

    return NextResponse.json({
      email: context.email,
      isAdmin: context.isAdmin,
      isSuperadmin: context.isSuperadmin,
      isHrAdmin: context.isHrAdmin,
      isGlobalAdmin: context.isGlobalAdmin,
      canManageAccess: context.canManageAccess,
      canManageSuperadmins: context.canManageSuperadmins,
      role: context.role,
      canonicalRole: context.canonicalRole,
      accessibleRestaurantIds: context.accessibleRestaurantIds,
    });
  } catch (error) {
    return jsonError(error, 'Ошибка проверки доступа');
  }
}
