import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAdminAccessByEmail } from '@/lib/admin-access';

function isProfileComplete(profile: {
  full_name?: string | null;
  phone?: string | null;
  role?: string | null;
  home_restaurant_id?: number | null;
} | null) {
  if (!profile) return false;

  return Boolean(
    profile.full_name &&
      profile.phone &&
      profile.role &&
      profile.home_restaurant_id
  );
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      const res = NextResponse.json({ success: false }, { status: 401 });
      res.cookies.set('app_auth', '', { path: '/', maxAge: 0 });
      res.cookies.set('app_profile', '', { path: '/', maxAge: 0 });
      res.cookies.set('app_admin', '', { path: '/', maxAge: 0 });
      res.cookies.set('app_superadmin', '', { path: '/', maxAge: 0 });
      return res;
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      const res = NextResponse.json({ success: false }, { status: 401 });
      res.cookies.set('app_auth', '', { path: '/', maxAge: 0 });
      res.cookies.set('app_profile', '', { path: '/', maxAge: 0 });
      res.cookies.set('app_admin', '', { path: '/', maxAge: 0 });
      res.cookies.set('app_superadmin', '', { path: '/', maxAge: 0 });
      return res;
    }

    const user = userData.user;

    const { data: profile } = await supabaseAdmin
      .from('employee_profiles')
      .select('full_name, phone, role, home_restaurant_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const profileComplete = isProfileComplete(profile || null);
    const adminAccess = await getAdminAccessByEmail(user.email);

    const res = NextResponse.json({
      success: true,
      profileComplete,
      isAdmin: adminAccess.isAdmin,
      isSuperadmin: adminAccess.isSuperadmin,
      email: user.email || '',
    });

    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8,
    };

    res.cookies.set('app_auth', '1', cookieOptions);
    res.cookies.set('app_profile', profileComplete ? '1' : '0', cookieOptions);
    res.cookies.set('app_admin', adminAccess.isAdmin ? '1' : '0', cookieOptions);
    res.cookies.set(
      'app_superadmin',
      adminAccess.isSuperadmin ? '1' : '0',
      cookieOptions
    );

    return res;
  } catch {
    const res = NextResponse.json({ success: false }, { status: 500 });
    res.cookies.set('app_auth', '', { path: '/', maxAge: 0 });
    res.cookies.set('app_profile', '', { path: '/', maxAge: 0 });
    res.cookies.set('app_admin', '', { path: '/', maxAge: 0 });
    res.cookies.set('app_superadmin', '', { path: '/', maxAge: 0 });
    return res;
  }
}