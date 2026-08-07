import { describe, it, expect, vi, afterEach } from 'vitest'
import { usdMinorFromNgnMinor, getUsdNgnRate } from '@/features/checkout/lib/shipping-fx'

/** The committed backstop, mirrored here so the fallback assertions are explicit. */
const BACKSTOP = 1300

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usdMinorFromNgnMinor', () => {
  it('converts naira minor units to dollar minor units with the margin applied', () => {
    // ₦78,475 at 1364.22/$ is $57.5237; +5% is $60.3999, rounded up to $60.40.
    expect(usdMinorFromNgnMinor(7_847_500, 1364.22)).toBe(6040)
  })

  // Rounding to nearest would let a fraction of a cent favour the customer on
  // every international order — small individually, systematic in aggregate,
  // and always in the same direction.
  it('always rounds UP to the cent, never to nearest', () => {
    // ₦1,000 at 1000/$ is exactly $1.00; +5% is $1.05 exactly, no rounding.
    expect(usdMinorFromNgnMinor(100_000, 1000)).toBe(105)
    // A deliberately awkward amount: the true value is 0.0105 dollars, which
    // must land on 2 cents rather than 1.
    expect(usdMinorFromNgnMinor(1_000, 1000)).toBe(2)
  })

  it('applies a 5% margin, so the store sits over rather than under', () => {
    const withoutMargin = 10_000_000 / 100 / 1000
    const charged = usdMinorFromNgnMinor(10_000_000, 1000) / 100

    expect(charged).toBeGreaterThan(withoutMargin)
    expect(charged).toBeCloseTo(withoutMargin * 1.05, 2)
  })

  // A zero, negative or non-finite rate would otherwise produce Infinity, NaN
  // or a negative charge — all of which are worse than a slightly stale rate.
  it('falls back to the backstop rather than producing nonsense money', () => {
    const expected = usdMinorFromNgnMinor(7_847_500, BACKSTOP)

    expect(usdMinorFromNgnMinor(7_847_500, 0)).toBe(expected)
    expect(usdMinorFromNgnMinor(7_847_500, -5)).toBe(expected)
    expect(usdMinorFromNgnMinor(7_847_500, Number.NaN)).toBe(expected)
    expect(usdMinorFromNgnMinor(7_847_500, Number.POSITIVE_INFINITY)).toBe(expected)
  })
})

describe('getUsdNgnRate', () => {
  it('uses the live NGN rate when the feed returns one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ rates: { NGN: 1400 } }) })))

    expect(await getUsdNgnRate()).toEqual({ rate: 1400, source: 'live' })
  })

  // Never throws: a shipping quote must always be produceable, so every
  // failure mode degrades to the committed snapshot instead.
  it.each([
    ['a non-OK response', async () => ({ ok: false, json: async () => ({}) })],
    ['a missing NGN rate', async () => ({ ok: true, json: async () => ({ rates: { GBP: 0.74 } }) })],
    ['a non-numeric rate', async () => ({ ok: true, json: async () => ({ rates: { NGN: 'lots' } }) })],
    ['a zero rate', async () => ({ ok: true, json: async () => ({ rates: { NGN: 0 } }) })],
    ['a network throw', async () => { throw new Error('offline') }],
  ])('falls back to the backstop on %s', async (_label, impl) => {
    vi.stubGlobal('fetch', vi.fn(impl as () => Promise<unknown>))

    expect(await getUsdNgnRate()).toEqual({ rate: BACKSTOP, source: 'backstop' })
  })
})
