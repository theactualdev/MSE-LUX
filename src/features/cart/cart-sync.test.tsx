import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { waitFor } from '@testing-library/react'
import { useCartStore } from '@/features/cart/store'
import { useWishlistStore } from '@/features/wishlist/store'
import { useServerCartStore } from '@/features/cart/server-cart-store'
import { useServerWishlistStore } from '@/features/wishlist/server-wishlist-store'
import type { CartMutationResult } from '@/features/cart/types'

vi.mock('@/features/auth/use-session', () => ({ useSession: vi.fn() }))
vi.mock('@/features/cart/data', () => ({ mergeGuestCart: vi.fn() }))
vi.mock('@/features/wishlist/data', () => ({ mergeGuestWishlist: vi.fn() }))

import { useSession } from '@/features/auth/use-session'
import { mergeGuestCart } from '@/features/cart/data'
import { mergeGuestWishlist } from '@/features/wishlist/data'
import { CartSync } from '@/features/cart/cart-sync'

const useSessionMock = vi.mocked(useSession)
const mergeGuestCartMock = vi.mocked(mergeGuestCart)
const mergeGuestWishlistMock = vi.mocked(mergeGuestWishlist)

/** Resolves the promise's `.then` continuation manually, so a test can assert an intermediate state before reconciling. */
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
  useWishlistStore.getState().clear()
  useServerCartStore.getState().reset()
  useServerWishlistStore.getState().reset()
})

describe('CartSync — guest -> authed merge', () => {
  it('merges non-empty local cart/wishlist into the server stores and clears the local ones', async () => {
    useCartStore.getState().addItem('P1', undefined, 2)
    useWishlistStore.getState().toggle('W1')

    mergeGuestCartMock.mockResolvedValue({ ok: true, items: [{ productId: 'P1', quantity: 2 }] })
    mergeGuestWishlistMock.mockResolvedValue({ ok: true, ids: ['W1'] })

    useSessionMock.mockReturnValue({ signedIn: false, loading: false })
    const { rerender } = render(<CartSync />)

    useSessionMock.mockReturnValue({ signedIn: true, loading: false })
    rerender(<CartSync />)

    await waitFor(() => expect(mergeGuestCartMock).toHaveBeenCalledTimes(1))
    expect(mergeGuestCartMock).toHaveBeenCalledWith([{ productId: 'P1', variantId: undefined, quantity: 2 }])
    await waitFor(() => expect(mergeGuestWishlistMock).toHaveBeenCalledTimes(1))
    expect(mergeGuestWishlistMock).toHaveBeenCalledWith(['W1'])

    await waitFor(() => expect(useCartStore.getState().items).toEqual([]))
    await waitFor(() => expect(useWishlistStore.getState().ids).toEqual([]))
    await waitFor(() => expect(useServerCartStore.getState().items).toEqual([{ productId: 'P1', quantity: 2 }]))
    await waitFor(() => expect(useServerWishlistStore.getState().ids).toEqual(['W1']))
    expect(useServerCartStore.getState().status).toBe('ready')
    expect(useServerWishlistStore.getState().status).toBe('ready')
  })

  it('mounting directly with signedIn:true (OAuth / fresh login) also triggers the merge', async () => {
    useCartStore.getState().addItem('P1', undefined, 1)

    mergeGuestCartMock.mockResolvedValue({ ok: true, items: [{ productId: 'P1', quantity: 1 }] })

    useSessionMock.mockReturnValue({ signedIn: true, loading: false })
    render(<CartSync />)

    await waitFor(() => expect(mergeGuestCartMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(useCartStore.getState().items).toEqual([]))
  })

  it('on {error}, the corresponding local store is NOT cleared', async () => {
    useCartStore.getState().addItem('P1', undefined, 2)
    useWishlistStore.getState().toggle('W1')

    mergeGuestCartMock.mockResolvedValue({ error: 'Something went wrong. Please try again.' })
    mergeGuestWishlistMock.mockResolvedValue({ ok: true, ids: ['W1'] })

    useSessionMock.mockReturnValue({ signedIn: false, loading: false })
    const { rerender } = render(<CartSync />)
    useSessionMock.mockReturnValue({ signedIn: true, loading: false })
    rerender(<CartSync />)

    await waitFor(() => expect(mergeGuestCartMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mergeGuestWishlistMock).toHaveBeenCalledTimes(1))

    await waitFor(() => expect(useWishlistStore.getState().ids).toEqual([]))
    // Cart merge failed: local cart retained for the next login's merge.
    expect(useCartStore.getState().items).toEqual([{ productId: 'P1', variantId: undefined, quantity: 2 }])
  })

  it('does not call either merge when local stores are empty (already-signed-in reload)', async () => {
    useSessionMock.mockReturnValue({ signedIn: false, loading: false })
    const { rerender } = render(<CartSync />)
    useSessionMock.mockReturnValue({ signedIn: true, loading: false })
    rerender(<CartSync />)

    // Give any accidental async work a tick to fire.
    await new Promise((r) => setTimeout(r, 0))

    expect(mergeGuestCartMock).not.toHaveBeenCalled()
    expect(mergeGuestWishlistMock).not.toHaveBeenCalled()
  })

  it('does not double-merge on a re-render while still signed in', async () => {
    useCartStore.getState().addItem('P1', undefined, 1)
    mergeGuestCartMock.mockResolvedValue({ ok: true, items: [{ productId: 'P1', quantity: 1 }] })

    useSessionMock.mockReturnValue({ signedIn: false, loading: false })
    const { rerender } = render(<CartSync />)
    useSessionMock.mockReturnValue({ signedIn: true, loading: false })
    rerender(<CartSync />)

    await waitFor(() => expect(mergeGuestCartMock).toHaveBeenCalledTimes(1))

    // Re-render while still signed in (e.g. a pathname change re-rendering the tree).
    rerender(<CartSync />)
    await new Promise((r) => setTimeout(r, 0))

    expect(mergeGuestCartMock).toHaveBeenCalledTimes(1)
  })

  it('sign-out mid-merge: a merge resolving after signedIn flips back to false does not write into the store', async () => {
    useCartStore.getState().addItem('P1', undefined, 1)
    const { promise, resolve } = deferred<CartMutationResult>()
    mergeGuestCartMock.mockReturnValue(promise)

    useSessionMock.mockReturnValue({ signedIn: false, loading: false })
    const { rerender } = render(<CartSync />)
    useSessionMock.mockReturnValue({ signedIn: true, loading: false })
    rerender(<CartSync />)

    await waitFor(() => expect(mergeGuestCartMock).toHaveBeenCalledTimes(1))

    // User signs out before the merge resolves.
    useSessionMock.mockReturnValue({ signedIn: false, loading: false })
    rerender(<CartSync />)

    resolve({ ok: true, items: [{ productId: 'P1', quantity: 1 }] })
    await promise
    await new Promise((r) => setTimeout(r, 0))

    // The now-abandoned merge must not have written into the server store.
    expect(useServerCartStore.getState().items).toEqual([])
    expect(useServerCartStore.getState().status).toBe('idle')
  })
})
