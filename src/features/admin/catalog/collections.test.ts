import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Same `$transaction` mocking idiom as `transitions.test.ts`: the callback
 * receives spies shared with top-level `db`, so assertions don't need to
 * care whether a call happened inside or outside `$transaction`.
 */

const collection = {
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

const product = {
  update: vi.fn(),
}

const productCollection = {
  deleteMany: vi.fn(),
}

const tx = { collection, product, productCollection }
const $transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx))

vi.mock('@/lib/db', () => ({
  db: {
    get collection() {
      return collection
    },
    get product() {
      return product
    },
    get productCollection() {
      return productCollection
    },
    $transaction: (...args: [(client: typeof tx) => unknown]) => $transaction(...args),
  },
}))

const { createCollection, updateCollection, deleteCollection, computeCollectionRevalidateTargets } = await import(
  '@/features/admin/catalog/collections'
)

const ID = 'collection-1'

function baseCurrentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ID,
    slug: 'bestsellers',
    name: 'Best Sellers',
    description: 'Our most popular items.',
    ...overrides,
  }
}

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    slug: 'bestsellers',
    name: 'Best Sellers',
    description: 'Our most popular items.',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  collection.findFirst.mockResolvedValue(null)
})

describe('createCollection', () => {
  it('happy path: parses input, pre-checks slug conflict, writes, returns targets', async () => {
    const input = baseInput()

    const result = await createCollection(input)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')

    expect(collection.findFirst).toHaveBeenCalledWith({ where: { slug: input.slug } })
    expect(collection.create).toHaveBeenCalledWith({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
      },
    })

    expect(result.revalidate).toContain('/collections/bestsellers')
    expect(result.revalidate).toContain('/collections')
    expect(result.revalidate).toContain('/')
  })

  it('a slug conflict with another collection returns conflict-slug without writing', async () => {
    collection.findFirst.mockResolvedValue({ id: 'other-collection' })

    const input = baseInput()
    const result = await createCollection(input)

    expect(result).toEqual({ ok: false, error: 'conflict-slug' })
    expect(collection.create).not.toHaveBeenCalled()
  })

  it('invalid input fails Zod parsing before any db read, returning issues', async () => {
    const result = await createCollection({ ...baseInput(), slug: 'Not Kebab Case' })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('invalid-input')
    expect(result.issues).toBeDefined()
    expect(collection.findFirst).not.toHaveBeenCalled()
  })

  it('never throws: a db error is caught and mapped to error', async () => {
    collection.findFirst.mockRejectedValue(new Error('boom'))

    const result = await createCollection(baseInput())

    expect(result).toEqual({ ok: false, error: 'error' })
  })
})

describe('updateCollection', () => {
  it('happy path: parses input, pre-checks slug conflict, writes, returns targets including old+new slug', async () => {
    collection.findUnique.mockResolvedValue(baseCurrentRow({ slug: 'bestsellers-old' }))

    const input = baseInput({ slug: 'bestsellers-new', name: 'Best Sellers 2025' })
    const result = await updateCollection(ID, input)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')

    expect(collection.findFirst).toHaveBeenCalledWith({ where: { slug: input.slug, NOT: { id: ID } } })
    expect(collection.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
      },
    })

    expect(result.revalidate).toContain('/collections/bestsellers-old')
    expect(result.revalidate).toContain('/collections/bestsellers-new')
    expect(result.revalidate).toContain('/collections')
    expect(result.revalidate).toContain('/')
  })

  it('update without renaming dedupes the slug in targets', async () => {
    collection.findUnique.mockResolvedValue(baseCurrentRow({ slug: 'bestsellers' }))

    const input = baseInput({ slug: 'bestsellers', name: 'Best Sellers Updated' })
    const result = await updateCollection(ID, input)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.revalidate).toEqual(['/collections/bestsellers', '/collections', '/'])
  })

  it('a slug conflict with another collection returns conflict-slug without writing', async () => {
    collection.findUnique.mockResolvedValue(baseCurrentRow())
    collection.findFirst.mockResolvedValue({ id: 'other-collection' })

    const input = baseInput()
    const result = await updateCollection(ID, input)

    expect(result).toEqual({ ok: false, error: 'conflict-slug' })
    expect(collection.update).not.toHaveBeenCalled()
  })

  it('an unknown collection id returns not-found without further reads', async () => {
    collection.findUnique.mockResolvedValue(null)

    const result = await updateCollection(ID, baseInput())

    expect(result).toEqual({ ok: false, error: 'not-found' })
    expect(collection.findFirst).not.toHaveBeenCalled()
  })

  it('invalid input fails Zod parsing before any db read, returning issues', async () => {
    const result = await updateCollection(ID, { ...baseInput(), description: 'x'.repeat(501) })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe('invalid-input')
    expect(result.issues).toBeDefined()
    expect(collection.findUnique).not.toHaveBeenCalled()
  })

  it('never throws: a db error is caught and mapped to error', async () => {
    collection.findUnique.mockRejectedValue(new Error('boom'))

    const result = await updateCollection(ID, baseInput())

    expect(result).toEqual({ ok: false, error: 'error' })
  })
})

describe('deleteCollection', () => {
  it('happy path: deletes collection, returns targets from pre-deletion row, does NOT call product.update', async () => {
    collection.findUnique.mockResolvedValue(baseCurrentRow())

    const result = await deleteCollection(ID)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')

    expect(collection.delete).toHaveBeenCalledWith({ where: { id: ID } })
    expect(product.update).not.toHaveBeenCalled()
    expect(productCollection.deleteMany).not.toHaveBeenCalled()

    expect(result.revalidate).toContain('/collections/bestsellers')
    expect(result.revalidate).toContain('/collections')
    expect(result.revalidate).toContain('/')
  })

  it('an unknown id returns not-found without opening a transaction or deleting', async () => {
    collection.findUnique.mockResolvedValue(null)

    const result = await deleteCollection(ID)

    expect(result).toEqual({ ok: false, error: 'not-found' })
    expect(collection.delete).not.toHaveBeenCalled()
  })

  it('never throws: a db error is caught and mapped to error', async () => {
    collection.findUnique.mockRejectedValue(new Error('boom'))

    const result = await deleteCollection(ID)

    expect(result).toEqual({ ok: false, error: 'error' })
  })
})

describe('computeCollectionRevalidateTargets', () => {
  it('full edit: collection page before+after (dedupe if unchanged), /collections, / — deduped', () => {
    const targets = computeCollectionRevalidateTargets({
      beforeSlug: 'old-slug',
      afterSlug: 'new-slug',
    })

    expect(targets).toEqual(['/collections/old-slug', '/collections/new-slug', '/collections', '/'])
  })

  it('slug unchanged produces single collection entry', () => {
    const targets = computeCollectionRevalidateTargets({
      beforeSlug: 'same-slug',
      afterSlug: 'same-slug',
    })

    expect(targets).toEqual(['/collections/same-slug', '/collections', '/'])
  })
})
