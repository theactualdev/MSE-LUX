import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Same rationale as `src/features/account/data.test.ts`: Prisma connects
 * through the pooler as a privileged role and bypasses RLS entirely, so
 * authorization lives entirely in this module's query scoping. These tests
 * assert on the *shape of the arguments Prisma is called with* — a function
 * that returned the right data while forgetting to scope by the session
 * user's cart would be a cross-tenant read/write, and only an argument
 * assertion catches that.
 *
 * The line read-modify-write goes through `findFirst` → `update`-by-id /
 * `create` (never `findUnique`/`upsert` on the `(cartId, productId,
 * variantId)` compound key): Prisma rejects `null` in a compound-unique
 * `where` at runtime, which broke variantless adds. These mocks therefore
 * spy on `findFirst`/`update`/`create`/`delete`.
 */

const cart = {
  findFirst: vi.fn(),
  create: vi.fn(),
}

const cartItem = {
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
}

const product = {
  findUnique: vi.fn(),
}

const productVariant = {
  findUnique: vi.fn(),
}

// The transaction callback receives the same spies as top-level `db`, so
// assertions don't have to care whether a given call happened inside or
// outside `$transaction` — matching the pattern in account/data.test.ts.
const tx = { cart, cartItem, product, productVariant }

const $transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx))

vi.mock('@/lib/db', () => ({
  db: {
    get cart() {
      return cart
    },
    get cartItem() {
      return cartItem
    },
    get product() {
      return product
    },
    get productVariant() {
      return productVariant
    },
    $transaction: (...args: [(client: typeof tx) => unknown]) => $transaction(...args),
  },
}))

const getCurrentUserId = vi.fn()

vi.mock('@/features/auth/claims', () => ({
  getCurrentUserId: () => getCurrentUserId(),
}))

const {
  getServerCartItems,
  addCartItem,
  setCartItemQty,
  removeCartItem,
  clearServerCart,
  mergeGuestCart,
} = await import('@/features/cart/data')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CART_ID = 'cart-1'
const ITEM_ID = 'item-1'
const PRODUCT_ID = 'prod-1'
const VARIANT_ID = 'variant-1'

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserId.mockResolvedValue(USER_ID)
})

describe('getServerCartItems', () => {
  it('scopes the read to the session user via the cart relation and maps rows', async () => {
    cartItem.findMany.mockResolvedValue([
      { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2 },
      { productId: 'prod-2', variantId: null, quantity: 1 },
    ])

    await expect(getServerCartItems()).resolves.toEqual([
      { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2 },
      { productId: 'prod-2', variantId: undefined, quantity: 1 },
    ])

    expect(cartItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cart: { profileId: USER_ID } } }),
    )
  })

  it('returns an empty array without touching the database when unauthenticated', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(getServerCartItems()).resolves.toEqual([])
    expect(cartItem.findMany).not.toHaveBeenCalled()
  })

  it('returns an empty array when the user has no cart rows yet', async () => {
    cartItem.findMany.mockResolvedValue([])

    await expect(getServerCartItems()).resolves.toEqual([])
  })
})

describe('addCartItem', () => {
  it('fetches-or-creates the cart, then updates the existing line incrementing quantity', async () => {
    cart.findFirst.mockResolvedValue({ id: CART_ID })
    cartItem.findFirst.mockResolvedValue({ id: ITEM_ID, quantity: 1 })
    productVariant.findUnique.mockResolvedValue({ inventory: 10, productId: PRODUCT_ID })
    cartItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 3 }])

    await expect(addCartItem(PRODUCT_ID, VARIANT_ID, 2)).resolves.toEqual({
      ok: true,
      items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 3 }],
    })

    expect(cart.create).not.toHaveBeenCalled()
    expect(cartItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cartId: CART_ID, productId: PRODUCT_ID, variantId: VARIANT_ID } }),
    )
    expect(cartItem.update).toHaveBeenCalledWith({ where: { id: ITEM_ID }, data: { quantity: 3 } })
    expect(cartItem.create).not.toHaveBeenCalled()
  })

  it('creates the cart lazily when the profile has none yet', async () => {
    cart.findFirst.mockResolvedValue(null)
    cart.create.mockResolvedValue({ id: CART_ID })
    cartItem.findFirst.mockResolvedValue(null)
    productVariant.findUnique.mockResolvedValue({ inventory: 10, productId: PRODUCT_ID })
    cartItem.findMany.mockResolvedValue([])

    await addCartItem(PRODUCT_ID, VARIANT_ID, 1)

    expect(cart.create).toHaveBeenCalledWith(expect.objectContaining({ data: { profileId: USER_ID } }))
    expect(cartItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { cartId: CART_ID, productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 },
      }),
    )
  })

  it('uses a plain null-variant filter (never a compound-unique key) for a variantless add', async () => {
    cart.findFirst.mockResolvedValue({ id: CART_ID })
    cartItem.findFirst.mockResolvedValue(null)
    product.findUnique.mockResolvedValue({ inventory: 10 })
    cartItem.findMany.mockResolvedValue([])

    await addCartItem(PRODUCT_ID, undefined, 1)

    expect(productVariant.findUnique).not.toHaveBeenCalled()
    expect(product.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: PRODUCT_ID } }))
    // The regression this guards: a compound-unique `findUnique`/`upsert` here
    // would carry `variantId: null`, which Prisma rejects at runtime.
    expect(cartItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cartId: CART_ID, productId: PRODUCT_ID, variantId: null } }),
    )
    expect(cartItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ variantId: null, quantity: 1 }) }),
    )
  })

  it('clamps the stored quantity to the resolved inventory', async () => {
    cart.findFirst.mockResolvedValue({ id: CART_ID })
    cartItem.findFirst.mockResolvedValue({ id: ITEM_ID, quantity: 8 })
    productVariant.findUnique.mockResolvedValue({ inventory: 10, productId: PRODUCT_ID })
    cartItem.findMany.mockResolvedValue([])

    await addCartItem(PRODUCT_ID, VARIANT_ID, 5) // 8 + 5 = 13, clamp to 10

    expect(cartItem.update).toHaveBeenCalledWith({ where: { id: ITEM_ID }, data: { quantity: 10 } })
  })

  it('removes the line instead of writing it when the item has no inventory', async () => {
    cart.findFirst.mockResolvedValue({ id: CART_ID })
    productVariant.findUnique.mockResolvedValue({ inventory: 0, productId: PRODUCT_ID })
    cartItem.findMany.mockResolvedValue([])

    await addCartItem(PRODUCT_ID, VARIANT_ID, 1)

    expect(cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: CART_ID, productId: PRODUCT_ID, variantId: VARIANT_ID },
    })
    expect(cartItem.create).not.toHaveBeenCalled()
    expect(cartItem.update).not.toHaveBeenCalled()
    expect(cartItem.findFirst).not.toHaveBeenCalled()
  })

  it('rejects an invalid quantity without touching the database', async () => {
    await expect(addCartItem(PRODUCT_ID, VARIANT_ID, 0)).resolves.toEqual({
      error: expect.any(String),
    })
    await expect(addCartItem(PRODUCT_ID, VARIANT_ID, -1)).resolves.toEqual({
      error: expect.any(String),
    })
    await expect(addCartItem('', VARIANT_ID, 1)).resolves.toEqual({ error: expect.any(String) })
    expect(cart.findFirst).not.toHaveBeenCalled()
  })

  it('returns the unauthenticated result and issues no db query when signed out', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(addCartItem(PRODUCT_ID, VARIANT_ID, 1)).resolves.toEqual({ error: expect.any(String) })
    expect(cart.findFirst).not.toHaveBeenCalled()
    expect(cartItem.create).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })
})

describe('mergeGuestCart', () => {
  it('sums the guest quantity onto the existing server quantity for the same key, clamped to inventory', async () => {
    cart.findFirst.mockResolvedValue({ id: CART_ID })
    cartItem.findFirst.mockResolvedValue({ id: ITEM_ID, quantity: 1 })
    productVariant.findUnique.mockResolvedValue({ inventory: 10, productId: PRODUCT_ID })
    cartItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 3 }])

    await expect(
      mergeGuestCart([{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2 }]),
    ).resolves.toEqual({ ok: true, items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 3 }] })

    expect(cartItem.update).toHaveBeenCalledWith({ where: { id: ITEM_ID }, data: { quantity: 3 } })
  })

  it('clamps the merged sum to inventory', async () => {
    cart.findFirst.mockResolvedValue({ id: CART_ID })
    cartItem.findFirst.mockResolvedValue({ id: ITEM_ID, quantity: 8 })
    productVariant.findUnique.mockResolvedValue({ inventory: 10, productId: PRODUCT_ID })
    cartItem.findMany.mockResolvedValue([])

    await mergeGuestCart([{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 9 }]) // 8 + 9 = 17, clamp 10

    expect(cartItem.update).toHaveBeenCalledWith({ where: { id: ITEM_ID }, data: { quantity: 10 } })
  })

  it('processes every guest item inside one transaction', async () => {
    cart.findFirst.mockResolvedValue({ id: CART_ID })
    cartItem.findFirst.mockResolvedValue(null)
    productVariant.findUnique.mockResolvedValue({ inventory: 10, productId: PRODUCT_ID })
    product.findUnique.mockResolvedValue({ inventory: 10 })
    cartItem.findMany.mockResolvedValue([])

    await mergeGuestCart([
      { productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 },
      { productId: 'prod-2', quantity: 1 },
    ])

    expect($transaction).toHaveBeenCalledTimes(1)
    expect(cartItem.create).toHaveBeenCalledTimes(2)
  })

  it('rejects a malformed guest payload without touching the database', async () => {
    await expect(mergeGuestCart([{ productId: '', quantity: 1 } as never])).resolves.toEqual({
      error: expect.any(String),
    })
    expect($transaction).not.toHaveBeenCalled()
  })

  it('returns the unauthenticated result and issues no db query when signed out', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(mergeGuestCart([{ productId: PRODUCT_ID, quantity: 1 }])).resolves.toEqual({
      error: expect.any(String),
    })
    expect($transaction).not.toHaveBeenCalled()
  })
})

describe('setCartItemQty', () => {
  it('sets an absolute quantity, clamped to inventory, scoped to the existing cart', async () => {
    cart.findFirst.mockResolvedValue({ id: CART_ID })
    cartItem.findFirst.mockResolvedValue({ id: ITEM_ID, quantity: 1 })
    productVariant.findUnique.mockResolvedValue({ inventory: 4, productId: PRODUCT_ID })
    cartItem.findMany.mockResolvedValue([{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 4 }])

    await expect(setCartItemQty(PRODUCT_ID, VARIANT_ID, 9)).resolves.toEqual({
      ok: true,
      items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 4 }],
    })

    expect(cartItem.update).toHaveBeenCalledWith({ where: { id: ITEM_ID }, data: { quantity: 4 } })
  })

  it('removes the line when qty is zero or negative, scoped by the cart id', async () => {
    cart.findFirst.mockResolvedValue({ id: CART_ID })
    cartItem.findMany.mockResolvedValue([])

    await expect(setCartItemQty(PRODUCT_ID, VARIANT_ID, 0)).resolves.toEqual({ ok: true, items: [] })

    expect(cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: CART_ID, productId: PRODUCT_ID, variantId: VARIANT_ID },
    })
    expect(cartItem.update).not.toHaveBeenCalled()
  })

  it('no-ops when the user has no cart yet and qty is zero or negative', async () => {
    cart.findFirst.mockResolvedValue(null)
    cartItem.findMany.mockResolvedValue([])

    await expect(setCartItemQty(PRODUCT_ID, VARIANT_ID, -3)).resolves.toEqual({ ok: true, items: [] })

    expect(cartItem.deleteMany).not.toHaveBeenCalled()
    expect(cart.create).not.toHaveBeenCalled()
  })

  it('returns the unauthenticated result and issues no db query when signed out', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(setCartItemQty(PRODUCT_ID, VARIANT_ID, 2)).resolves.toEqual({ error: expect.any(String) })
    expect(cart.findFirst).not.toHaveBeenCalled()
    expect($transaction).not.toHaveBeenCalled()
  })
})

describe('removeCartItem', () => {
  it('deletes the line scoped by the resolved cart id', async () => {
    cart.findFirst.mockResolvedValue({ id: CART_ID })
    cartItem.findMany.mockResolvedValue([])

    await expect(removeCartItem(PRODUCT_ID, VARIANT_ID)).resolves.toEqual({ ok: true, items: [] })

    expect(cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: CART_ID, productId: PRODUCT_ID, variantId: VARIANT_ID },
    })
  })

  it('no-ops when the user has no cart', async () => {
    cart.findFirst.mockResolvedValue(null)
    cartItem.findMany.mockResolvedValue([])

    await expect(removeCartItem(PRODUCT_ID, VARIANT_ID)).resolves.toEqual({ ok: true, items: [] })
    expect(cartItem.deleteMany).not.toHaveBeenCalled()
  })

  it('returns the unauthenticated result and issues no db query when signed out', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(removeCartItem(PRODUCT_ID, VARIANT_ID)).resolves.toEqual({ error: expect.any(String) })
    expect(cart.findFirst).not.toHaveBeenCalled()
  })
})

describe('clearServerCart', () => {
  it('deletes every line in the user\'s cart, scoped by cart id', async () => {
    cart.findFirst.mockResolvedValue({ id: CART_ID })

    await expect(clearServerCart()).resolves.toEqual({ ok: true, items: [] })

    expect(cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: CART_ID } })
  })

  it('no-ops when the user has no cart', async () => {
    cart.findFirst.mockResolvedValue(null)

    await expect(clearServerCart()).resolves.toEqual({ ok: true, items: [] })
    expect(cartItem.deleteMany).not.toHaveBeenCalled()
  })

  it('returns the unauthenticated result and issues no db query when signed out', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(clearServerCart()).resolves.toEqual({ error: expect.any(String) })
    expect(cart.findFirst).not.toHaveBeenCalled()
  })
})
