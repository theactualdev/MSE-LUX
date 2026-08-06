import { describe, it, expect, vi, beforeEach } from 'vitest'

const category = {
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
const subcategory = {
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
const product = { count: vi.fn() }

vi.mock('@/lib/db', () => ({ db: { category, subcategory, product } }))

const {
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
  deleteSubcategory,
  computeCategoryRevalidateTargets,
} = await import('@/features/admin/catalog/categories')

const VALID = { name: 'Bridal Sets', slug: 'bridal-sets', description: null, image: null }

beforeEach(() => {
  vi.clearAllMocks()
  product.count.mockResolvedValue(0)
})

describe('computeCategoryRevalidateTargets', () => {
  it('covers both slugs when the slug changes, and always the home page', () => {
    expect(computeCategoryRevalidateTargets({ beforeSlug: 'old', afterSlug: 'new' })).toEqual(
      expect.arrayContaining(['/old', '/new', '/']),
    )
  })

  it('does not duplicate the path when the slug is unchanged', () => {
    const targets = computeCategoryRevalidateTargets({ beforeSlug: 'same', afterSlug: 'same' })
    expect(targets.filter((t) => t === '/same')).toHaveLength(1)
  })
})

describe('createCategory', () => {
  it('rejects a non-kebab-case slug without touching the database', async () => {
    const result = await createCategory({ ...VALID, slug: 'Bridal Sets' })

    expect(result).toMatchObject({ ok: false, error: 'invalid-input' })
    expect(category.create).not.toHaveBeenCalled()
  })

  it('reports a slug conflict instead of creating a duplicate', async () => {
    category.findFirst.mockResolvedValue({ id: 'other' })

    expect(await createCategory(VALID)).toEqual({ ok: false, error: 'conflict-slug' })
    expect(category.create).not.toHaveBeenCalled()
  })

  it('creates and returns revalidation targets', async () => {
    category.findFirst.mockResolvedValue(null)
    category.create.mockResolvedValue({ id: 'c1' })

    const result = await createCategory(VALID)

    expect(result.ok).toBe(true)
    expect(category.create).toHaveBeenCalledWith({
      data: { name: 'Bridal Sets', slug: 'bridal-sets', description: null, image: null },
    })
  })
})

describe('updateCategory', () => {
  it('allows a category to keep its own slug', async () => {
    category.findUnique.mockResolvedValue({ id: 'c1', slug: 'bridal-sets' })
    category.findFirst.mockResolvedValue(null)

    expect((await updateCategory('c1', VALID)).ok).toBe(true)
    // The conflict probe must exclude the row being edited, or every save
    // would collide with itself.
    expect(category.findFirst).toHaveBeenCalledWith({ where: { slug: 'bridal-sets', NOT: { id: 'c1' } } })
  })
})

describe('deleteCategory', () => {
  // Product.categoryId is REQUIRED, so Postgres would reject this anyway. The
  // explicit count is what lets the admin explain why instead of surfacing a
  // foreign-key violation.
  it('refuses while products are filed under it, and does not call delete', async () => {
    category.findUnique.mockResolvedValue({ id: 'c1', slug: 'jewelry' })
    product.count.mockResolvedValue(12)

    expect(await deleteCategory('c1')).toEqual({ ok: false, error: 'has-products' })
    expect(category.delete).not.toHaveBeenCalled()
  })

  it('deletes an empty category', async () => {
    category.findUnique.mockResolvedValue({ id: 'c1', slug: 'jewelry' })
    product.count.mockResolvedValue(0)

    expect((await deleteCategory('c1')).ok).toBe(true)
    expect(category.delete).toHaveBeenCalledWith({ where: { id: 'c1' } })
  })

  it('returns not-found rather than deleting a missing row', async () => {
    category.findUnique.mockResolvedValue(null)

    expect(await deleteCategory('nope')).toEqual({ ok: false, error: 'not-found' })
    expect(category.delete).not.toHaveBeenCalled()
  })
})

describe('createSubcategory', () => {
  it('scopes the slug conflict check to the parent category', async () => {
    category.findUnique.mockResolvedValue({ id: 'c1', slug: 'jewelry' })
    subcategory.findFirst.mockResolvedValue(null)
    subcategory.create.mockResolvedValue({ id: 's1' })

    const result = await createSubcategory({ categoryId: 'c1', name: 'Bracelets', slug: 'bracelets' })

    expect(result.ok).toBe(true)
    // Subcategory slugs are unique per category, not globally — two categories
    // may each hold a "bracelets".
    expect(subcategory.findFirst).toHaveBeenCalledWith({ where: { categoryId: 'c1', slug: 'bracelets' } })
  })

  it('rejects an unknown parent category', async () => {
    category.findUnique.mockResolvedValue(null)

    const result = await createSubcategory({ categoryId: 'ghost', name: 'X', slug: 'x' })

    expect(result).toEqual({ ok: false, error: 'invalid-taxonomy' })
    expect(subcategory.create).not.toHaveBeenCalled()
  })
})

describe('deleteSubcategory', () => {
  // Product.subcategoryId is NULLABLE, so Postgres would silently null it and
  // leave products alive but unfiled. This guard is the only thing preventing
  // that.
  it('refuses while products reference it, and does not call delete', async () => {
    subcategory.findUnique.mockResolvedValue({ id: 's1', slug: 'bracelets', category: { slug: 'jewelry' } })
    product.count.mockResolvedValue(3)

    expect(await deleteSubcategory('s1')).toEqual({ ok: false, error: 'has-products' })
    expect(subcategory.delete).not.toHaveBeenCalled()
  })

  it('deletes an empty subcategory', async () => {
    subcategory.findUnique.mockResolvedValue({ id: 's1', slug: 'bracelets', category: { slug: 'jewelry' } })
    product.count.mockResolvedValue(0)

    expect((await deleteSubcategory('s1')).ok).toBe(true)
    expect(subcategory.delete).toHaveBeenCalledWith({ where: { id: 's1' } })
  })
})
