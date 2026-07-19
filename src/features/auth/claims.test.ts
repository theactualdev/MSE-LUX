import { describe, expect, it } from 'vitest'
import { roleFromClaims, roleSatisfies } from '@/features/auth/claims'
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
