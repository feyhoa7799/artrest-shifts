import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ success: true });

  res.cookies.set('app_auth', '', {
    path: '/',
    maxAge: 0,
  });

  res.cookies.set('app_profile', '', {
    path: '/',
    maxAge: 0,
  });

  res.cookies.set('app_admin', '', {
    path: '/',
    maxAge: 0,
  });

  res.cookies.set('app_superadmin', '', {
    path: '/',
    maxAge: 0,
  });

  return res;
}