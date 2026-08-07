/**
 * Pure path logic for the site gate — imported by the proxy, so it must stay
 * free of Node-only and `server-only` imports, and free of I/O.
 *
 * DENY BY DEFAULT: a route added next month is gated without anyone
 * remembering this file exists. The list below is everything that may be
 * reached WITHOUT the launch password, and each line carries the reason it is
 * safe — an exemption without a reason is how gates rot open.
 */

/** True for the paths the gate must never intercept. */
export function isGateExemptPath(pathname: string): boolean {
  // The gate itself — page and its server action POST back to the same path.
  if (pathname === '/gate') return true

  // Admin has its OWN, stronger authentication: a Supabase session plus
  // requireRole(ADMIN) in the nested admin layout, re-checked inside every
  // admin server action. The customer launch password must neither replace
  // nor sit in front of it (an admin locked out of /admin by a marketing
  // password would be absurd; a customer knowing the launch password gains
  // nothing here — requireRole still 404s them).
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return true

  // Server-to-server callers that cannot hold a browser cookie. Each has its
  // own authentication at the handler: Paystack signs its webhook body
  // (HMAC-SHA512, verified before parsing), and the cron route requires
  // CRON_SECRET. Gating either would silently break paid-order fulfilment
  // and the nightly reaper — the two failures that lose money quietest.
  if (pathname === '/api/paystack/webhook') return true
  if (pathname.startsWith('/api/cron/')) return true

  // Supabase OAuth code exchange. The browser lands here mid-login from
  // accounts.google.com; it exposes no content (exchanges a code, redirects)
  // and interrupting it strands sign-ins half-way.
  if (pathname === '/auth/callback') return true

  // Crawler infrastructure: path names only, no product data. The sitemap is
  // NOT exempt — it enumerates product slugs, which is exactly the content
  // the gate hides.
  if (pathname === '/robots.txt') return true

  return false
}

/**
 * Sanitizes the post-login destination so the `from` parameter can never
 * become an open redirect. Only same-site paths survive:
 *
 * - must start with exactly one `/` (`//evil.com` is scheme-relative and
 *   `/\evil.com` is its backslash cousin — browsers normalise `\` to `/`)
 * - anything with a scheme separator is dropped outright
 * - `/gate` itself is rewritten to `/` so a stale link can't loop
 * - absurd lengths are dropped rather than truncated
 */
export function safeReturnPath(raw: string | undefined | null): string {
  if (!raw || raw.length > 2048) return '/'
  if (!raw.startsWith('/')) return '/'
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  if (raw.includes('://') || raw.includes('\\')) return '/'
  if (raw === '/gate' || raw.startsWith('/gate?')) return '/'
  return raw
}
