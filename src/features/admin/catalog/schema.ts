import { z } from 'zod'

/**
 * Shared upper bound for every money/weight/inventory integer in the
 * scalar shape below — a friendly backstop against fat-fingered or
 * malicious payloads (e.g. price entered in the wrong unit), not a real
 * business ceiling.
 */
const LARGE_INT_MAX = 1_000_000_000

/**
 * Scalar/taxonomy fields shared by every admin product write: the full
 * edit (`updateProductSchema`) and the from-scratch creation payload
 * (`createProductSchema`, `./create.ts`). Kept as a plain shape object —
 * not a `z.object` — so each schema can `.extend()` it with its own
 * variant/option/image fields.
 */
const productScalarShape = {
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case only'),
  sku: z.string().trim().min(1).max(64),
  shortDescription: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1),
  material: z.string().trim().min(1).max(120),
  materialTags: z.array(z.string().trim().min(1)).max(12),
  badges: z.array(z.enum(['NEW', 'BEST_SELLER'])).max(2),
  priceNgnMinor: z.number().int().positive().max(LARGE_INT_MAX, 'Price is too large'),
  priceUsdMinor: z.number().int().positive().max(LARGE_INT_MAX, 'Price is too large'),
  salePriceNgnMinor: z.number().int().positive().max(LARGE_INT_MAX, 'Sale price is too large').nullable(),
  salePriceUsdMinor: z.number().int().positive().max(LARGE_INT_MAX, 'Sale price is too large').nullable(),
  inventory: z.number().int().min(0).max(LARGE_INT_MAX, 'Inventory is too large'),
  weightGrams: z.number().int().positive().max(LARGE_INT_MAX, 'Weight is too large').nullable(),
  status: z.enum(['ACTIVE', 'DRAFT']),
  seoTitle: z.string().trim().max(120).nullable(),
  seoDescription: z.string().trim().max(300).nullable(),
  categoryId: z.string().min(1),
  subcategoryId: z.string().min(1).nullable(),
  collectionIds: z.array(z.string().min(1)),
} as const

const productScalarSchema = z.object(productScalarShape)

type MoneyFields = {
  priceNgnMinor: number
  priceUsdMinor: number
  salePriceNgnMinor: number | null
  salePriceUsdMinor: number | null
}

/**
 * Shared by both schemas' `superRefine`: a sale price, when set, must sit
 * strictly below the regular price — checked independently per currency.
 */
function checkSalePrices<T extends MoneyFields>(data: T, ctx: z.core.$RefinementCtx<T>): void {
  if (data.salePriceNgnMinor !== null && data.salePriceNgnMinor >= data.priceNgnMinor)
    ctx.addIssue({ code: 'custom', path: ['salePriceNgnMinor'], message: 'Sale price must be below the regular NGN price' })
  if (data.salePriceUsdMinor !== null && data.salePriceUsdMinor >= data.priceUsdMinor)
    ctx.addIssue({ code: 'custom', path: ['salePriceUsdMinor'], message: 'Sale price must be below the regular USD price' })
}

/**
 * Validates the full admin product-edit form payload. Every writable
 * `Product` scalar plus its variant rows and collection memberships — the
 * shape `updateProduct` (`./products.ts`) parses `unknown` Server Action
 * input against before touching the database.
 */
export const updateProductSchema = productScalarSchema
  .extend({
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
  .superRefine(checkSalePrices)

export type UpdateProductInput = z.infer<typeof updateProductSchema>

/**
 * Validates the admin product-CREATION payload: the same scalar/taxonomy
 * fields as `updateProductSchema`, minus the edit-only `variants` array,
 * plus the from-scratch option-type / variant / image graph `createProduct`
 * (`./create.ts`) writes in one transaction.
 *
 * `superRefine` enforces, beyond the shared sale-price check: every
 * `newVariants[].options[]` entry names an `optionTypes[]` entry and lists
 * one of its declared values; no duplicate variant SKUs within the
 * payload; no duplicate option-type names.
 */
export const createProductSchema = productScalarSchema
  .extend({
    optionTypes: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(40),
          values: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
        }),
      )
      .max(3),
    newVariants: z.array(
      z.object({
        sku: z.string().trim().min(1).max(64),
        inventory: z.number().int().min(0),
        priceNgnMinor: z.number().int().positive().nullable(),
        priceUsdMinor: z.number().int().positive().nullable(),
        options: z
          .array(
            z.object({
              name: z.string().trim().min(1),
              value: z.string().trim().min(1),
            }),
          )
          .min(1),
      }),
    ),
    images: z
      .array(
        z.object({
          src: z.string().url(),
          alt: z.string().trim().min(1).max(200),
        }),
      )
      .min(1)
      .max(8),
  })
  .superRefine((data, ctx) => {
    checkSalePrices(data, ctx)

    const optionTypeNames = new Set<string>()
    data.optionTypes.forEach((optionType, index) => {
      if (optionTypeNames.has(optionType.name))
        ctx.addIssue({ code: 'custom', path: ['optionTypes', index, 'name'], message: 'Duplicate option type name' })
      optionTypeNames.add(optionType.name)
    })

    const valuesByOptionTypeName = new Map(data.optionTypes.map((optionType) => [optionType.name, new Set(optionType.values)]))

    const seenVariantSkus = new Set<string>()
    data.newVariants.forEach((variant, variantIndex) => {
      if (seenVariantSkus.has(variant.sku))
        ctx.addIssue({ code: 'custom', path: ['newVariants', variantIndex, 'sku'], message: 'Duplicate variant SKU' })
      seenVariantSkus.add(variant.sku)

      variant.options.forEach((option, optionIndex) => {
        const allowedValues = valuesByOptionTypeName.get(option.name)
        if (!allowedValues || !allowedValues.has(option.value))
          ctx.addIssue({
            code: 'custom',
            path: ['newVariants', variantIndex, 'options', optionIndex],
            message: `Option "${option.name}: ${option.value}" is not listed in optionTypes`,
          })
      })
    })
  })

export type CreateProductInput = z.infer<typeof createProductSchema>
