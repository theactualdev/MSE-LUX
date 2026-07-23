import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Same rationale as `src/features/cart/data.test.ts`: Prisma connects
 * through the pooler as a privileged role and bypasses RLS entirely, so
 * authorization lives entirely in this module's query scoping. These tests
 * assert on the *shape of the arguments Prisma is called with* — a function
 * that returned the right data while forgetting to scope by the session
 * user's wishlist would be a cross-tenant read/write, and only an argument
 * assertion catches that.
 */

const wishlist = {
  findFirst: vi.fn(),
  create: vi.fn(),
}

const wishlistItem = {
  findMany: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}

// The transaction callback receives the same spies as top-level `db`, so
// assertions don't have to care whether a given call happened inside or
// outside `$transaction` — matching the pattern in cart/data.test.ts.
const tx = { wishlist, wishlistItem }

const $transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx))

vi.mock('@/lib/db', () => ({
  db: {
    get wishlist() {
      return wishlist
    },
    get wishlistItem() {
      return wishlistItem
    },
    $transaction: (...args: [(client: typeof tx) => unknown]) => $transaction(...args),
  },
}))

const getCurrentUserId = vi.fn()

vi.mock('@/features/auth/claims', () => ({
  getCurrentUserId: () => getCurrentUserId(),
}))

const { getServerWishlistIds, addWishlistItem, removeWishlistItem, mergeGuestWishlist } = await import(
  '@/features/wishlist/data'
)

const USER_ID = '11111111-1111-4111-8111-111111111111'
const WISHLIST_ID = 'wishlist-1'
const PRODUCT_ID = 'prod-1'

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserId.mockResolvedValue(USER_ID)
})

describe('getServerWishlistIds', () => {
  it('scopes the read to the session user via the wishlist relation and maps rows to ids', async () => {
    wishlistItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID }, { productId: 'prod-2' }])

    await expect(getServerWishlistIds()).resolves.toEqual([PRODUCT_ID, 'prod-2'])

    expect(wishlistItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { wishlist: { profileId: USER_ID } } }),
    )
  })

  it('returns an empty array without touching the database when unauthenticated', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(getServerWishlistIds()).resolves.toEqual([])
    expect(wishlistItem.findMany).not.toHaveBeenCalled()
  })

  it('returns an empty array when the user has no wishlist rows yet', async () => {
    wishlistItem.findMany.mockResolvedValue([])

    await expect(getServerWishlistIds()).resolves.toEqual([])
  })
})

describe('addWishlistItem', () => {
  it('fetches-or-creates the wishlist, then upserts on (wishlistId, productId)', async () => {
    wishlist.findFirst.mockResolvedValue({ id: WISHLIST_ID })
    wishlistItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID }])

    await expect(addWishlistItem(PRODUCT_ID)).resolves.toEqual({ ok: true, ids: [PRODUCT_ID] })

    expect(wishlist.create).not.toHaveBeenCalled()
    expect(wishlistItem.upsert).toHaveBeenCalledWith({
      where: { wishlistId_productId: { wishlistId: WISHLIST_ID, productId: PRODUCT_ID } },
      create: { wishlistId: WISHLIST_ID, productId: PRODUCT_ID },
      update: {},
    })
  })

  it('creates the wishlist lazily when the profile has none yet', async () => {
    wishlist.findFirst.mockResolvedValue(null)
    wishlist.create.mockResolvedValue({ id: WISHLIST_ID })
    wishlistItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID }])

    await addWishlistItem(PRODUCT_ID)

    expect(wishlist.create).toHaveBeenCalledWith(expect.objectContaining({ data: { profileId: USER_ID } }))
  })

  it('is idempotent: adding an existing id twice upserts a no-op update, never a duplicate row', async () => {
    wishlist.findFirst.mockResolvedValue({ id: WISHLIST_ID })
    wishlistItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID }])

    await addWishlistItem(PRODUCT_ID)
    await addWishlistItem(PRODUCT_ID)

    expect(wishlistItem.upsert).toHaveBeenCalledTimes(2)
    for (const call of wishlistItem.upsert.mock.calls) {
      expect(call[0]).toEqual({
        where: { wishlistId_productId: { wishlistId: WISHLIST_ID, productId: PRODUCT_ID } },
        create: { wishlistId: WISHLIST_ID, productId: PRODUCT_ID },
        update: {},
      })
    }
  })

  it('rejects an empty productId without touching the database', async () => {
    await expect(addWishlistItem('')).resolves.toEqual({ error: expect.any(String) })
    expect(wishlist.findFirst).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })

  it('returns the unauthenticated result and issues no db query when signed out', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(addWishlistItem(PRODUCT_ID)).resolves.toEqual({ error: expect.any(String) })
    expect(wishlist.findFirst).not.toHaveBeenCalled()
    expect(wishlistItem.upsert).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })
})

describe('removeWishlistItem', () => {
  it('deletes the item scoped by the resolved wishlist id', async () => {
    wishlist.findFirst.mockResolvedValue({ id: WISHLIST_ID })
    wishlistItem.findMany.mockResolvedValue([])

    await expect(removeWishlistItem(PRODUCT_ID)).resolves.toEqual({ ok: true, ids: [] })

    expect(wishlistItem.deleteMany).toHaveBeenCalledWith({
      where: { wishlistId: WISHLIST_ID, productId: PRODUCT_ID },
    })
  })

  it('no-ops when the user has no wishlist yet', async () => {
    wishlist.findFirst.mockResolvedValue(null)
    wishlistItem.findMany.mockResolvedValue([])

    await expect(removeWishlistItem(PRODUCT_ID)).resolves.toEqual({ ok: true, ids: [] })
    expect(wishlistItem.deleteMany).not.toHaveBeenCalled()
  })

  it('rejects an empty productId without touching the database', async () => {
    await expect(removeWishlistItem('')).resolves.toEqual({ error: expect.any(String) })
    expect(wishlist.findFirst).not.toHaveBeenCalled()
  })

  it('returns the unauthenticated result and issues no db query when signed out', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(removeWishlistItem(PRODUCT_ID)).resolves.toEqual({ error: expect.any(String) })
    expect(wishlist.findFirst).not.toHaveBeenCalled()
  })
})

describe('mergeGuestWishlist', () => {
  it('upserts each guest id (deduping via the unique) and returns the fresh full id list', async () => {
    wishlist.findFirst.mockResolvedValue({ id: WISHLIST_ID })
    // Existing ids ['B', 'C'] were created before the merge's new 'A', so the
    // fresh `id asc` read naturally comes back existing-then-new-unique.
    wishlistItem.findMany.mockResolvedValue([{ productId: 'B' }, { productId: 'C' }, { productId: 'A' }])

    await expect(mergeGuestWishlist(['A', 'B'])).resolves.toEqual({ ok: true, ids: ['B', 'C', 'A'] })

    expect(wishlistItem.upsert).toHaveBeenCalledTimes(2)
    expect(wishlistItem.upsert).toHaveBeenNthCalledWith(1, {
      where: { wishlistId_productId: { wishlistId: WISHLIST_ID, productId: 'A' } },
      create: { wishlistId: WISHLIST_ID, productId: 'A' },
      update: {},
    })
    expect(wishlistItem.upsert).toHaveBeenNthCalledWith(2, {
      where: { wishlistId_productId: { wishlistId: WISHLIST_ID, productId: 'B' } },
      create: { wishlistId: WISHLIST_ID, productId: 'B' },
      update: {},
    })
  })

  it('processes every guest id inside one transaction', async () => {
    wishlist.findFirst.mockResolvedValue({ id: WISHLIST_ID })
    wishlistItem.findMany.mockResolvedValue([])

    await mergeGuestWishlist(['A', 'B'])

    expect($transaction).toHaveBeenCalledTimes(1)
    expect(wishlistItem.upsert).toHaveBeenCalledTimes(2)
  })

  it('creates the wishlist lazily when the profile has none yet', async () => {
    wishlist.findFirst.mockResolvedValue(null)
    wishlist.create.mockResolvedValue({ id: WISHLIST_ID })
    wishlistItem.findMany.mockResolvedValue([])

    await mergeGuestWishlist(['A'])

    expect(wishlist.create).toHaveBeenCalledWith(expect.objectContaining({ data: { profileId: USER_ID } }))
  })

  it('rejects a malformed guest payload without touching the database', async () => {
    await expect(mergeGuestWishlist([''] as never)).resolves.toEqual({ error: expect.any(String) })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('returns the unauthenticated result and issues no db query when signed out', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(mergeGuestWishlist(['A'])).resolves.toEqual({ error: expect.any(String) })
    expect($transaction).not.toHaveBeenCalled()
  })
})
