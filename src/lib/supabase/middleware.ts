import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase auth session on every matched request and returns a
 * response carrying the (possibly refreshed) session cookies.
 *
 * This must be called from the root middleware/proxy on every request that
 * needs an up-to-date session. Server Components cannot write cookies
 * themselves (see `@/lib/supabase/server`), so this is the only place an
 * expired access token actually gets refreshed and persisted.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set — add it to .env.')
  }
  if (!publishableKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set — add it to .env.')
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        // Write to both the request (so this same middleware invocation's
        // downstream rendering sees the new cookies) and a fresh response
        // (so the browser receives them).
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
        // Auth cookie writes must never be cached by a CDN/reverse proxy, or
        // one user's session could be served to another user. The Supabase
        // client supplies these headers for exactly that purpose.
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value)
        })
      },
    },
  })

  // IMPORTANT: Do not remove this call. `getClaims()` verifies the JWT and,
  // as a side effect, triggers the token refresh (via `setAll` above) when
  // the access token is expired or close to expiring. Removing it means
  // sessions are never refreshed and users get randomly logged out.
  await supabase.auth.getClaims()

  return response
}
