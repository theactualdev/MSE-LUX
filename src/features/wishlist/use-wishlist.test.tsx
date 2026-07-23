import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWishlistStore } from '@/features/wishlist/store'
import { useServerWishlistStore } from '@/features/wishlist/server-wishlist-store'
import type { WishlistMutationResult } from '@/features/wishlist/types'

vi.mock('@/features/auth/use-session', () => ({ useSession: vi.fn() }))
vi.mock('@/features/wishlist/data', () => ({
  getServerWishlistIds: vi.fn(),
  addWishlistItem: vi.fn(),
  removeWishlistItem: vi.fn(),
}))

import { useSession } from '@/features/auth/use-session'
import { getServerWishlistIds, addWishlistItem, removeWishlistItem } from '@/features/wishlist/data'
import { useWishlist } from '@/features/wishlist/use-wishlist'

const useSessionMock = vi.mocked(useSession)
const getServerWishlistIdsMock = vi.mocked(getServerWishlistIds)
const addWishlistItemMock = vi.mocked(addWishlistItem)
const removeWishlistItemMock = vi.mocked(removeWishlistItem)

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
  useWishlistStore.getState().clear()
  useServerWishlistStore.getState().reset()
  getServerWishlistIdsMock.mockResolvedValue([])
})

describe('useWishlist — guest mode', () => {
  beforeEach(() => {
    useSessionMock.mockReturnValue({ signedIn: false, loading: false })
  })

  it('proxies the local wishlist store: toggle adds, has/count/ids reflect it, isPending stays false, no server action runs', () => {
    const { result } = renderHook(() => useWishlist())

    expect(result.current.ids).toEqual([])
    expect(result.current.count).toBe(0)
    expect(result.current.has('P1')).toBe(false)
    expect(result.current.isLoading).toBe(false)

    act(() => {
      result.current.toggle('P1')
    })

    expect(result.current.ids).toEqual(['P1'])
    expect(result.current.count).toBe(1)
    expect(result.current.has('P1')).toBe(true)
    expect(useWishlistStore.getState().ids).toEqual(['P1'])
    expect(result.current.isPending).toBe(false)
    expect(addWishlistItemMock).not.toHaveBeenCalled()
    expect(removeWishlistItemMock).not.toHaveBeenCalled()
    expect(getServerWishlistIdsMock).not.toHaveBeenCalled()
  })

  it('toggling an existing id removes it', () => {
    const { result } = renderHook(() => useWishlist())

    act(() => {
      result.current.toggle('P1')
    })
    expect(result.current.ids).toEqual(['P1'])

    act(() => {
      result.current.toggle('P1')
    })
    expect(result.current.ids).toEqual([])
    expect(result.current.has('P1')).toBe(false)
    expect(result.current.count).toBe(0)
    expect(addWishlistItemMock).not.toHaveBeenCalled()
    expect(removeWishlistItemMock).not.toHaveBeenCalled()
  })
})

describe('useWishlist — signed-in mode', () => {
  beforeEach(() => {
    useSessionMock.mockReturnValue({ signedIn: true, loading: false })
  })

  it('loads ids from getServerWishlistIds on mount', async () => {
    getServerWishlistIdsMock.mockResolvedValue(['P1', 'P2'])

    const { result } = renderHook(() => useWishlist())

    await waitFor(() => expect(result.current.ids).toEqual(['P1', 'P2']))
    expect(getServerWishlistIdsMock).toHaveBeenCalledTimes(1)
  })

  it('isLoading is true until getServerWishlistIds resolves, then false', async () => {
    const { promise, resolve } = deferred<string[]>()
    getServerWishlistIdsMock.mockReturnValue(promise)

    const { result } = renderHook(() => useWishlist())

    expect(result.current.isLoading).toBe(true)

    resolve(['P1'])

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.ids).toEqual(['P1'])
  })

  it('toggle() of a new id optimistically adds it, calls addWishlistItem, then reconciles with its returned ids', async () => {
    getServerWishlistIdsMock.mockResolvedValue([])
    const { promise, resolve } = deferred<WishlistMutationResult>()
    addWishlistItemMock.mockReturnValue(promise)

    const { result } = renderHook(() => useWishlist())
    await waitFor(() => expect(getServerWishlistIdsMock).toHaveBeenCalled())

    act(() => {
      result.current.toggle('P1')
    })

    // optimistic: applied synchronously, before the server action resolves
    expect(result.current.ids).toEqual(['P1'])
    expect(addWishlistItemMock).toHaveBeenCalledWith('P1')
    expect(removeWishlistItemMock).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(true)

    act(() => {
      resolve({ ok: true, ids: ['P1', 'P2'] })
    })

    await waitFor(() => expect(result.current.ids).toEqual(['P1', 'P2']))
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })

  it('toggle() of an existing id optimistically removes it and calls removeWishlistItem', async () => {
    getServerWishlistIdsMock.mockResolvedValue(['P1', 'P2'])
    const { promise, resolve } = deferred<WishlistMutationResult>()
    removeWishlistItemMock.mockReturnValue(promise)

    const { result } = renderHook(() => useWishlist())
    await waitFor(() => expect(result.current.ids).toEqual(['P1', 'P2']))

    act(() => {
      result.current.toggle('P1')
    })

    expect(result.current.ids).toEqual(['P2'])
    expect(removeWishlistItemMock).toHaveBeenCalledWith('P1')
    expect(addWishlistItemMock).not.toHaveBeenCalled()

    act(() => {
      resolve({ ok: true, ids: ['P2'] })
    })

    await waitFor(() => expect(result.current.ids).toEqual(['P2']))
  })

  it('rolls back ids to the pre-mutation snapshot when the server action returns an error', async () => {
    getServerWishlistIdsMock.mockResolvedValue(['P1'])
    const { promise, resolve } = deferred<WishlistMutationResult>()
    addWishlistItemMock.mockReturnValue(promise)

    const { result } = renderHook(() => useWishlist())
    await waitFor(() => expect(result.current.ids).toEqual(['P1']))

    act(() => {
      result.current.toggle('P2')
    })
    expect(result.current.ids).toEqual(['P1', 'P2'])

    act(() => {
      resolve({ error: 'Something went wrong. Please try again.' })
    })

    await waitFor(() => expect(result.current.ids).toEqual(['P1']))
  })

  it('shares state across concurrently-mounted instances: one fetch, and a toggle on one instance is observed by the other', async () => {
    getServerWishlistIdsMock.mockResolvedValue([])
    addWishlistItemMock.mockResolvedValue({ ok: true, ids: ['P1'] })

    const { result: a } = renderHook(() => useWishlist())
    const { result: b } = renderHook(() => useWishlist())

    await waitFor(() => expect(a.current.ids).toEqual([]))
    await waitFor(() => expect(b.current.ids).toEqual([]))

    // Two concurrently-mounted instances dedupe down to a single server fetch.
    expect(getServerWishlistIdsMock).toHaveBeenCalledTimes(1)

    act(() => {
      a.current.toggle('P1')
    })

    // The optimistic toggle from instance A is immediately visible on instance B too.
    expect(a.current.has('P1')).toBe(true)
    expect(b.current.has('P1')).toBe(true)
    expect(b.current.ids).toEqual(['P1'])
    expect(b.current.count).toBe(1)

    await waitFor(() => expect(a.current.ids).toEqual(['P1']))
    expect(b.current.ids).toEqual(['P1'])
  })

  it('a stale in-flight load from a signed-out user cannot clobber the store after reset()', async () => {
    const { promise, resolve } = deferred<string[]>()
    getServerWishlistIdsMock.mockReturnValue(promise)

    // Directly against the store: exercises the race without depending on
    // hook unmount timing.
    useServerWishlistStore.getState().ensureLoaded()
    expect(useServerWishlistStore.getState().status).toBe('loading')

    // User signs out (or a different user signs in) before the slow fetch lands.
    useServerWishlistStore.getState().reset()
    expect(useServerWishlistStore.getState()).toMatchObject({ ids: [], status: 'idle' })

    // The stale fetch now resolves with the *previous* user's wishlist.
    resolve(['STALE'])
    await promise

    // It must not have clobbered the reset — still idle/empty, not the stale ids.
    expect(useServerWishlistStore.getState()).toMatchObject({ ids: [], status: 'idle' })
  })

  it('setIds supersedes a stale in-flight load: a slow ensureLoaded() fetch resolving after setIds does not clobber it', async () => {
    const { promise, resolve } = deferred<string[]>()
    getServerWishlistIdsMock.mockReturnValue(promise)

    useServerWishlistStore.getState().ensureLoaded()
    expect(useServerWishlistStore.getState().status).toBe('loading')

    // e.g. cart-sync.tsx pushing a guest-wishlist merge result mid-flight.
    const merged = ['MERGED']
    useServerWishlistStore.getState().setIds(merged)
    expect(useServerWishlistStore.getState()).toMatchObject({ ids: merged, status: 'ready' })

    // The stale, now-superseded load resolves afterward.
    resolve(['STALE'])
    await promise

    expect(useServerWishlistStore.getState()).toMatchObject({ ids: merged, status: 'ready' })
  })
})
