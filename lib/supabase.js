/**
 * lib/supabase.js
 *
 * Supabase client factory.
 *
 * - supabaseAdmin  — service_role client for all server-side DB operations.
 *                    Bypasses RLS. Never exposed to the browser.
 * - createAuthClient(cookieStore) — session-aware client for auth routes.
 *                    Uses the anon key + SSR cookie handlers.
 */

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  // Fail loudly at startup rather than silently at query time
  console.warn(
    '[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
    'DB operations will fail. Set these in .env.local.'
  );
}

/**
 * Admin (service_role) Supabase client.
 * Use for all data reads / writes in API routes.
 * Never passes this to the client side.
 */
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Auth-aware server client for Route Handlers.
 * Uses the anon key; session is managed via cookies.
 *
 * @param {import('next/dist/server/web/spec-extension/cookies').ReadonlyRequestCookies} cookieStore
 *   The cookie store from `await cookies()` in a Route Handler.
 */
export function createAuthClient(cookieStore) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      },
    },
  });
}

/**
 * Middleware-specific client.
 * Reads + writes cookies on the request/response pair.
 *
 * @param {Request} request
 * @param {Response} response
 */
export function createMiddlewareClient(request, response) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });
}
