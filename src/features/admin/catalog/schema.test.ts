import { describe, it, expect } from 'vitest'
import { updateProductSchema, createProductSchema } from '@/features/admin/catalog/schema'

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

  it('rejects a priceNgnMinor above the 1,000,000,000 bound with a friendly message', () => {
    const result = updateProductSchema.safeParse(validPayload({ priceNgnMinor: 1_000_000_001 }))
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((issue) => issue.path.join('.') === 'priceNgnMinor')
      expect(issue).toBeDefined()
      expect(issue?.message).toBe('Price is too large')
    }
  })

  it('accepts a priceNgnMinor exactly at the 1,000,000,000 bound', () => {
    const result = updateProductSchema.safeParse(validPayload({ priceNgnMinor: 1_000_000_000 }))
    expect(result.success).toBe(true)
  })

  it('rejects an inventory above the 1,000,000,000 bound with a friendly message', () => {
    const result = updateProductSchema.safeParse(validPayload({ inventory: 1_000_000_001 }))
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((issue) => issue.path.join('.') === 'inventory')
      expect(issue).toBeDefined()
      expect(issue?.message).toBe('Inventory is too large')
    }
  })

  it('accepts an inventory exactly at the 1,000,000,000 bound', () => {
    const result = updateProductSchema.safeParse(validPayload({ inventory: 1_000_000_000 }))
    expect(result.success).toBe(true)
  })

  it('rejects a priceUsdMinor above the 1,000,000,000 bound with a friendly message', () => {
    const result = updateProductSchema.safeParse(validPayload({ priceUsdMinor: 1_000_000_001 }))
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((issue) => issue.path.join('.') === 'priceUsdMinor')
      expect(issue).toBeDefined()
      expect(issue?.message).toBe('Price is too large')
    }
  })

  it('accepts a priceUsdMinor exactly at the 1,000,000,000 bound', () => {
    const result = updateProductSchema.safeParse(validPayload({ priceUsdMinor: 1_000_000_000 }))
    expect(result.success).toBe(true)
  })

  it('rejects a weightGrams above the 1,000,000,000 bound with a friendly message', () => {
    const result = updateProductSchema.safeParse(validPayload({ weightGrams: 1_000_000_001 }))
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((issue) => issue.path.join('.') === 'weightGrams')
      expect(issue).toBeDefined()
      expect(issue?.message).toBe('Weight is too large')
    }
  })

  it('accepts a weightGrams exactly at the 1,000,000,000 bound', () => {
    const result = updateProductSchema.safeParse(validPayload({ weightGrams: 1_000_000_000 }))
    expect(result.success).toBe(true)
  })

  // salePriceNgnMinor/salePriceUsdMinor share the same 1,000,000,000 bound as
  // their regular-price counterpart, but the sale<regular superRefine rule
  // also requires the sale price to sit strictly below the regular price —
  // and the regular price can never exceed 1,000,000,000 either. So a sale
  // price can never legitimately equal the bound in a valid payload; the
  // "accept" half below instead pins the largest value the bound actually
  // permits once the regular price sits at ITS bound (999,999,999, one below
  // 1,000,000,000), and the "reject" half confirms the .max() check still
  // fires (alongside the sale<regular issue, since both conditions are
  // violated at once by a value that far over).
  it('rejects a salePriceNgnMinor above the 1,000,000,000 bound with a friendly message', () => {
    const result = updateProductSchema.safeParse(validPayload({ salePriceNgnMinor: 1_000_000_001 }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path.join('.') === 'salePriceNgnMinor' && issue.message === 'Sale price is too large',
        ),
      ).toBe(true)
    }
  })

  it('accepts a salePriceNgnMinor one below the bound when priceNgnMinor sits at the 1,000,000,000 bound', () => {
    const result = updateProductSchema.safeParse(
      validPayload({ priceNgnMinor: 1_000_000_000, salePriceNgnMinor: 999_999_999 }),
    )
    expect(result.success).toBe(true)
  })

  it('rejects a salePriceUsdMinor above the 1,000,000,000 bound with a friendly message', () => {
    const result = updateProductSchema.safeParse(validPayload({ salePriceUsdMinor: 1_000_000_001 }))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path.join('.') === 'salePriceUsdMinor' && issue.message === 'Sale price is too large',
        ),
      ).toBe(true)
    }
  })

  it('accepts a salePriceUsdMinor one below the bound when priceUsdMinor sits at the 1,000,000,000 bound', () => {
    const result = updateProductSchema.safeParse(
      validPayload({ priceUsdMinor: 1_000_000_000, salePriceUsdMinor: 999_999_999 }),
    )
    expect(result.success).toBe(true)
  })
})

function validCreatePayload(overrides: Partial<Record<string, unknown>> = {}) {
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
    optionTypes: [{ name: 'Size', values: ['S', 'M', 'L'] }],
    newVariants: [
      {
        sku: 'MSE-BRC-001-S',
        inventory: 3,
        priceNgnMinor: null,
        priceUsdMinor: null,
        options: [{ name: 'Size', value: 'S' }],
      },
    ],
    images: [{ src: 'https://example.com/image.jpg', alt: 'Diamond tennis bracelet' }],
    ...overrides,
  }
}

describe('createProductSchema', () => {
  it('parses a valid payload', () => {
    const result = createProductSchema.safeParse(validCreatePayload())
    expect(result.success).toBe(true)
  })

  it('rejects an NGN sale price greater than or equal to the regular NGN price (same message as update)', () => {
    const result = createProductSchema.safeParse(
      validCreatePayload({ priceNgnMinor: 100_000, salePriceNgnMinor: 100_000 }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((issue) => issue.path.join('.') === 'salePriceNgnMinor')
      expect(issue?.message).toBe('Sale price must be below the regular NGN price')
    }
  })

  it('rejects a USD sale price greater than or equal to the regular USD price (same message as update)', () => {
    const result = createProductSchema.safeParse(
      validCreatePayload({ priceUsdMinor: 10_000, salePriceUsdMinor: 10_000 }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((issue) => issue.path.join('.') === 'salePriceUsdMinor')
      expect(issue?.message).toBe('Sale price must be below the regular USD price')
    }
  })

  it('rejects a newVariants option naming an optionType that does not exist', () => {
    const result = createProductSchema.safeParse(
      validCreatePayload({
        newVariants: [
          {
            sku: 'MSE-BRC-001-S',
            inventory: 3,
            priceNgnMinor: null,
            priceUsdMinor: null,
            options: [{ name: 'Color', value: 'Gold' }],
          },
        ],
      }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'newVariants.0.options.0')).toBe(true)
    }
  })

  it('rejects a newVariants option whose value is not listed under that optionType', () => {
    const result = createProductSchema.safeParse(
      validCreatePayload({
        newVariants: [
          {
            sku: 'MSE-BRC-001-S',
            inventory: 3,
            priceNgnMinor: null,
            priceUsdMinor: null,
            options: [{ name: 'Size', value: 'XL' }],
          },
        ],
      }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'newVariants.0.options.0')).toBe(true)
    }
  })

  it('rejects duplicate variant SKUs within the payload', () => {
    const result = createProductSchema.safeParse(
      validCreatePayload({
        optionTypes: [{ name: 'Size', values: ['S', 'M'] }],
        newVariants: [
          { sku: 'DUPE-SKU', inventory: 1, priceNgnMinor: null, priceUsdMinor: null, options: [{ name: 'Size', value: 'S' }] },
          { sku: 'DUPE-SKU', inventory: 1, priceNgnMinor: null, priceUsdMinor: null, options: [{ name: 'Size', value: 'M' }] },
        ],
      }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'newVariants.1.sku')).toBe(true)
    }
  })

  it('rejects duplicate option-type names', () => {
    const result = createProductSchema.safeParse(
      validCreatePayload({
        optionTypes: [
          { name: 'Size', values: ['S'] },
          { name: 'Size', values: ['M'] },
        ],
      }),
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'optionTypes.1.name')).toBe(true)
    }
  })

  it('rejects zero images', () => {
    const result = createProductSchema.safeParse(validCreatePayload({ images: [] }))
    expect(result.success).toBe(false)
  })

  it('rejects more than 8 images', () => {
    const result = createProductSchema.safeParse(
      validCreatePayload({
        images: Array.from({ length: 9 }, (_, i) => ({ src: `https://example.com/${i}.jpg`, alt: `Image ${i}` })),
      }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects more than 3 option types', () => {
    const result = createProductSchema.safeParse(
      validCreatePayload({
        optionTypes: [
          { name: 'Size', values: ['S'] },
          { name: 'Color', values: ['Gold'] },
          { name: 'Metal', values: ['18k'] },
          { name: 'Finish', values: ['Matte'] },
        ],
      }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects an optionType with zero values', () => {
    const result = createProductSchema.safeParse(validCreatePayload({ optionTypes: [{ name: 'Size', values: [] }] }))
    expect(result.success).toBe(false)
  })

  it('rejects a newVariant with zero options', () => {
    const result = createProductSchema.safeParse(
      validCreatePayload({
        newVariants: [{ sku: 'MSE-BRC-001-S', inventory: 3, priceNgnMinor: null, priceUsdMinor: null, options: [] }],
      }),
    )
    expect(result.success).toBe(false)
  })

  it('strips a `variants` field when present, since createProductSchema has no such field (edit-only; zod objects strip unknown keys by default here — not a strict/passthrough schema)', () => {
    const parsed = createProductSchema.safeParse({
      ...validCreatePayload(),
      variants: [{ id: 'v1', sku: 'MSE-BRC-001-S', inventory: 1, priceNgnMinor: null, priceUsdMinor: null }],
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(Object.prototype.hasOwnProperty.call(parsed.data, 'variants')).toBe(false)
    }
  })
})
