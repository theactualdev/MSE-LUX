import { describe, it, expect } from 'vitest'
import { parseSelections } from '@/features/gifting/lib/parse-selections'

/**
 * `parseSelections` is UX-only (see its doc comment) — nothing here is a
 * trust boundary, since `getGiftShippingRates`/`placeGiftOrder` re-validate
 * every selection server-side regardless. What matters is that a malformed
 * or hand-edited `selections` query param degrades to `null` (the checkout
 * page's "start again" state) instead of throwing and crashing the page.
 */
describe('parseSelections', () => {
  it('parses valid JSON of the right shape, including a variantless product', () => {
    const raw = JSON.stringify([
      { productId: 'p1', variantId: 'v1' },
      { productId: 'p2', variantId: null },
    ])

    expect(parseSelections(raw)).toEqual([
      { productId: 'p1', variantId: 'v1' },
      { productId: 'p2', variantId: null },
    ])
  })

  it('returns null when the param is missing', () => {
    expect(parseSelections(undefined)).toBeNull()
  })

  it('returns null for a repeated param (Next hands back a string[])', () => {
    const raw = [
      JSON.stringify([{ productId: 'p1', variantId: null }]),
      JSON.stringify([{ productId: 'p2', variantId: null }]),
    ]

    expect(parseSelections(raw)).toBeNull()
  })

  it('returns null for non-JSON garbage', () => {
    expect(parseSelections('not json at all')).toBeNull()
  })

  it('returns null for valid JSON that is an object instead of an array', () => {
    expect(parseSelections(JSON.stringify({ productId: 'p1', variantId: null }))).toBeNull()
  })

  it('returns null for valid JSON that is an array of strings', () => {
    expect(parseSelections(JSON.stringify(['p1', 'p2']))).toBeNull()
  })

  it('returns null for valid JSON that is an array of objects missing productId', () => {
    expect(parseSelections(JSON.stringify([{ variantId: null }]))).toBeNull()
  })

  it('returns null for an empty array', () => {
    expect(parseSelections(JSON.stringify([]))).toBeNull()
  })
})
