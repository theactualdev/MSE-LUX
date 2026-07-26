import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Role } from '@/generated/prisma/client'

const getCurrentRole = vi.fn()
const roleSatisfies = vi.fn()
vi.mock('@/features/auth/claims', () => ({
  getCurrentRole: (...args: []) => getCurrentRole(...args),
  roleSatisfies: (...args: [unknown, unknown]) => roleSatisfies(...args),
}))

const updateProduct = vi.fn()
const archiveProduct = vi.fn()
const restoreProduct = vi.fn()
const deleteProduct = vi.fn()
vi.mock('@/features/admin/catalog/products', () => ({
  updateProduct: (...args: [string, unknown]) => updateProduct(...args),
  archiveProduct: (...args: [string]) => archiveProduct(...args),
  restoreProduct: (...args: [string]) => restoreProduct(...args),
  deleteProduct: (...args: [string]) => deleteProduct(...args),
}))

const createCollection = vi.fn()
const updateCollection = vi.fn()
const deleteCollection = vi.fn()
vi.mock('@/features/admin/catalog/collections', () => ({
  createCollection: (...args: [unknown]) => createCollection(...args),
  updateCollection: (...args: [string, unknown]) => updateCollection(...args),
  deleteCollection: (...args: [string]) => deleteCollection(...args),
}))

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...args: [string]) => revalidatePath(...args),
}))

const {
  updateProductAction,
  archiveProductAction,
  restoreProductAction,
  deleteProductAction,
  createCollectionAction,
  updateCollectionAction,
  deleteCollectionAction,
} = await import('@/features/admin/catalog/actions')

const PRODUCT_ID = 'prod-123'
const COLLECTION_ID = 'coll-456'
const REVALIDATE_TARGETS_3 = ['/products/classic-ring', '/collections/engagement', '/']

beforeEach(() => {
  vi.clearAllMocks()
})

describe('updateProductAction', () => {
  it('CUSTOMER role returns forbidden and never calls updateProduct', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)

    const result = await updateProductAction(PRODUCT_ID, { name: 'Updated' })

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(updateProduct).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role delegates with exact args', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    updateProduct.mockResolvedValue({ ok: true, revalidate: [] })

    const input = { name: 'Updated' }
    const result = await updateProductAction(PRODUCT_ID, input)

    expect(result).toEqual({ ok: true, revalidate: [] })
    expect(updateProduct).toHaveBeenCalledWith(PRODUCT_ID, input)
    expect(updateProduct).toHaveBeenCalledTimes(1)
  })

  it('ADMIN role on ok:true revalidates all targets plus admin list', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    updateProduct.mockResolvedValue({ ok: true, revalidate: REVALIDATE_TARGETS_3 })

    await updateProductAction(PRODUCT_ID, { name: 'Updated' })

    expect(revalidatePath).toHaveBeenCalledWith('/products/classic-ring')
    expect(revalidatePath).toHaveBeenCalledWith('/collections/engagement')
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/catalog')
    expect(revalidatePath).toHaveBeenCalledTimes(4)
  })

  it('ADMIN role on ok:false does not revalidate', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    updateProduct.mockResolvedValue({ ok: false, error: 'not-found' })

    const result = await updateProductAction(PRODUCT_ID, { name: 'Updated' })

    expect(result).toEqual({ ok: false, error: 'not-found' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role returns delegate result verbatim on error', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    updateProduct.mockResolvedValue({
      ok: false,
      error: 'invalid-input',
      issues: [{ code: 'invalid_string' }],
    })

    const result = await updateProductAction(PRODUCT_ID, { name: '' })

    expect(result).toEqual({
      ok: false,
      error: 'invalid-input',
      issues: [{ code: 'invalid_string' }],
    })
  })
})

describe('archiveProductAction', () => {
  it('CUSTOMER role returns forbidden and never calls archiveProduct', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)

    const result = await archiveProductAction(PRODUCT_ID)

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(archiveProduct).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role delegates with exact args', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    archiveProduct.mockResolvedValue({ ok: true, revalidate: [] })

    const result = await archiveProductAction(PRODUCT_ID)

    expect(result).toEqual({ ok: true, revalidate: [] })
    expect(archiveProduct).toHaveBeenCalledWith(PRODUCT_ID)
    expect(archiveProduct).toHaveBeenCalledTimes(1)
  })

  it('ADMIN role on ok:true revalidates all targets plus admin list', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    archiveProduct.mockResolvedValue({ ok: true, revalidate: REVALIDATE_TARGETS_3 })

    await archiveProductAction(PRODUCT_ID)

    expect(revalidatePath).toHaveBeenCalledWith('/products/classic-ring')
    expect(revalidatePath).toHaveBeenCalledWith('/collections/engagement')
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/catalog')
    expect(revalidatePath).toHaveBeenCalledTimes(4)
  })

  it('ADMIN role on ok:false does not revalidate', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    archiveProduct.mockResolvedValue({ ok: false, error: 'conflict' })

    const result = await archiveProductAction(PRODUCT_ID)

    expect(result).toEqual({ ok: false, error: 'conflict' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('restoreProductAction', () => {
  it('CUSTOMER role returns forbidden and never calls restoreProduct', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)

    const result = await restoreProductAction(PRODUCT_ID)

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(restoreProduct).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role delegates with exact args', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    restoreProduct.mockResolvedValue({ ok: true, revalidate: [] })

    const result = await restoreProductAction(PRODUCT_ID)

    expect(result).toEqual({ ok: true, revalidate: [] })
    expect(restoreProduct).toHaveBeenCalledWith(PRODUCT_ID)
    expect(restoreProduct).toHaveBeenCalledTimes(1)
  })

  it('ADMIN role on ok:true revalidates all targets plus admin list', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    restoreProduct.mockResolvedValue({ ok: true, revalidate: REVALIDATE_TARGETS_3 })

    await restoreProductAction(PRODUCT_ID)

    expect(revalidatePath).toHaveBeenCalledWith('/products/classic-ring')
    expect(revalidatePath).toHaveBeenCalledWith('/collections/engagement')
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/catalog')
    expect(revalidatePath).toHaveBeenCalledTimes(4)
  })

  it('ADMIN role on ok:false does not revalidate', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    restoreProduct.mockResolvedValue({ ok: false, error: 'conflict' })

    const result = await restoreProductAction(PRODUCT_ID)

    expect(result).toEqual({ ok: false, error: 'conflict' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('deleteProductAction', () => {
  it('CUSTOMER role returns forbidden and never calls deleteProduct', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)

    const result = await deleteProductAction(PRODUCT_ID)

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(deleteProduct).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role delegates with exact args', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    deleteProduct.mockResolvedValue({ ok: true, revalidate: [] })

    const result = await deleteProductAction(PRODUCT_ID)

    expect(result).toEqual({ ok: true, revalidate: [] })
    expect(deleteProduct).toHaveBeenCalledWith(PRODUCT_ID)
    expect(deleteProduct).toHaveBeenCalledTimes(1)
  })

  it('ADMIN role on ok:true revalidates all targets plus admin list', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    deleteProduct.mockResolvedValue({ ok: true, revalidate: REVALIDATE_TARGETS_3 })

    await deleteProductAction(PRODUCT_ID)

    expect(revalidatePath).toHaveBeenCalledWith('/products/classic-ring')
    expect(revalidatePath).toHaveBeenCalledWith('/collections/engagement')
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/catalog')
    expect(revalidatePath).toHaveBeenCalledTimes(4)
  })

  it('ADMIN role on ok:false does not revalidate', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    deleteProduct.mockResolvedValue({ ok: false, error: 'has-orders' })

    const result = await deleteProductAction(PRODUCT_ID)

    expect(result).toEqual({ ok: false, error: 'has-orders' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('createCollectionAction', () => {
  it('CUSTOMER role returns forbidden and never calls createCollection', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)

    const result = await createCollectionAction({ name: 'New', slug: 'new' })

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(createCollection).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role delegates with exact args', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    createCollection.mockResolvedValue({ ok: true, revalidate: [] })

    const input = { name: 'New', slug: 'new' }
    const result = await createCollectionAction(input)

    expect(result).toEqual({ ok: true, revalidate: [] })
    expect(createCollection).toHaveBeenCalledWith(input)
    expect(createCollection).toHaveBeenCalledTimes(1)
  })

  it('ADMIN role on ok:true revalidates all targets plus admin list', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    createCollection.mockResolvedValue({ ok: true, revalidate: REVALIDATE_TARGETS_3 })

    await createCollectionAction({ name: 'New', slug: 'new' })

    expect(revalidatePath).toHaveBeenCalledWith('/products/classic-ring')
    expect(revalidatePath).toHaveBeenCalledWith('/collections/engagement')
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/catalog')
    expect(revalidatePath).toHaveBeenCalledTimes(4)
  })

  it('ADMIN role on ok:false does not revalidate', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    createCollection.mockResolvedValue({ ok: false, error: 'conflict-slug' })

    const result = await createCollectionAction({ name: 'New', slug: 'new' })

    expect(result).toEqual({ ok: false, error: 'conflict-slug' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('updateCollectionAction', () => {
  it('CUSTOMER role returns forbidden and never calls updateCollection', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)

    const result = await updateCollectionAction(COLLECTION_ID, { name: 'Updated', slug: 'updated' })

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(updateCollection).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role delegates with exact args', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    updateCollection.mockResolvedValue({ ok: true, revalidate: [] })

    const input = { name: 'Updated', slug: 'updated' }
    const result = await updateCollectionAction(COLLECTION_ID, input)

    expect(result).toEqual({ ok: true, revalidate: [] })
    expect(updateCollection).toHaveBeenCalledWith(COLLECTION_ID, input)
    expect(updateCollection).toHaveBeenCalledTimes(1)
  })

  it('ADMIN role on ok:true revalidates all targets plus admin list', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    updateCollection.mockResolvedValue({ ok: true, revalidate: REVALIDATE_TARGETS_3 })

    await updateCollectionAction(COLLECTION_ID, { name: 'Updated', slug: 'updated' })

    expect(revalidatePath).toHaveBeenCalledWith('/products/classic-ring')
    expect(revalidatePath).toHaveBeenCalledWith('/collections/engagement')
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/catalog')
    expect(revalidatePath).toHaveBeenCalledTimes(4)
  })

  it('ADMIN role on ok:false does not revalidate', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    updateCollection.mockResolvedValue({ ok: false, error: 'not-found' })

    const result = await updateCollectionAction(COLLECTION_ID, { name: 'Updated', slug: 'updated' })

    expect(result).toEqual({ ok: false, error: 'not-found' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('deleteCollectionAction', () => {
  it('CUSTOMER role returns forbidden and never calls deleteCollection', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)

    const result = await deleteCollectionAction(COLLECTION_ID)

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(deleteCollection).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ADMIN role delegates with exact args', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    deleteCollection.mockResolvedValue({ ok: true, revalidate: [] })

    const result = await deleteCollectionAction(COLLECTION_ID)

    expect(result).toEqual({ ok: true, revalidate: [] })
    expect(deleteCollection).toHaveBeenCalledWith(COLLECTION_ID)
    expect(deleteCollection).toHaveBeenCalledTimes(1)
  })

  it('ADMIN role on ok:true revalidates all targets plus admin list', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    deleteCollection.mockResolvedValue({ ok: true, revalidate: REVALIDATE_TARGETS_3 })

    await deleteCollectionAction(COLLECTION_ID)

    expect(revalidatePath).toHaveBeenCalledWith('/products/classic-ring')
    expect(revalidatePath).toHaveBeenCalledWith('/collections/engagement')
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/catalog')
    expect(revalidatePath).toHaveBeenCalledTimes(4)
  })

  it('ADMIN role on ok:false does not revalidate', async () => {
    getCurrentRole.mockResolvedValue(Role.ADMIN)
    roleSatisfies.mockReturnValue(true)
    deleteCollection.mockResolvedValue({ ok: false, error: 'conflict' })

    const result = await deleteCollectionAction(COLLECTION_ID)

    expect(result).toEqual({ ok: false, error: 'conflict' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('role-check ordering', () => {
  it('role check happens before any engine call (updateProductAction)', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)
    updateProduct.mockResolvedValue({ ok: true, revalidate: [] })

    await updateProductAction(PRODUCT_ID, { name: 'Updated' })

    expect(roleSatisfies).toHaveBeenCalled()
    expect(updateProduct).not.toHaveBeenCalled()
  })

  it('role check happens before any engine call (createCollectionAction)', async () => {
    getCurrentRole.mockResolvedValue(Role.CUSTOMER)
    roleSatisfies.mockReturnValue(false)
    createCollection.mockResolvedValue({ ok: true, revalidate: [] })

    await createCollectionAction({ name: 'New', slug: 'new' })

    expect(roleSatisfies).toHaveBeenCalled()
    expect(createCollection).not.toHaveBeenCalled()
  })
})
