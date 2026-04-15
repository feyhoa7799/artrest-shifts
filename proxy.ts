import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function unauthorized() {
  return new NextResponse('Auth required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Admin"',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      
      'Content-Security-Policy': 'upgrade-insecure-requests',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    },
  });
}

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedPassword) {
    return new NextResponse('Admin auth is not configured', {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Security-Policy': 'upgrade-insecure-requests',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      },
    });
  }

  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Basic ')) {
    return unauthorized();
  }

  try {
    const base64 = auth.split(' ')[1] || '';
    const decoded = atob(base64);
    const colonIndex = decoded.indexOf(':');
    const username = colonIndex >= 0 ? decoded.slice(0, colonIndex) : '';
    const password = colonIndex >= 0 ? decoded.slice(colonIndex + 1) : '';

    if (username !== expectedUsername || password !== expectedPassword) {
      return unauthorized();
    }

    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return response;
  } catch {
    return unauthorized();
  }
}

export const config = {
  matcher: ['/admin/:path*'],
};
