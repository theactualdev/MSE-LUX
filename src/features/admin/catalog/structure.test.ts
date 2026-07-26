import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Same `$transaction` mocking idiom as `products.test.ts`/`create.test.ts`:
 * the callback receives spies shared with top-level `db`, so assertions
 * don't need to care whether a call happened inside or outside `$transaction`.
 */

const product = { findUnique: vi.fn() }
const productImage = { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() }
const productVariant = { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), create: vi.fn() }
const productOptionType = { deleteMany: vi.fn(), create: vi.fn() }
const productOptionValue = { createMany: vi.fn() }
const variantOption = { createMany: vi.fn() }
const orderLine = { count: vi.fn() }
const collection = { findMany: vi.fn() }

const tx = { productImage, productVariant, productOptionType, productOptionValue, variantOption, orderLine }
const $transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx))

vi.mock('@/lib/db', () => ({
  db: {
    get product() {
      return product
    },
    get productImage() {
      return productImage
    },
    get productVariant() {
      return productVariant
    },
    get productOptionType() {
      return productOptionType
    },
    get productOptionValue() {
      return productOptionValue
    },
    get variantOption() {
      return variantOption
    },
    get orderLine() {
      return orderLine
    },
    get collection() {
      return collection
    },
    $transaction: (...args: [(client: typeof tx) => unknown]) => $transaction(...args),
  },
}))

const deleteProductImageObject = vi.fn()
vi.mock('./images', () => ({
  deleteProductImageObject: (...args: [string]) => deleteProductImageObject(...args),
}))

const { updateProductImages, updateProductVariants } = await import('@/features/admin/catalog/structure')

const ID = 'product-1'

function currentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    slug: 'diamond-tennis-bracelet',
    category: { slug: 'bracelets' },
    subcategory: { slug: 'tennis-bracelets' },
    collections: [{ collectionId: 'col-bestsellers' }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  product.findUnique.mockResolvedValue(currentRow())
  collection.findMany.mockResolvedValue([{ slug: 'bestsellers' }])
  deleteProductImageObject.mockResolvedValue(true)
  orderLine.count.mockResolvedValue(0)
  productVariant.findFirst.mockResolvedValue(null)
  productVariant.findMany.mockResolvedValue([])
  productVariant.create.mockImplementation(async ({ data }: { data: { sku: string } }) => ({ id: `variant-${data.sku}` }))
  productOptionType.create.mockImplementation(async ({ data }: { data: { name: string } }) => ({ id: `opttype-${data.name}` }))
})

describe('updateProductImages', () => {
  const twoImages = [
    { src: 'https://example.com/a.jpg', alt: 'Front' },
    { src: 'https://example.com/b.jpg', alt: 'Side' },
  ]

  it('happy path: replaces the image set inside one $transaction, in array order, and returns full targets', async () => {
    productImage.findMany.mockResolvedValue([{ src: 'https://example.com/a.jpg' }, { src: 'https://example.com/b.jpg' }])

    const result = await updateProductImages(ID, { images: twoImages })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')

    expect($transaction).toHaveBeenCalledTimes(1)
    expect(productImage.deleteMany).toHaveBeenCalledWith({ where: { productId: ID } })
    expect(productImage.createMany).toHaveBeenCalledWith({
      data: [
        { productId: ID, src: 'https://example.com/a.jpg', alt: 'Front', position: 0 },
        { productId: ID, src: 'https://example.com/b.jpg', alt: 'Side', position: 1 },
      ],
    })

    expect(result.revalidate).toContain('/products/diamond-tennis-bracelet')
    expect(result.revalidate).toContain('/bracelets')
    expect(result.revalidate).toContain('/bracelets/tennis-bracelets')
    expect(result.revalidate).toContain('/collections/bestsellers')
    expect(result.revalidate).toContain('/collections')
    expect(result.revalidate).toContain('/')
  })

  it('deletes storage objects ONLY for srcs removed from the DB set, after the transaction commits', async () => {
    productImage.findMany.mockResolvedValue([
      { src: 'https://example.com/a.jpg' },
      { src: 'https://example.com/removed.jpg' },
    ])

    const callOrder: string[] = []
    productImage.deleteMany.mockImplementation(async () => {
      callOrder.push('tx-deleteMany')
    })
    deleteProductImageObject.mockImplementation(async (src: string) => {
      callOrder.push(`storage-delete:${src}`)
      return true
    })

    const result = await updateProductImages(ID, { images: [{ src: 'https://example.com/a.jpg', alt: 'Front' }] })

    expect(result.ok).toBe(true)
    expect(deleteProductImageObject).toHaveBeenCalledTimes(1)
    expect(deleteProductImageObject).toHaveBeenCalledWith('https://example.com/removed.jpg')
    // the tx must have fully resolved before any storage delete fires
    expect(callOrder).toEqual(['tx-deleteMany', 'storage-delete:https://example.com/removed.jpg'])
  })

  it('SECURITY PIN: a client-submitted src that never existed in the DB is never passed to deleteProductImageObject', async () => {
    // current DB has only 'a.jpg'; submitted payload swaps in a brand-new src the client invented
    productImage.findMany.mockResolvedValue([{ src: 'https://example.com/a.jpg' }])

    const result = await updateProductImages(ID, {
      images: [{ src: 'https://evil.example.com/not-in-db.jpg', alt: 'Injected' }],
    })

    expect(result.ok).toBe(true)
    // the removed set is (DB srcs) minus (submitted srcs) = { a.jpg } — never the injected src
    expect(deleteProductImageObject).toHaveBeenCalledTimes(1)
    expect(deleteProductImageObject).toHaveBeenCalledWith('https://example.com/a.jpg')
    expect(deleteProductImageObject).not.toHaveBeenCalledWith('https://evil.example.com/not-in-db.jpg')
  })

  it('a storage delete failure is logged but does not affect the ok result', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    productImage.findMany.mockResolvedValue([{ src: 'https://example.com/removed.jpg' }])
    deleteProductImageObject.mockResolvedValue(false)

    const result = await updateProductImages(ID, { images: twoImages })

    expect(result.ok).toBe(true)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('no removed srcs means no storage deletes', async () => {
    productImage.findMany.mockResolvedValue([{ src: 'https://example.com/a.jpg' }, { src: 'https://example.com/b.jpg' }])

    await updateProductImages(ID, { images: twoImages })

    expect(deleteProductImageObject).not.toHaveBeenCalled()
  })

  it('invalid input (empty array) fails Zod parsing before any db read', async () => {
    const result = await updateProductImages(ID, { images: [] })

    expect(result).toEqual({ ok: false, error: 'invalid-input', issues: expect.any(Array) })
    expect(product.findUnique).not.toHaveBeenCalled()
  })

  it('invalid input (more than 8 images) fails Zod parsing', async () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ src: `https://example.com/${i}.jpg`, alt: `Image ${i}` }))

    const result = await updateProductImages(ID, { images: nine })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('invalid-input')
  })

  it('invalid input (bad url) fails Zod parsing', async () => {
    const result = await updateProductImages(ID, { images: [{ src: 'not-a-url', alt: 'x' }] })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('invalid-input')
  })

  it('an unknown product returns not-found without opening a transaction', async () => {
    product.findUnique.mockResolvedValue(null)

    const result = await updateProductImages(ID, { images: twoImages })

    expect(result).toEqual({ ok: false, error: 'not-found' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('never throws: a db error is caught and mapped to error', async () => {
    product.findUnique.mockRejectedValue(new Error('boom'))

    const result = await updateProductImages(ID, { images: twoImages })

    expect(result).toEqual({ ok: false, error: 'error' })
  })
})

describe('updateProductVariants', () => {
  function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      addVariants: [],
      deleteVariantIds: [],
      optionTypes: [{ name: 'Size', values: ['S', 'M'] }],
      ...overrides,
    }
  }

  it('happy path: adds variants, deletes variants, and replaces optionTypes inside one $transaction', async () => {
    productVariant.findMany.mockResolvedValue([
      { id: 'variant-old-1', options: [{ name: 'Size', value: 'S' }] },
      { id: 'variant-old-2', options: [{ name: 'Size', value: 'M' }] },
    ])

    const result = await updateProductVariants(
      ID,
      baseInput({
        addVariants: [
          {
            sku: 'MSE-NEW-1',
            inventory: 4,
            priceNgnMinor: null,
            priceUsdMinor: null,
            options: [{ name: 'Size', value: 'M' }],
          },
        ],
        deleteVariantIds: ['variant-old-1'],
        optionTypes: [{ name: 'Size', values: ['S', 'M', 'L'] }],
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')

    expect($transaction).toHaveBeenCalledTimes(1)
    expect(orderLine.count).toHaveBeenCalledWith({ where: { variantId: { in: ['variant-old-1'] } } })
    expect(productVariant.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['variant-old-1'] } } })
    expect(productOptionType.deleteMany).toHaveBeenCalledWith({ where: { productId: ID } })
    expect(productOptionType.create).toHaveBeenCalledWith({ data: { productId: ID, name: 'Size', position: 0 } })
    expect(productOptionValue.createMany).toHaveBeenCalledWith({
      data: [
        { optionTypeId: 'opttype-Size', value: 'S', position: 0 },
        { optionTypeId: 'opttype-Size', value: 'M', position: 1 },
        { optionTypeId: 'opttype-Size', value: 'L', position: 2 },
      ],
    })
    expect(productVariant.create).toHaveBeenCalledWith({
      data: { productId: ID, sku: 'MSE-NEW-1', inventory: 4, priceNgnMinor: null, priceUsdMinor: null },
    })
    expect(variantOption.createMany).toHaveBeenCalledWith({
      data: [{ variantId: 'variant-MSE-NEW-1', name: 'Size', value: 'M' }],
    })

    expect(result.revalidate).toContain('/products/diamond-tennis-bracelet')
  })

  it('an unknown product returns not-found without opening a transaction', async () => {
    product.findUnique.mockResolvedValue(null)

    const result = await updateProductVariants(ID, baseInput())

    expect(result).toEqual({ ok: false, error: 'not-found' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('a deleteVariantIds entry not belonging to the product returns invalid-input without a transaction', async () => {
    productVariant.findMany.mockResolvedValue([{ id: 'variant-old-1', options: [] }])

    const result = await updateProductVariants(ID, baseInput({ deleteVariantIds: ['variant-someone-elses'] }))

    expect(result).toEqual({ ok: false, error: 'invalid-input' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('an addVariants option not listed in the submitted optionTypes fails Zod parsing before any db read', async () => {
    const result = await updateProductVariants(
      ID,
      baseInput({
        addVariants: [
          {
            sku: 'MSE-NEW-1',
            inventory: 1,
            priceNgnMinor: null,
            priceUsdMinor: null,
            options: [{ name: 'Size', value: 'XL' }],
          },
        ],
      }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('invalid-input')
    expect(product.findUnique).not.toHaveBeenCalled()
  })

  it('duplicate SKUs within addVariants fails Zod parsing', async () => {
    const dupeVariant = {
      sku: 'MSE-NEW-1',
      inventory: 1,
      priceNgnMinor: null,
      priceUsdMinor: null,
      options: [{ name: 'Size', value: 'S' }],
    }

    const result = await updateProductVariants(ID, baseInput({ addVariants: [dupeVariant, dupeVariant] }))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('invalid-input')
  })

  it('a global variant-sku conflict (excluding this product) returns conflict-sku without a transaction', async () => {
    productVariant.findMany.mockResolvedValue([])
    productVariant.findFirst.mockResolvedValue({ id: 'other-variant' })

    const result = await updateProductVariants(
      ID,
      baseInput({
        addVariants: [
          {
            sku: 'MSE-TAKEN',
            inventory: 1,
            priceNgnMinor: null,
            priceUsdMinor: null,
            options: [{ name: 'Size', value: 'S' }],
          },
        ],
      }),
    )

    expect(result).toEqual({ ok: false, error: 'conflict-sku' })
    expect(productVariant.findFirst).toHaveBeenCalledWith({
      where: { sku: { in: ['MSE-TAKEN'] }, NOT: { productId: ID } },
    })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('replacing optionTypes such that a SURVIVING existing variant references a removed value returns invalid-input', async () => {
    // 'variant-old-1' survives (not deleted) and is Size:L, but the new optionTypes drop 'L'
    productVariant.findMany.mockResolvedValue([{ id: 'variant-old-1', options: [{ name: 'Size', value: 'L' }] }])

    const result = await updateProductVariants(
      ID,
      baseInput({ optionTypes: [{ name: 'Size', values: ['S', 'M'] }] }),
    )

    expect(result).toEqual({ ok: false, error: 'invalid-input' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('a DELETED existing variant referencing a removed value is fine (it will not survive)', async () => {
    productVariant.findMany.mockResolvedValue([{ id: 'variant-old-1', options: [{ name: 'Size', value: 'L' }] }])

    const result = await updateProductVariants(
      ID,
      baseInput({
        deleteVariantIds: ['variant-old-1'],
        optionTypes: [{ name: 'Size', values: ['S', 'M'] }],
      }),
    )

    expect(result.ok).toBe(true)
  })

  it('any order lines referencing a to-be-deleted variant returns variant-has-orders and makes NO writes', async () => {
    productVariant.findMany.mockResolvedValue([{ id: 'variant-old-1', options: [{ name: 'Size', value: 'S' }] }])
    orderLine.count.mockResolvedValue(2)

    const result = await updateProductVariants(ID, baseInput({ deleteVariantIds: ['variant-old-1'] }))

    expect(result).toEqual({ ok: false, error: 'variant-has-orders' })
    expect(productVariant.deleteMany).not.toHaveBeenCalled()
    expect(productOptionType.deleteMany).not.toHaveBeenCalled()
    expect(productOptionType.create).not.toHaveBeenCalled()
    expect(productVariant.create).not.toHaveBeenCalled()
  })

  it('no addVariants and no deleteVariantIds still replaces optionTypes (validated against all-surviving existing variants)', async () => {
    productVariant.findMany.mockResolvedValue([{ id: 'variant-old-1', options: [{ name: 'Size', value: 'S' }] }])

    const result = await updateProductVariants(ID, baseInput({ optionTypes: [{ name: 'Size', values: ['S', 'M'] }] }))

    expect(result.ok).toBe(true)
    expect(productVariant.deleteMany).not.toHaveBeenCalled()
    expect(productOptionType.deleteMany).toHaveBeenCalledWith({ where: { productId: ID } })
  })

  it('never throws: a db error before the transaction is caught and mapped to error', async () => {
    product.findUnique.mockRejectedValue(new Error('boom'))

    const result = await updateProductVariants(ID, baseInput())

    expect(result).toEqual({ ok: false, error: 'error' })
  })

  it('never throws: a db error inside the transaction is caught and mapped to error', async () => {
    productOptionType.create.mockRejectedValueOnce(new Error('boom'))

    const result = await updateProductVariants(ID, baseInput())

    expect(result).toEqual({ ok: false, error: 'error' })
  })
})
