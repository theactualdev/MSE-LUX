import { z } from 'zod'

const envSchema = z.object({
  // `protocol` constrains this to exactly `http`/`https` — without it, zod
  // 4.4.3's bare `z.url()` also accepts `ftp://x.com` and `javascript:alert(1)`.
  // `src/app/auth/callback/route.ts` states as fact that this value is always
  // an absolute http/https URL when it resolves redirect bases against it;
  // this constraint is what makes that claim true rather than aspirational.
  //
  // This does not constrain away a path prefix (e.g.
  // `http://s.com/shop`) — `new URL('/account', 'http://s.com/shop')`
  // resolves to `http://s.com/account`, silently dropping `/shop`. That's a
  // functional footgun for a path-prefixed deployment (redirects would land
  // at the wrong path), not a security bypass (the origin itself is
  // preserved, so it can't be used to redirect off-site) — set this var to a
  // bare origin, no path, until a real deployment needs a path prefix.
  NEXT_PUBLIC_SITE_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),
  NEXT_PUBLIC_BRAND_NAME: z.string().min(1).default('MSE Lux'),
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(raw: Record<string, string | undefined>): Env {
  return envSchema.parse(raw)
}

export const env: Env = parseEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME,
})
