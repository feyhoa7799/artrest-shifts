import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_PASSWORD = 'KFDxC5M93@';

export function proxy(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const auth = req.headers.get('authorization');

  if (!auth || !auth.startsWith('Basic ')) {
    return new Response('Auth required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin"',
      },
    });
  }

  try {
    const base64 = auth.split(' ')[1];
    const decoded = atob(base64);
    const colonIndex = decoded.indexOf(':');
    const password = colonIndex >= 0 ? decoded.slice(colonIndex + 1) : '';

    if (password !== ADMIN_PASSWORD) {
      return new Response('Access denied', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Admin"',
        },
      });
    }

    return NextResponse.next();
  } catch {
    return new Response('Access denied', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin"',
      },
    });
  }
}

export const config = {
  matcher: ['/admin/:path*'],
};