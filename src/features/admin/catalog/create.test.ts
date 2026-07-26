import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Same `$transaction` mocking idiom as `products.test.ts`/`transitions.test.ts`:
 * the callback receives spies shared with top-level `db`, so assertions don't
 * need to care whether a call happened inside or outside `$transaction`.
 */

const product = { findFirst: vi.fn(), create: vi.fn() }
const productVariant = { findFirst: vi.fn(), create: vi.fn() }
const productOptionType = { create: vi.fn() }
const productOptionValue = { createMany: vi.fn() }
const variantOption = { createMany: vi.fn() }
const productImage = { createMany: vi.fn() }
const productCollection = { createMany: vi.fn() }
const category = { findUnique: vi.fn() }
const subcategory = { findUnique: vi.fn() }
const collection = { findMany: vi.fn() }

const tx = { product, productOptionType, productOptionValue, productVariant, variantOption, productImage, productCollection }
const $transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx))

vi.mock('@/lib/db', () => ({
  db: {
    get product() {
      return product
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
    get productImage() {
      return productImage
    },
    get productCollection() {
      return productCollection
    },
    get category() {
      return category
    },
    get subcategory() {
      return subcategory
    },
    get collection() {
      return collection
    },
    $transaction: (...args: [(client: typeof tx) => unknown]) => $transaction(...args),
  },
}))

const { createProduct } = await import('@/features/admin/catalog/create')

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Diamond Tennis Bracelet',
    slug: 'diamond-tennis-bracelet',
    sku: 'MSE-BRC-001',
    shortDescription: 'A timeless tennis bracelet.',
    description: 'A timeless tennis bracelet in 18k gold.',
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
    categoryId: 'cat-bracelets',
    subcategoryId: 'sub-tennis',
    collectionIds: ['col-bestsellers'],
    optionTypes: [
      { name: 'Size', values: ['S', 'M'] },
      { name: 'Color', values: ['Gold', 'Silver'] },
    ],
    newVariants: [
      {
        sku: 'MSE-BRC-001-S-GOLD',
        inventory: 3,
        priceNgnMinor: null,
        priceUsdMinor: null,
        options: [
          { name: 'Size', value: 'S' },
          { name: 'Color', value: 'Gold' },
        ],
      },
      {
        sku: 'MSE-BRC-001-M-SILVER',
        inventory: 2,
        priceNgnMinor: 480_000_00,
        priceUsdMinor: 115_000,
        options: [
          { name: 'Size', value: 'M' },
          { name: 'Color', value: 'Silver' },
        ],
      },
    ],
    images: [
      { src: 'https://example.com/1.jpg', alt: 'Front view' },
      { src: 'https://example.com/2.jpg', alt: 'Side view' },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  product.findFirst.mockResolvedValue(null)
  productVariant.findFirst.mockResolvedValue(null)
  category.findUnique.mockResolvedValue({ slug: 'bracelets' })
  subcategory.findUnique.mockResolvedValue({ id: 'sub-tennis', categoryId: 'cat-bracelets', slug: 'tennis-bracelets' })
  collection.findMany.mockResolvedValue([{ slug: 'bestsellers' }])
  product.create.mockResolvedValue({ id: 'product-new' })
  productOptionType.create.mockImplementation(async ({ data }: { data: { name: string } }) => ({
    id: `opttype-${data.name}`,
  }))
  productVariant.create.mockImplementation(async ({ data }: { data: { sku: string } }) => ({
    id: `variant-${data.sku}`,
  }))
})

describe('createProduct', () => {
  it('happy path: parses input, pre-checks conflicts (no NOT clause), writes the full graph in one $transaction, returns productId + targets', async () => {
    const input = baseInput()
    const result = await createProduct(input)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.productId).toBe('product-new')

    expect(product.findFirst).toHaveBeenCalledWith({ where: { slug: input.slug } })
    expect(product.findFirst).toHaveBeenCalledWith({ where: { sku: input.sku } })
    expect(productVariant.findFirst).toHaveBeenCalledWith({
      where: { sku: { in: ['MSE-BRC-001-S-GOLD', 'MSE-BRC-001-M-SILVER'] } },
    })
    expect(category.findUnique).toHaveBeenCalledWith({ where: { id: 'cat-bracelets' }, select: { slug: true } })
    expect(subcategory.findUnique).toHaveBeenCalledWith({ where: { id: 'sub-tennis' } })

    expect($transaction).toHaveBeenCalledTimes(1)

    expect(product.create).toHaveBeenCalledWith({
      data: {
        name: input.name,
        slug: input.slug,
        sku: input.sku,
        shortDescription: input.shortDescription,
        description: input.description,
        material: input.material,
        materialTags: input.materialTags,
        badges: input.badges,
        priceNgnMinor: input.priceNgnMinor,
        priceUsdMinor: input.priceUsdMinor,
        salePriceNgnMinor: input.salePriceNgnMinor,
        salePriceUsdMinor: input.salePriceUsdMinor,
        inventory: input.inventory,
        weightGrams: input.weightGrams,
        status: input.status,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
      },
    })

    expect(productOptionType.create).toHaveBeenNthCalledWith(1, {
      data: { productId: 'product-new', name: 'Size', position: 0 },
    })
    expect(productOptionType.create).toHaveBeenNthCalledWith(2, {
      data: { productId: 'product-new', name: 'Color', position: 1 },
    })
    expect(productOptionValue.createMany).toHaveBeenNthCalledWith(1, {
      data: [
        { optionTypeId: 'opttype-Size', value: 'S', position: 0 },
        { optionTypeId: 'opttype-Size', value: 'M', position: 1 },
      ],
    })
    expect(productOptionValue.createMany).toHaveBeenNthCalledWith(2, {
      data: [
        { optionTypeId: 'opttype-Color', value: 'Gold', position: 0 },
        { optionTypeId: 'opttype-Color', value: 'Silver', position: 1 },
      ],
    })

    expect(productVariant.create).toHaveBeenNthCalledWith(1, {
      data: { productId: 'product-new', sku: 'MSE-BRC-001-S-GOLD', inventory: 3, priceNgnMinor: null, priceUsdMinor: null },
    })
    expect(productVariant.create).toHaveBeenNthCalledWith(2, {
      data: {
        productId: 'product-new',
        sku: 'MSE-BRC-001-M-SILVER',
        inventory: 2,
        priceNgnMinor: 480_000_00,
        priceUsdMinor: 115_000,
      },
    })
    expect(variantOption.createMany).toHaveBeenNthCalledWith(1, {
      data: [
        { variantId: 'variant-MSE-BRC-001-S-GOLD', name: 'Size', value: 'S' },
        { variantId: 'variant-MSE-BRC-001-S-GOLD', name: 'Color', value: 'Gold' },
      ],
    })
    expect(variantOption.createMany).toHaveBeenNthCalledWith(2, {
      data: [
        { variantId: 'variant-MSE-BRC-001-M-SILVER', name: 'Size', value: 'M' },
        { variantId: 'variant-MSE-BRC-001-M-SILVER', name: 'Color', value: 'Silver' },
      ],
    })

    expect(productImage.createMany).toHaveBeenCalledWith({
      data: [
        { productId: 'product-new', src: 'https://example.com/1.jpg', alt: 'Front view', position: 0 },
        { productId: 'product-new', src: 'https://example.com/2.jpg', alt: 'Side view', position: 1 },
      ],
    })

    expect(productCollection.createMany).toHaveBeenCalledWith({
      data: [{ productId: 'product-new', collectionId: 'col-bestsellers' }],
      skipDuplicates: true,
    })

    expect(result.revalidate).toContain('/products/diamond-tennis-bracelet')
    expect(result.revalidate).toContain('/bracelets')
    expect(result.revalidate).toContain('/bracelets/tennis-bracelets')
    expect(result.revalidate).toContain('/collections/bestsellers')
    expect(result.revalidate).toContain('/collections')
    expect(result.revalidate).toContain('/')
  })

  it('a product with no collections skips productCollection.createMany', async () => {
    const result = await createProduct(baseInput({ collectionIds: [] }))

    expect(result.ok).toBe(true)
    expect(productCollection.createMany).not.toHaveBeenCalled()
  })

  it('invalid input fails Zod parsing before any db read, returning issues', async () => {
    const result = await createProduct({ ...baseInput(), slug: 'Not Kebab Case' })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('invalid-input')
    expect(result.issues).toBeDefined()
    expect(product.findFirst).not.toHaveBeenCalled()
  })

  it('a slug conflict (against ALL products, no NOT clause) returns conflict-slug without writing', async () => {
    product.findFirst.mockResolvedValueOnce({ id: 'other-product' })

    const result = await createProduct(baseInput())

    expect(result).toEqual({ ok: false, error: 'conflict-slug' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('a sku conflict returns conflict-sku without writing', async () => {
    product.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'other-product' })

    const result = await createProduct(baseInput())

    expect(result).toEqual({ ok: false, error: 'conflict-sku' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('a variant sku conflict returns conflict-sku without writing', async () => {
    productVariant.findFirst.mockResolvedValue({ id: 'other-variant' })

    const result = await createProduct(baseInput())

    expect(result).toEqual({ ok: false, error: 'conflict-sku' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('an unknown categoryId returns invalid-taxonomy without writing', async () => {
    category.findUnique.mockResolvedValue(null)

    const result = await createProduct(baseInput())

    expect(result).toEqual({ ok: false, error: 'invalid-taxonomy' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('a subcategory not belonging to the chosen category returns invalid-taxonomy', async () => {
    subcategory.findUnique.mockResolvedValue({ id: 'sub-other', categoryId: 'cat-other', slug: 'other-sub' })

    const result = await createProduct(baseInput())

    expect(result).toEqual({ ok: false, error: 'invalid-taxonomy' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('an unknown subcategoryId returns invalid-taxonomy', async () => {
    subcategory.findUnique.mockResolvedValue(null)

    const result = await createProduct(baseInput())

    expect(result).toEqual({ ok: false, error: 'invalid-taxonomy' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('never throws: a db error before the transaction is caught and mapped to error', async () => {
    product.findFirst.mockRejectedValue(new Error('boom'))

    const result = await createProduct(baseInput())

    expect(result).toEqual({ ok: false, error: 'error' })
  })

  it('never throws: a db error inside the transaction is caught and mapped to error, with no writes after the failure point', async () => {
    productVariant.create.mockRejectedValueOnce(new Error('boom'))

    const result = await createProduct(baseInput())

    expect(result).toEqual({ ok: false, error: 'error' })
    expect(productImage.createMany).not.toHaveBeenCalled()
    expect(productCollection.createMany).not.toHaveBeenCalled()
  })
})
