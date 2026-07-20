import { describe, expect, it } from 'vitest'
import { hasRecentRecoveryAuth, roleFromClaims, roleSatisfies } from '@/features/auth/claims'
import { Role } from '@/generated/prisma/client'

describe('roleFromClaims', () => {
  it('reads app_metadata.role when present', () => {
    expect(roleFromClaims({ app_metadata: { role: 'ADMIN' } })).toBe(Role.ADMIN)
    expect(roleFromClaims({ app_metadata: { role: 'SUPER_ADMIN' } })).toBe(Role.SUPER_ADMIN)
    expect(roleFromClaims({ app_metadata: { role: 'CUSTOMER' } })).toBe(Role.CUSTOMER)
  })

  it('defaults to CUSTOMER when app_metadata is absent', () => {
    expect(roleFromClaims({})).toBe(Role.CUSTOMER)
    expect(roleFromClaims(null)).toBe(Role.CUSTOMER)
    expect(roleFromClaims(undefined)).toBe(Role.CUSTOMER)
  })

  it('defaults to CUSTOMER when app_metadata has no role', () => {
    expect(roleFromClaims({ app_metadata: {} })).toBe(Role.CUSTOMER)
  })

  it('ignores user_metadata entirely — the privilege-escalation guard', () => {
    // Supabase's user_metadata (raw_user_meta_data) is editable by the user
    // themselves via the client SDK. If roleFromClaims ever read a role from
    // it, any signed-in customer could grant themselves SUPER_ADMIN. Only
    // app_metadata (settable only via the service role / admin API) may be
    // trusted, so this must still resolve to CUSTOMER.
    const claims = {
      user_metadata: { role: 'SUPER_ADMIN' },
    }
    expect(roleFromClaims(claims)).toBe(Role.CUSTOMER)
  })

  it('falls back to CUSTOMER for an unrecognised role string rather than trusting it', () => {
    expect(roleFromClaims({ app_metadata: { role: 'WIZARD' } })).toBe(Role.CUSTOMER)
  })
})

describe('roleSatisfies', () => {
  it('each role satisfies itself', () => {
    expect(roleSatisfies(Role.CUSTOMER, Role.CUSTOMER)).toBe(true)
    expect(roleSatisfies(Role.ADMIN, Role.ADMIN)).toBe(true)
    expect(roleSatisfies(Role.SUPER_ADMIN, Role.SUPER_ADMIN)).toBe(true)
  })

  it('implements SUPER_ADMIN > ADMIN > CUSTOMER', () => {
    expect(roleSatisfies(Role.SUPER_ADMIN, Role.ADMIN)).toBe(true)
    expect(roleSatisfies(Role.SUPER_ADMIN, Role.CUSTOMER)).toBe(true)
    expect(roleSatisfies(Role.ADMIN, Role.CUSTOMER)).toBe(true)
  })

  it('CUSTOMER does not satisfy ADMIN or SUPER_ADMIN', () => {
    expect(roleSatisfies(Role.CUSTOMER, Role.ADMIN)).toBe(false)
    expect(roleSatisfies(Role.CUSTOMER, Role.SUPER_ADMIN)).toBe(false)
  })

  it('ADMIN does not satisfy SUPER_ADMIN', () => {
    expect(roleSatisfies(Role.ADMIN, Role.SUPER_ADMIN)).toBe(false)
  })
})

describe('hasRecentRecoveryAuth', () => {
  const nowSeconds = Date.now() / 1000

  it('is true for a fresh recovery AMR entry', () => {
    const claims = { amr: [{ method: 'recovery', timestamp: nowSeconds }] }
    expect(hasRecentRecoveryAuth(claims)).toBe(true)
  })

  it('is true just inside the freshness window', () => {
    // 899s, not the exact 900s boundary — leaves margin for the real clock
    // time elapsed between computing `nowSeconds` above and the call below.
    const claims = { amr: [{ method: 'recovery', timestamp: nowSeconds - 899 }] }
    expect(hasRecentRecoveryAuth(claims, 900)).toBe(true)
  })

  it('is false once the recovery entry falls outside the freshness window', () => {
    const claims = { amr: [{ method: 'recovery', timestamp: nowSeconds - 901 }] }
    expect(hasRecentRecoveryAuth(claims, 900)).toBe(false)
  })

  it('is false for an ordinary password-login session — the privilege-escalation guard', () => {
    // This is the case FIX 1 exists for: an everyday signed-in session (an
    // unlocked shared browser, say) must not be able to reach
    // updatePassword just because a session cookie is present.
    const claims = { amr: [{ method: 'password', timestamp: nowSeconds }] }
    expect(hasRecentRecoveryAuth(claims)).toBe(false)
  })

  it('is false when amr is absent, null, or undefined', () => {
    expect(hasRecentRecoveryAuth({})).toBe(false)
    expect(hasRecentRecoveryAuth(null)).toBe(false)
    expect(hasRecentRecoveryAuth(undefined)).toBe(false)
  })

  it('is false for the RFC-8176 string-array amr form — no timestamp to verify freshness against', () => {
    const claims = { amr: ['recovery'] }
    expect(hasRecentRecoveryAuth(claims)).toBe(false)
  })

  it('is false for a recovery entry with a non-numeric or missing timestamp', () => {
    expect(hasRecentRecoveryAuth({ amr: [{ method: 'recovery' }] })).toBe(false)
    expect(hasRecentRecoveryAuth({ amr: [{ method: 'recovery', timestamp: 'yesterday' }] })).toBe(false)
  })

  it('is false for a timestamp far enough in the future to be bogus rather than merely clock-skewed', () => {
    const claims = { amr: [{ method: 'recovery', timestamp: nowSeconds + 3600 }] }
    expect(hasRecentRecoveryAuth(claims)).toBe(false)
  })

  it('tolerates small clock skew where the timestamp is slightly in the future', () => {
    const claims = { amr: [{ method: 'recovery', timestamp: nowSeconds + 30 }] }
    expect(hasRecentRecoveryAuth(claims)).toBe(true)
  })

  it('finds a fresh recovery entry alongside other, older or unrelated entries', () => {
    const claims = {
      amr: [
        { method: 'password', timestamp: nowSeconds - 100000 },
        { method: 'recovery', timestamp: nowSeconds },
      ],
    }
    expect(hasRecentRecoveryAuth(claims)).toBe(true)
  })
})
