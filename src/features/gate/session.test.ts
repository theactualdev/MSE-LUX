import { describe, it, expect } from 'vitest'
import { GATE_SESSION_MAX_AGE_SECONDS, mintGateToken, verifyGateToken } from '@/features/gate/session'

const PASSWORD = 'correct-horse-battery-staple'

describe('gate session token', () => {
  it('round-trips: a minted token verifies under the same password', async () => {
    const token = await mintGateToken(PASSWORD)

    expect(await verifyGateToken(token, PASSWORD)).toBe(true)
  })

  it('never contains the password', async () => {
    const token = await mintGateToken(PASSWORD)

    expect(token).not.toContain(PASSWORD)
    expect(token).toMatch(/^v1\.\d+\.[A-Za-z0-9_-]+$/)
  })

  // Rotating SITE_PASSWORD must revoke every session at once — that is the
  // owner's remedy when the launch password escapes.
  it('rejects a token minted under a different password', async () => {
    const token = await mintGateToken('old-password')

    expect(await verifyGateToken(token, PASSWORD)).toBe(false)
  })

  it('rejects a tampered signature', async () => {
    const token = await mintGateToken(PASSWORD)
    const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')

    expect(await verifyGateToken(flipped, PASSWORD)).toBe(false)
  })

  // The expiry is inside the MAC — extending it without the password breaks
  // the signature, so a cookie cannot outlive its session by editing.
  it('rejects a token whose expiry was extended after signing', async () => {
    const token = await mintGateToken(PASSWORD)
    const [version, exp, sig] = token.split('.')
    const extended = `${version}.${Number(exp) + 86_400_000}.${sig}`

    expect(await verifyGateToken(extended, PASSWORD)).toBe(false)
  })

  it('rejects an expired token', async () => {
    const minted = await mintGateToken(PASSWORD, Date.now() - (GATE_SESSION_MAX_AGE_SECONDS + 60) * 1000)

    expect(await verifyGateToken(minted, PASSWORD)).toBe(false)
  })

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['garbage', 'not-a-token'],
    ['wrong version', 'v0.9999999999999.AAAA'],
    ['non-numeric expiry', 'v1.soon.AAAA'],
    ['invalid base64url', 'v1.9999999999999.%%%%'],
  ])('never throws on a malformed cookie (%s) — it is just unauthenticated', async (_label, value) => {
    expect(await verifyGateToken(value as string | undefined, PASSWORD)).toBe(false)
  })
})
