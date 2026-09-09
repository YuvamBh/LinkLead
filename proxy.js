import { NextResponse } from 'next/server';

const COOKIE_NAME = 'linklead_auth';
const COOKIE_VALUE = 'authenticated';

// Runs before every /admin/* request and bounces unauthenticated visitors to /login
export function proxy(request) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    const authCookie = request.cookies.get(COOKIE_NAME);
    if (!authCookie || authCookie.value !== COOKIE_VALUE) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
