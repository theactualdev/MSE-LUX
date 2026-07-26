import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Same `$transaction` mocking idiom as `transitions.test.ts`: the callback
 * receives spies shared with top-level `db`, so assertions don't need to
 * care whether a call happened inside or outside `$transaction`.
 */

const product = {
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
}

const productVariant = {
  findFirst: vi.fn(),
  update: vi.fn(),
}

const productCollection = {
  deleteMany: vi.fn(),
  createMany: vi.fn(),
}

const subcategory = { findUnique: vi.fn() }
const category = { findUnique: vi.fn() }
const collection = { findMany: vi.fn() }
const orderLine = { count: vi.fn() }

const tx = { product, productVariant, productCollection, orderLine }
const $transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx))

vi.mock('@/lib/db', () => ({
  db: {
    get product() {
      return product
    },
    get productVariant() {
      return productVariant
    },
    get productCollection() {
      return productCollection
    },
    get subcategory() {
      return subcategory
    },
    get category() {
      return category
    },
    get collection() {
      return collection
    },
    get orderLine() {
      return orderLine
    },
    $transaction: (...args: [(client: typeof tx) => unknown]) => $transaction(...args),
  },
}))

const { updateProduct, archiveProduct, restoreProduct, deleteProduct, computeProductRevalidateTargets } = await import(
  '@/features/admin/catalog/products'
)

const ID = 'product-1'

function baseCurrentRow(overrides: Partial<Record<string, unknown>> = {}) {
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
    weightGrams: 42,
    status: 'ACTIVE',
    seoTitle: null,
    seoDescription: null,
    categoryId: 'cat-bracelets',
    subcategoryId: 'sub-tennis',
    category: { slug: 'bracelets' },
    subcategory: { slug: 'tennis-bracelets' },
    variants: [{ id: 'variant-1', sku: 'MSE-BRC-001-S', inventory: 3, priceNgnMinor: null, priceUsdMinor: null }],
    collections: [{ collectionId: 'col-bestsellers' }],
    ...overrides,
  }
}

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
    variants: [{ id: 'variant-1', sku: 'MSE-BRC-001-S', inventory: 3, priceNgnMinor: null, priceUsdMinor: null }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  product.findFirst.mockResolvedValue(null)
  productVariant.findFirst.mockResolvedValue(null)
  subcategory.findUnique.mockResolvedValue({ id: 'sub-tennis', categoryId: 'cat-bracelets', slug: 'tennis-bracelets' })
  collection.findMany.mockResolvedValue([{ slug: 'bestsellers' }])
})

describe('updateProduct', () => {
  it('happy path: parses input, pre-checks conflicts/taxonomy, writes in one $transaction, returns targets', async () => {
    product.findUnique.mockResolvedValue(
      baseCurrentRow({
        slug: 'diamond-tennis-bracelet-old',
        category: { slug: 'bracelets' },
        subcategory: { slug: 'tennis-bracelets' },
      }),
    )

    const input = baseInput({
      slug: 'diamond-tennis-bracelet-new',
      name: 'Diamond Tennis Bracelet Deluxe',
      variants: [{ id: 'variant-1', sku: 'MSE-BRC-001-S', inventory: 7, priceNgnMinor: 480_000_00, priceUsdMinor: 115_000 }],
    })

    const result = await updateProduct(ID, input)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')

    expect(product.findFirst).toHaveBeenCalledWith({ where: { slug: input.slug, NOT: { id: ID } } })
    expect(product.findFirst).toHaveBeenCalledWith({ where: { sku: input.sku, NOT: { id: ID } } })
    expect(productVariant.findFirst).toHaveBeenCalledWith({
      where: { sku: { in: ['MSE-BRC-001-S'] }, NOT: { productId: ID } },
    })

    expect($transaction).toHaveBeenCalledTimes(1)
    expect(product.update).toHaveBeenCalledWith({
      where: { id: ID },
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
    expect(productVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { sku: 'MSE-BRC-001-S', inventory: 7, priceNgnMinor: 480_000_00, priceUsdMinor: 115_000 },
    })
    expect(productCollection.deleteMany).toHaveBeenCalledWith({
      where: { productId: ID, collectionId: { notIn: ['col-bestsellers'] } },
    })
    expect(productCollection.createMany).toHaveBeenCalledWith({
      data: [{ productId: ID, collectionId: 'col-bestsellers' }],
      skipDuplicates: true,
    })

    expect(result.revalidate).toContain('/products/diamond-tennis-bracelet-old')
    expect(result.revalidate).toContain('/products/diamond-tennis-bracelet-new')
    expect(result.revalidate).toContain('/bracelets')
    expect(result.revalidate).toContain('/bracelets/tennis-bracelets')
    expect(result.revalidate).toContain('/collections/bestsellers')
    expect(result.revalidate).toContain('/collections')
    expect(result.revalidate).toContain('/')
  })

  it('subcategory not belonging to the chosen category returns invalid-taxonomy', async () => {
    product.findUnique.mockResolvedValue(baseCurrentRow())
    subcategory.findUnique.mockResolvedValue({ id: 'sub-other', categoryId: 'cat-other', slug: 'other-sub' })

    const result = await updateProduct(ID, baseInput({ subcategoryId: 'sub-other', categoryId: 'cat-bracelets' }))

    expect(result).toEqual({ ok: false, error: 'invalid-taxonomy' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('an unknown subcategoryId returns invalid-taxonomy', async () => {
    product.findUnique.mockResolvedValue(baseCurrentRow())
    subcategory.findUnique.mockResolvedValue(null)

    const result = await updateProduct(ID, baseInput({ subcategoryId: 'sub-missing' }))

    expect(result).toEqual({ ok: false, error: 'invalid-taxonomy' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('a variant id not belonging to the product returns invalid-input', async () => {
    product.findUnique.mockResolvedValue(baseCurrentRow())

    const result = await updateProduct(
      ID,
      baseInput({ variants: [{ id: 'variant-not-mine', sku: 'X', inventory: 1, priceNgnMinor: null, priceUsdMinor: null }] }),
    )

    expect(result).toEqual({ ok: false, error: 'invalid-input' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('a slug conflict with another product returns conflict-slug without writing', async () => {
    product.findUnique.mockResolvedValue(baseCurrentRow())
    product.findFirst.mockResolvedValueOnce({ id: 'other-product' })

    const result = await updateProduct(ID, baseInput())

    expect(result).toEqual({ ok: false, error: 'conflict-slug' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('a sku conflict with another product returns conflict-sku without writing', async () => {
    product.findUnique.mockResolvedValue(baseCurrentRow())
    product.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'other-product' })

    const result = await updateProduct(ID, baseInput())

    expect(result).toEqual({ ok: false, error: 'conflict-sku' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('a variant sku conflict with another product returns conflict-sku without writing', async () => {
    product.findUnique.mockResolvedValue(baseCurrentRow())
    productVariant.findFirst.mockResolvedValue({ id: 'other-variant' })

    const result = await updateProduct(ID, baseInput())

    expect(result).toEqual({ ok: false, error: 'conflict-sku' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('an unknown product id returns not-found without further reads', async () => {
    product.findUnique.mockResolvedValue(null)

    const result = await updateProduct(ID, baseInput())

    expect(result).toEqual({ ok: false, error: 'not-found' })
    expect(product.findFirst).not.toHaveBeenCalled()
  })

  it('invalid input fails Zod parsing before any db read, returning issues', async () => {
    const result = await updateProduct(ID, { ...baseInput(), slug: 'Not Kebab Case' })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('invalid-input')
    expect(result.issues).toBeDefined()
    expect(product.findUnique).not.toHaveBeenCalled()
  })

  it('never throws: a db error is caught and mapped to error', async () => {
    product.findUnique.mockRejectedValue(new Error('boom'))

    const result = await updateProduct(ID, baseInput())

    expect(result).toEqual({ ok: false, error: 'error' })
  })

  it('stock-only: an input differing from current only in inventory revalidates only the PDP', async () => {
    product.findUnique.mockResolvedValue(baseCurrentRow())

    const result = await updateProduct(ID, baseInput({ inventory: 99, variants: [{ id: 'variant-1', sku: 'MSE-BRC-001-S', inventory: 42, priceNgnMinor: null, priceUsdMinor: null }] }))

    expect(result).toEqual({ ok: true, revalidate: ['/products/diamond-tennis-bracelet'] })
  })

  it('a non-inventory field change (e.g. price) is NOT stock-only and revalidates the full target set', async () => {
    product.findUnique.mockResolvedValue(baseCurrentRow())

    const result = await updateProduct(ID, baseInput({ priceNgnMinor: 600_000_00 }))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.revalidate).toContain('/bracelets')
    expect(result.revalidate).toContain('/collections')
    expect(result.revalidate).toContain('/')
  })
})

describe('computeProductRevalidateTargets', () => {
  it('full edit: PDP before+after, category+subcategory paths, collection paths, /collections, / — deduped', () => {
    const targets = computeProductRevalidateTargets({
      beforeSlug: 'old-slug',
      afterSlug: 'new-slug',
      categorySlugs: ['bracelets', 'bracelets/tennis-bracelets', 'bracelets', 'bracelets/tennis-bracelets'],
      collectionSlugs: ['bestsellers', 'bestsellers'],
      stockOnly: false,
    })

    expect(targets).toEqual([
      '/products/old-slug',
      '/products/new-slug',
      '/bracelets',
      '/bracelets/tennis-bracelets',
      '/collections/bestsellers',
      '/collections',
      '/',
    ])
  })

  it('stockOnly: true returns ONLY the PDP path(s)', () => {
    const targets = computeProductRevalidateTargets({
      beforeSlug: 'old-slug',
      afterSlug: 'new-slug',
      categorySlugs: ['bracelets'],
      collectionSlugs: ['bestsellers'],
      stockOnly: true,
    })

    expect(targets).toEqual(['/products/old-slug', '/products/new-slug'])
  })

  it('slug unchanged produces a single PDP entry', () => {
    const targets = computeProductRevalidateTargets({
      beforeSlug: 'same-slug',
      afterSlug: 'same-slug',
      categorySlugs: [],
      collectionSlugs: [],
      stockOnly: true,
    })

    expect(targets).toEqual(['/products/same-slug'])
  })
})

describe('archiveProduct', () => {
  it('happy path: guarded updateMany ACTIVE→DRAFT, returns full targets', async () => {
    product.updateMany.mockResolvedValue({ count: 1 })
    product.findUnique.mockResolvedValue({
      slug: 'diamond-tennis-bracelet',
      category: { slug: 'bracelets' },
      subcategory: { slug: 'tennis-bracelets' },
      collections: [{ collectionId: 'col-bestsellers' }],
    })

    const result = await archiveProduct(ID)

    expect(product.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: 'ACTIVE' },
      data: { status: 'DRAFT' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.revalidate).toContain('/products/diamond-tennis-bracelet')
    expect(result.revalidate).toContain('/bracelets/tennis-bracelets')
    expect(result.revalidate).toContain('/collections')
  })

  it('count 0 (already DRAFT, raced, or missing id) returns conflict', async () => {
    product.updateMany.mockResolvedValue({ count: 0 })

    const result = await archiveProduct(ID)

    expect(result).toEqual({ ok: false, error: 'conflict' })
    expect(product.findUnique).not.toHaveBeenCalled()
  })

  it('never throws: a db error is caught and mapped to error', async () => {
    product.updateMany.mockRejectedValue(new Error('boom'))

    const result = await archiveProduct(ID)

    expect(result).toEqual({ ok: false, error: 'error' })
  })
})

describe('restoreProduct', () => {
  it('happy path: guarded updateMany DRAFT→ACTIVE, returns full targets', async () => {
    product.updateMany.mockResolvedValue({ count: 1 })
    product.findUnique.mockResolvedValue({
      slug: 'diamond-tennis-bracelet',
      category: { slug: 'bracelets' },
      subcategory: null,
      collections: [],
    })

    const result = await restoreProduct(ID)

    expect(product.updateMany).toHaveBeenCalledWith({
      where: { id: ID, status: 'DRAFT' },
      data: { status: 'ACTIVE' },
    })
    expect(result).toEqual({
      ok: true,
      revalidate: ['/products/diamond-tennis-bracelet', '/bracelets', '/collections', '/'],
    })
  })

  it('count 0 returns conflict', async () => {
    product.updateMany.mockResolvedValue({ count: 0 })

    const result = await restoreProduct(ID)

    expect(result).toEqual({ ok: false, error: 'conflict' })
  })

  it('never throws: a db error is caught and mapped to error', async () => {
    product.updateMany.mockRejectedValue(new Error('boom'))

    const result = await restoreProduct(ID)

    expect(result).toEqual({ ok: false, error: 'error' })
  })
})

describe('deleteProduct', () => {
  it('happy path: zero order lines deletes inside the transaction, returns targets from the pre-deletion row', async () => {
    product.findUnique.mockResolvedValue({
      slug: 'diamond-tennis-bracelet',
      category: { slug: 'bracelets' },
      subcategory: { slug: 'tennis-bracelets' },
      collections: [{ collectionId: 'col-bestsellers' }],
    })
    orderLine.count.mockResolvedValue(0)

    const result = await deleteProduct(ID)

    expect($transaction).toHaveBeenCalledTimes(1)
    expect(orderLine.count).toHaveBeenCalledWith({ where: { productId: ID } })
    expect(product.delete).toHaveBeenCalledWith({ where: { id: ID } })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.revalidate).toContain('/products/diamond-tennis-bracelet')
    expect(result.revalidate).toContain('/bracelets/tennis-bracelets')
  })

  it('any order lines referencing the product returns has-orders and does NOT delete', async () => {
    product.findUnique.mockResolvedValue({
      slug: 'diamond-tennis-bracelet',
      category: { slug: 'bracelets' },
      subcategory: null,
      collections: [],
    })
    orderLine.count.mockResolvedValue(3)

    const result = await deleteProduct(ID)

    expect(result).toEqual({ ok: false, error: 'has-orders' })
    expect(product.delete).not.toHaveBeenCalled()
  })

  it('an unknown id returns not-found without opening a transaction', async () => {
    product.findUnique.mockResolvedValue(null)

    const result = await deleteProduct(ID)

    expect(result).toEqual({ ok: false, error: 'not-found' })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('never throws: a db error is caught and mapped to error', async () => {
    product.findUnique.mockRejectedValue(new Error('boom'))

    const result = await deleteProduct(ID)

    expect(result).toEqual({ ok: false, error: 'error' })
  })
})
