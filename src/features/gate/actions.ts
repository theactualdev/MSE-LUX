'use server'

import { createHash, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { checkRateLimit, RATE_LIMITED_MESSAGE } from '@/lib/rate-limit'
import { GATE_COOKIE, GATE_SESSION_MAX_AGE_SECONDS, mintGateToken } from '@/features/gate/session'
import { safeReturnPath } from '@/features/gate/gate'

/**
 * `'use server'` makes this a PUBLIC HTTP endpoint — every argument arrives
 * off the wire (the standing lesson from the gift-checkout rounds). It
 * therefore accepts only the candidate password and a return path, both
 * untrusted; the real password never leaves `process.env`, is never logged,
 * and never appears in any return value or cookie.
 *
 * One generic failure message on purpose: "wrong password", "gate not
 * configured" and "rate limited" (aside from the shared limiter copy) must
 * not be distinguishable enough to make probing informative.
 */

export interface GateResult {
  error?: string
}

const GENERIC_ERROR = 'Incorrect password. Please try again.'

/** Constant-time equality via fixed-length digests — lengths differ, so hash first. */
function passwordsMatch(candidate: string, actual: string): boolean {
  const a = createHash('sha256').update(candidate, 'utf8').digest()
  const b = createHash('sha256').update(actual, 'utf8').digest()
  return timingSafeEqual(a, b)
}

export async function enterStore(_previous: GateResult, formData: FormData): Promise<GateResult> {
  if (!(await checkRateLimit('gate'))) {
    return { error: RATE_LIMITED_MESSAGE }
  }

  const sitePassword = process.env.SITE_PASSWORD
  // Gate unset means the proxy never sends anyone here; a direct POST to the
  // action in that state gets the generic error, never a hint that the gate
  // is off.
  if (!sitePassword) {
    return { error: GENERIC_ERROR }
  }

  const candidate = formData.get('password')
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 512) {
    return { error: GENERIC_ERROR }
  }

  if (!passwordsMatch(candidate, sitePassword)) {
    return { error: GENERIC_ERROR }
  }

  const token = await mintGateToken(sitePassword)
  const cookieStore = await cookies()
  cookieStore.set(GATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: GATE_SESSION_MAX_AGE_SECONDS,
  })

  // `safeReturnPath` is applied at REDEMPTION, the only place it matters —
  // whatever arrived in the form's hidden field cannot leave the site.
  const from = formData.get('from')
  redirect(safeReturnPath(typeof from === 'string' ? from : '/'))
}
