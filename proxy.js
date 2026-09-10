import { NextResponse } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase';

// Routes that require authentication
const protectedRoutes = ['/admin', '/api/admin'];

// Exclude public routes from proxy processing
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/r (redirect routes)
     * - api/og (open graph images)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/r|api/og|_next/static|_next/image|favicon.ico).*)',
  ],
};

export async function proxy(request) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createMiddlewareClient(request, response);
  
  // Refresh session if expired - required for Server Components
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const url = request.nextUrl.clone();
  const isProtected = protectedRoutes.some((route) =>
    url.pathname.startsWith(route)
  );
  
  // Special handling for auth API which is under /api/admin/auth
  // We need to allow POST (login) and DELETE (logout)
  if (url.pathname === '/api/admin/auth') {
    return response;
  }

  if (isProtected && !session) {
    if (url.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from the login page
  if (url.pathname === '/login' && session) {
    url.pathname = '/admin';
    return NextResponse.redirect(url);
  }

  return response;
}
