import { createBrowserClient } from '@supabase/ssr'

/**
 * Supabase client for use in Client Components.
 *
 * Construction is deferred to call-time (rather than a module-level singleton)
 * so that a missing env var throws only when a caller actually needs the
 * client, mirroring the lazy pattern used by `@/lib/db`.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set — add it to .env.')
  }
  if (!publishableKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set — add it to .env.')
  }

  return createBrowserClient(url, publishableKey)
}
