import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { applyCurrencyCookie } from '@/features/currency/lib/geo-cookie'

/**
 * Next 16 renamed Middleware to Proxy — this file must be `proxy.ts` (see
 * `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` and the
 * v16 upgrade guide's `mv middleware.ts proxy.ts`). A `middleware.ts` here is
 * the pre-16 convention and would simply not run, silently leaving Supabase
 * auth tokens un-refreshed.
 *
 * This only refreshes the session cookie. Per Next's own guidance, Proxy runs on
 * every route including prefetches, so it does no database work and is NOT the
 * authorization boundary — routes enforce access themselves via `getClaims()`.
 */
export default async function proxy(request: NextRequest) {
  const response = await updateSession(request)
  applyCurrencyCookie(request, response)
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - common image file extensions
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
