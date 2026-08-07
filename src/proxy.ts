import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { applyCurrencyCookie } from '@/features/currency/lib/geo-cookie'
import { isGateExemptPath } from '@/features/gate/gate'
import { GATE_COOKIE, verifyGateToken } from '@/features/gate/session'

/**
 * Next 16 renamed Middleware to Proxy — this file must be `proxy.ts` (see
 * `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` and the
 * v16 upgrade guide's `mv middleware.ts proxy.ts`). A `middleware.ts` here is
 * the pre-16 convention and would simply not run, silently leaving Supabase
 * auth tokens un-refreshed.
 *
 * Two jobs, in order:
 *
 * 1. THE SITE GATE (pre-launch privacy curtain). Active only while
 *    `SITE_PASSWORD` is set — deleting the env var and redeploying IS the
 *    launch switch. Deny-by-default: every route 307s to `/gate` unless it
 *    verifies the HMAC-signed gate cookie or appears on the reasoned
 *    exemption list in `features/gate/gate.ts` (admin's own auth, webhooks,
 *    cron, OAuth callback, robots). This check is exactly the cheap,
 *    DB-free work a proxy is for — one Web Crypto HMAC verify — and it runs
 *    FIRST so unauthenticated traffic never triggers a Supabase refresh.
 *    Session refresh for the exempt paths is unchanged.
 *
 * 2. Supabase session-cookie refresh + geo currency seeding, exactly as
 *    before. Per Next's own guidance the proxy does no database work and is
 *    NOT the app's authorization boundary — routes enforce access themselves
 *    via `getClaims()`; the gate above is a coarse curtain over the whole
 *    storefront, not a per-user check.
 */
export default async function proxy(request: NextRequest) {
  const sitePassword = process.env.SITE_PASSWORD
  const { pathname } = request.nextUrl

  if (sitePassword && !isGateExemptPath(pathname)) {
    const authenticated = await verifyGateToken(request.cookies.get(GATE_COOKIE)?.value, sitePassword)
    if (!authenticated) {
      const gateUrl = new URL('/gate', request.url)
      // Preserve the intended destination (path + query only — it is
      // re-sanitized by `safeReturnPath` at redemption, so nothing here
      // can become an open redirect).
      const target = pathname + request.nextUrl.search
      if (target !== '/') gateUrl.searchParams.set('from', target)
      const response = NextResponse.redirect(gateUrl)
      // Belt-and-braces beside the gate page's own noindex metadata.
      response.headers.set('x-robots-tag', 'noindex')
      return response
    }
  }

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
