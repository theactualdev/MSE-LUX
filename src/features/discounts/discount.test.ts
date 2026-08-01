import { describe, it, expect, vi, beforeEach } from 'vitest'

const discountCode = vi.hoisted(() => ({ findUnique: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { discountCode } }))

const { normaliseCode, computeDiscountMinor, resolveUsableCode } = await import('@/features/discounts/discount')

beforeEach(() => vi.clearAllMocks())

const LIVE = { id: 'd1', code: 'LAUNCH20', percentOff: 20, active: true, expiresAt: null, maxUses: null, timesUsed: 0 }

describe('normaliseCode', () => {
  it('trims and uppercases so one code has one identity', () => {
    expect(normaliseCode('  launch20 ')).toBe('LAUNCH20')
    expect(normaliseCode('Launch20')).toBe('LAUNCH20')
  })
})

describe('computeDiscountMinor', () => {
  it('takes the percentage of the subtotal, rounded to whole minor units', () => {
    expect(computeDiscountMinor(1_000_000, 20)).toBe(200_000)
    expect(computeDiscountMinor(999, 10)).toBe(100) // 99.9 -> 100
  })

  it('never exceeds the subtotal, so a total can never go negative', () => {
    expect(computeDiscountMinor(5_000, 100)).toBe(5_000)
  })

  it('is zero for a zero subtotal', () => {
    expect(computeDiscountMinor(0, 50)).toBe(0)
  })

  it('clamps an out-of-range percentOff above 100 to 100', () => {
    expect(computeDiscountMinor(1_000, 150)).toBe(1_000)
  })

  it('clamps a negative percentOff to 0', () => {
    expect(computeDiscountMinor(1_000, -10)).toBe(0)
  })
})

describe('resolveUsableCode', () => {
  it('resolves a live code, looked up by its NORMALISED form', async () => {
    discountCode.findUnique.mockResolvedValue(LIVE)
    await expect(resolveUsableCode(' launch20 ')).resolves.toEqual({ id: 'd1', code: 'LAUNCH20', percentOff: 20 })
    expect(discountCode.findUnique).toHaveBeenCalledWith({ where: { code: 'LAUNCH20' } })
  })

  it('returns null for an unknown code', async () => {
    discountCode.findUnique.mockResolvedValue(null)
    await expect(resolveUsableCode('NOPE')).resolves.toBeNull()
  })

  it('returns the same undifferentiated null for an out-of-range percentOff as for an unknown code', async () => {
    discountCode.findUnique.mockResolvedValue(null)
    const unknownResult = await resolveUsableCode('NOPE')

    for (const percentOff of [0, 150, -10]) {
      discountCode.findUnique.mockResolvedValue({ ...LIVE, percentOff })
      const result = await resolveUsableCode('LAUNCH20')
      expect(result).toBeNull()
      expect(result).toEqual(unknownResult)
    }
  })

  it('accepts the inclusive bounds of percentOff, 1 and 100', async () => {
    discountCode.findUnique.mockResolvedValue({ ...LIVE, percentOff: 1 })
    await expect(resolveUsableCode('LAUNCH20')).resolves.not.toBeNull()

    discountCode.findUnique.mockResolvedValue({ ...LIVE, percentOff: 100 })
    await expect(resolveUsableCode('LAUNCH20')).resolves.not.toBeNull()
  })

  it('returns null for an inactive code', async () => {
    discountCode.findUnique.mockResolvedValue({ ...LIVE, active: false })
    await expect(resolveUsableCode('LAUNCH20')).resolves.toBeNull()
  })

  it('returns null for an expired code', async () => {
    discountCode.findUnique.mockResolvedValue({ ...LIVE, expiresAt: new Date(Date.now() - 1000) })
    await expect(resolveUsableCode('LAUNCH20')).resolves.toBeNull()
  })

  it('accepts a code whose expiry is still in the future', async () => {
    discountCode.findUnique.mockResolvedValue({ ...LIVE, expiresAt: new Date(Date.now() + 60_000) })
    await expect(resolveUsableCode('LAUNCH20')).resolves.not.toBeNull()
  })

  it('returns null for a code whose expiry is exactly now (fail-closed on the <= boundary)', async () => {
    const now = Date.now()
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      discountCode.findUnique.mockResolvedValue({ ...LIVE, expiresAt: new Date(now) })
      await expect(resolveUsableCode('LAUNCH20')).resolves.toBeNull()
    } finally {
      spy.mockRestore()
    }
  })

  it('returns null when the usage cap is reached', async () => {
    discountCode.findUnique.mockResolvedValue({ ...LIVE, maxUses: 5, timesUsed: 5 })
    await expect(resolveUsableCode('LAUNCH20')).resolves.toBeNull()
  })

  it('accepts a capped code with uses remaining', async () => {
    discountCode.findUnique.mockResolvedValue({ ...LIVE, maxUses: 5, timesUsed: 4 })
    await expect(resolveUsableCode('LAUNCH20')).resolves.not.toBeNull()
  })

  it('returns null for an empty code without querying', async () => {
    await expect(resolveUsableCode('   ')).resolves.toBeNull()
    expect(discountCode.findUnique).not.toHaveBeenCalled()
  })
})
