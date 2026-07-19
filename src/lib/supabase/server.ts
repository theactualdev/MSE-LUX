import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Supabase client for use in Server Components, Server Actions, and Route Handlers.
 *
 * A new client is created on every call (never cached across requests) per the
 * Supabase SSR guidance. `cookies()` is async in this Next.js version, so this
 * function is async too.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set — add it to .env.')
  }
  if (!publishableKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set — add it to .env.')
  }

  const cookieStore = await cookies()

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        // Server Components cannot write cookies — only Server Actions and
        // Route Handlers can. Calling `.set()` here from a Server Component
        // throws. The middleware's `updateSession` call handles refreshing
        // and persisting the session cookie on every request, so it's safe
        // to swallow this error here.
        //
        // (The library also passes a `headers` argument with Cache-Control
        // headers meant to prevent CDN caching of auth cookie writes. There's
        // no response object to attach them to from this cookie store API,
        // so that's handled in the middleware client instead, which does
        // have access to the outgoing response.)
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Swallow — see comment above.
        }
      },
    },
  })
}
