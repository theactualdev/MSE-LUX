import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCartStore } from '@/features/cart/store'
import type { Product } from '@/types/catalog'
import type { CartMutationResult } from '@/features/cart/types'

vi.mock('@/features/auth/use-session', () => ({ useSession: vi.fn() }))
vi.mock('@/features/cart/data', () => ({
  getServerCartItems: vi.fn(),
  addCartItem: vi.fn(),
  setCartItemQty: vi.fn(),
  removeCartItem: vi.fn(),
  clearServerCart: vi.fn(),
}))
vi.mock('@/features/catalog/server/resolve-products', () => ({ resolveProductsByIds: vi.fn() }))

import { useSession } from '@/features/auth/use-session'
import { getServerCartItems, addCartItem, setCartItemQty, removeCartItem, clearServerCart } from '@/features/cart/data'
import { resolveProductsByIds } from '@/features/catalog/server/resolve-products'
import { useCart } from '@/features/cart/use-cart'

const useSessionMock = vi.mocked(useSession)
const getServerCartItemsMock = vi.mocked(getServerCartItems)
const addCartItemMock = vi.mocked(addCartItem)
const setCartItemQtyMock = vi.mocked(setCartItemQty)
const removeCartItemMock = vi.mocked(removeCartItem)
const clearServerCartMock = vi.mocked(clearServerCart)
const resolveProductsByIdsMock = vi.mocked(resolveProductsByIds)

const priceSet = {
  ngn: { amountMinor: 2_400_000, currency: 'NGN' as const },
  usd: { amountMinor: 2900, currency: 'USD' as const },
}

const fixtureProduct: Product = {
  id: 'FIX-1',
  name: 'Fixture Cuff',
  slug: 'fixture-cuff',
  shortDescription: 'A fixture cuff.',
  description: 'A fixture cuff.',
  priceSet,
  sku: 'FIX-1-SKU',
  inventory: 10,
  material: 'Gold-plated brass',
  materialTags: ['Gold-plated'],
  categorySlug: 'bracelets',
  collectionSlugs: [],
  images: [{ src: 'https://picsum.photos/seed/fixture-1/800/1000', alt: 'Fixture Cuff' }],
  optionTypes: [],
  variants: [],
  badges: [],
  status: 'active',
  seo: {},
}

/** Resolves the promise's `.then` continuation manually, so a test can assert an intermediate (pending/optimistic) state before reconciling. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  useCartStore.getState().clear()
  resolveProductsByIdsMock.mockResolvedValue([])
  getServerCartItemsMock.mockResolvedValue([])
})

describe('useCart — guest mode', () => {
  beforeEach(() => {
    useSessionMock.mockReturnValue({ signedIn: false, loading: false })
  })

  it('proxies the local cart store: add mutates items/itemCount, isPending stays false, no server action runs', () => {
    const { result } = renderHook(() => useCart())

    expect(result.current.items).toEqual([])
    expect(result.current.itemCount).toBe(0)

    act(() => {
      result.current.add('P1', undefined, 2)
    })

    expect(result.current.items).toEqual([{ productId: 'P1', variantId: undefined, quantity: 2 }])
    expect(result.current.itemCount).toBe(2)
    expect(useCartStore.getState().items).toEqual([{ productId: 'P1', variantId: undefined, quantity: 2 }])
    expect(result.current.isPending).toBe(false)
    expect(addCartItemMock).not.toHaveBeenCalled()
  })

  it('isLoading starts true for a non-empty guest cart and settles to false once resolveProductsByIds resolves', async () => {
    useCartStore.getState().addItem('P1', undefined, 1)
    const { promise, resolve } = deferred<Product[]>()
    resolveProductsByIdsMock.mockReturnValue(promise)

    const { result } = renderHook(() => useCart())

    expect(result.current.isLoading).toBe(true)

    act(() => {
      resolve([])
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('isLoading is false for an empty guest cart (nothing to resolve)', () => {
    const { result } = renderHook(() => useCart())
    expect(result.current.isLoading).toBe(false)
  })

  it('setQty/remove/clear delegate to the store', () => {
    const { result } = renderHook(() => useCart())

    act(() => {
      result.current.add('P1', 'V1', 1)
    })
    act(() => {
      result.current.setQty('P1', 'V1', 5)
    })
    expect(result.current.items).toEqual([{ productId: 'P1', variantId: 'V1', quantity: 5 }])

    act(() => {
      result.current.add('P2', undefined, 1)
    })
    act(() => {
      result.current.remove('P1', 'V1')
    })
    expect(result.current.items).toEqual([{ productId: 'P2', variantId: undefined, quantity: 1 }])

    act(() => {
      result.current.clear()
    })
    expect(result.current.items).toEqual([])
    expect(setCartItemQtyMock).not.toHaveBeenCalled()
    expect(removeCartItemMock).not.toHaveBeenCalled()
    expect(clearServerCartMock).not.toHaveBeenCalled()
  })
})

describe('useCart — signed-in mode', () => {
  beforeEach(() => {
    useSessionMock.mockReturnValue({ signedIn: true, loading: false })
  })

  it('loads items from getServerCartItems on mount', async () => {
    getServerCartItemsMock.mockResolvedValue([{ productId: 'P1', quantity: 1 }])

    const { result } = renderHook(() => useCart())

    await waitFor(() => expect(result.current.items).toEqual([{ productId: 'P1', quantity: 1 }]))
    expect(getServerCartItemsMock).toHaveBeenCalledTimes(1)
  })

  it('isLoading is true until getServerCartItems resolves, even for an eventually-empty cart', async () => {
    const { promise, resolve } = deferred<{ productId: string; variantId?: string; quantity: number }[]>()
    getServerCartItemsMock.mockReturnValue(promise)

    const { result } = renderHook(() => useCart())

    expect(result.current.isLoading).toBe(true)

    act(() => {
      resolve([])
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('add() optimistically updates items, calls addCartItem, then reconciles with its returned items', async () => {
    getServerCartItemsMock.mockResolvedValue([])
    const { promise, resolve } = deferred<CartMutationResult>()
    addCartItemMock.mockReturnValue(promise)

    const { result } = renderHook(() => useCart())
    await waitFor(() => expect(getServerCartItemsMock).toHaveBeenCalled())

    act(() => {
      result.current.add('P1', undefined, 2)
    })

    // optimistic: applied synchronously, before the server action resolves
    expect(result.current.items).toEqual([{ productId: 'P1', variantId: undefined, quantity: 2 }])
    expect(addCartItemMock).toHaveBeenCalledWith('P1', undefined, 2)
    expect(result.current.isPending).toBe(true)

    act(() => {
      resolve({ ok: true, items: [{ productId: 'P1', quantity: 5 }] })
    })

    await waitFor(() => expect(result.current.items).toEqual([{ productId: 'P1', quantity: 5 }]))
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })

  it('rolls back items to the pre-mutation snapshot when the server action returns an error', async () => {
    getServerCartItemsMock.mockResolvedValue([{ productId: 'P1', quantity: 1 }])
    const { promise, resolve } = deferred<CartMutationResult>()
    addCartItemMock.mockReturnValue(promise)

    const { result } = renderHook(() => useCart())
    await waitFor(() => expect(result.current.items).toEqual([{ productId: 'P1', quantity: 1 }]))

    act(() => {
      result.current.add('P1', undefined, 2)
    })
    expect(result.current.items).toEqual([{ productId: 'P1', quantity: 3 }])

    act(() => {
      resolve({ error: 'Something went wrong. Please try again.' })
    })

    await waitFor(() => expect(result.current.items).toEqual([{ productId: 'P1', quantity: 1 }]))
  })
})

describe('useCart — lines', () => {
  it('derives lines from items via resolveProductsByIds, dropping items whose product does not resolve', async () => {
    useSessionMock.mockReturnValue({ signedIn: false, loading: false })
    useCartStore.getState().addItem('FIX-1', undefined, 2)
    useCartStore.getState().addItem('UNRESOLVED', undefined, 1)
    resolveProductsByIdsMock.mockResolvedValue([fixtureProduct])

    const { result } = renderHook(() => useCart())

    await waitFor(() => expect(result.current.lines).toHaveLength(1))
    expect(resolveProductsByIdsMock).toHaveBeenCalledWith(expect.arrayContaining(['FIX-1', 'UNRESOLVED']))
    expect(result.current.lines[0].product.id).toBe('FIX-1')
    expect(result.current.lines[0].quantity).toBe(2)
    expect(result.current.lines[0].lineTotal.amountMinor).toBe(result.current.lines[0].unitPrice.amountMinor * 2)
  })
})
