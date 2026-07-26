import { describe, it, expect } from 'vitest'
import { updateProductSchema } from '@/features/admin/catalog/schema'

function validPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Diamond Tennis Bracelet',
    slug: 'diamond-tennis-bracelet',
    sku: 'MSE-BRC-001',
    shortDescription: 'A timeless tennis bracelet.',
    description: 'A timeless tennis bracelet in 18k gold with brilliant-cut diamonds.',
    material: '18k Gold',
    materialTags: ['gold', 'diamond'],
    badges: ['NEW'],
    priceNgnMinor: 500_000_00,
    priceUsdMinor: 120_000,
    salePriceNgnMinor: null,
    salePriceUsdMinor: null,
    inventory: 5,
    weightGrams: 42,
    status: 'ACTIVE',
    seoTitle: null,
    seoDescription: null,
    categoryId: 'cat-1',
    subcategoryId: null,
    collectionIds: [],
    variants: [],
    ...overrides,
  }
}

describe('updateProductSchema', () => {
  it('parses a valid payload', () => {
    const result = updateProductSchema.safeParse(validPayload())
    expect(result.success).toBe(true)
  })

  it('rejects a non-kebab-case slug', () => {
    const result = updateProductSchema.safeParse(validPayload({ slug: 'Bad Slug' }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'slug')).toBe(true)
    }
  })

  it('rejects an NGN sale price greater than or equal to the regular NGN price', () => {
    const result = updateProductSchema.safeParse(
      validPayload({ priceNgnMinor: 100_000, salePriceNgnMinor: 100_000 }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'salePriceNgnMinor')).toBe(true)
    }
  })

  it('rejects an NGN sale price strictly above the regular NGN price too', () => {
    const result = updateProductSchema.safeParse(
      validPayload({ priceNgnMinor: 100_000, salePriceNgnMinor: 150_000 }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'salePriceNgnMinor')).toBe(true)
    }
  })

  it('rejects a USD sale price greater than or equal to the regular USD price', () => {
    const result = updateProductSchema.safeParse(
      validPayload({ priceUsdMinor: 10_000, salePriceUsdMinor: 10_000 }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'salePriceUsdMinor')).toBe(true)
    }
  })

  it('rejects negative inventory', () => {
    const result = updateProductSchema.safeParse(validPayload({ inventory: -1 }))
    expect(result.success).toBe(false)
  })

  it('rejects a zero regular price', () => {
    const result = updateProductSchema.safeParse(validPayload({ priceNgnMinor: 0 }))
    expect(result.success).toBe(false)
  })

  it('accepts a sale price strictly below the regular price', () => {
    const result = updateProductSchema.safeParse(
      validPayload({ priceNgnMinor: 100_000, salePriceNgnMinor: 90_000 }),
    )
    expect(result.success).toBe(true)
  })
})
