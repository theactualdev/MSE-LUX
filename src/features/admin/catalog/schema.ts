import { z } from 'zod'

/**
 * Validates the full admin product-edit form payload. Every writable
 * `Product` scalar plus its variant rows and collection memberships — the
 * shape `updateProduct` (`./products.ts`) parses `unknown` Server Action
 * input against before touching the database.
 */
export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case only'),
    sku: z.string().trim().min(1).max(64),
    shortDescription: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1),
    material: z.string().trim().min(1).max(120),
    materialTags: z.array(z.string().trim().min(1)).max(12),
    badges: z.array(z.enum(['NEW', 'BEST_SELLER'])).max(2),
    priceNgnMinor: z.number().int().positive(),
    priceUsdMinor: z.number().int().positive(),
    salePriceNgnMinor: z.number().int().positive().nullable(),
    salePriceUsdMinor: z.number().int().positive().nullable(),
    inventory: z.number().int().min(0),
    weightGrams: z.number().int().positive().nullable(),
    status: z.enum(['ACTIVE', 'DRAFT']),
    seoTitle: z.string().trim().max(120).nullable(),
    seoDescription: z.string().trim().max(300).nullable(),
    categoryId: z.string().min(1),
    subcategoryId: z.string().min(1).nullable(),
    collectionIds: z.array(z.string().min(1)),
    variants: z.array(
      z.object({
        id: z.string().min(1),
        sku: z.string().trim().min(1).max(64),
        inventory: z.number().int().min(0),
        priceNgnMinor: z.number().int().positive().nullable(),
        priceUsdMinor: z.number().int().positive().nullable(),
      }),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.salePriceNgnMinor !== null && data.salePriceNgnMinor >= data.priceNgnMinor)
      ctx.addIssue({ code: 'custom', path: ['salePriceNgnMinor'], message: 'Sale price must be below the regular NGN price' })
    if (data.salePriceUsdMinor !== null && data.salePriceUsdMinor >= data.priceUsdMinor)
      ctx.addIssue({ code: 'custom', path: ['salePriceUsdMinor'], message: 'Sale price must be below the regular USD price' })
  })

export type UpdateProductInput = z.infer<typeof updateProductSchema>
