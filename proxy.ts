import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function redirectToHome(req: NextRequest, reason: 'login' | 'profile' | 'admin') {
  const url = req.nextUrl.clone();
  url.pathname = '/';

  if (reason === 'login') {
    url.searchParams.set('auth', 'login');
  }

  if (reason === 'profile') {
    url.searchParams.set('auth', 'register');
    url.searchParams.set('completeProfile', '1');
  }

  if (reason === 'admin') {
    url.searchParams.set('auth', 'login');
  }

  return NextResponse.redirect(url);
}

function isProtectedWorkerPath(pathname: string) {
  return (
    pathname.startsWith('/slots') ||
    pathname.startsWith('/my-applications') ||
    pathname.startsWith('/restaurants')
  );
}

function applyNoIndexHeader(response: NextResponse | Response) {
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return response;
}

export function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const appAuth = req.cookies.get('app_auth')?.value === '1';
  const appProfile = req.cookies.get('app_profile')?.value === '1';
  const appAdmin = req.cookies.get('app_admin')?.value === '1';

  if (pathname.startsWith('/admin')) {
    if (!appAuth) {
      return applyNoIndexHeader(redirectToHome(req, 'login'));
    }

    if (!appAdmin) {
      return applyNoIndexHeader(redirectToHome(req, 'admin'));
    }

    return applyNoIndexHeader(NextResponse.next());
  }

  if (isProtectedWorkerPath(pathname)) {
    if (!appAuth) {
      return redirectToHome(req, 'login');
    }

    if (!appProfile) {
      return redirectToHome(req, 'profile');
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/slots/:path*', '/my-applications/:path*', '/restaurants/:path*'],
};