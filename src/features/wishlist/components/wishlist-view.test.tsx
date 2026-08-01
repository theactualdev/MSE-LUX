import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WishlistView } from '@/features/wishlist/components/wishlist-view'
import { useWishlistStore } from '@/features/wishlist/store'
import { useServerWishlistStore } from '@/features/wishlist/server-wishlist-store'
import { products } from '@/features/catalog/data/products'
import { useSession } from '@/features/auth/use-session'
import { getServerWishlistIds } from '@/features/wishlist/data'
import { getSharePanelDataAction } from '@/features/gifting/actions'

// A variantless saved product renders `<AddToCart>`, which reads `useCart()`
// — pulling in `useSession()` (the real Supabase browser client, which
// throws when `NEXT_PUBLIC_SUPABASE_*` is unset under test) and the
// `resolveProductsByIds` server action (mocked below so the async product
// grid resolves without hitting the real catalog loader). `useWishlist()`'s
// signed-in path pulls in `@/features/wishlist/data`'s server actions too —
// mocked the same way `use-wishlist.test.tsx` mocks them. `SharePanel`
// (rendered unconditionally by `WishlistView`, Phase 10c) reads the SAME
// `useSession()` mock — signed-out by default here, matching this file's
// focus on the product grid rather than the share panel (that's
// `share-panel.test.tsx`'s job) — and, now that it fetches client-side
// (Phase 10c follow-up), its own data action, mocked to resolve `null` so it
// renders as fast as the signed-out prompt without a dangling promise.
vi.mock('@/features/auth/use-session', () => ({ useSession: vi.fn(() => ({ signedIn: false, role: 'CUSTOMER', loading: false })) }))
vi.mock('@/features/catalog/server/resolve-products', () => ({
  resolveProductsByIds: vi.fn(async (ids: string[]) => products.filter((p) => ids.includes(p.id))),
}))
vi.mock('@/features/wishlist/data', () => ({
  getServerWishlistIds: vi.fn(),
  addWishlistItem: vi.fn(),
  removeWishlistItem: vi.fn(),
}))
vi.mock('@/features/gifting/actions', () => ({
  enableShareAction: vi.fn(),
  disableShareAction: vi.fn(),
  regenerateShareAction: vi.fn(),
  getSharePanelDataAction: vi.fn(async () => null),
}))

const useSessionMock = vi.mocked(useSession)
const getServerWishlistIdsMock = vi.mocked(getServerWishlistIds)
const getSharePanelDataActionMock = vi.mocked(getSharePanelDataAction)

describe('WishlistView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWishlistStore.getState().clear()
    useServerWishlistStore.getState().reset()
    useSessionMock.mockReturnValue({ signedIn: false, role: 'CUSTOMER', loading: false })
    getServerWishlistIdsMock.mockResolvedValue([])
    getSharePanelDataActionMock.mockResolvedValue(null)
  })

  it('renders the SharePanel in its signed-out state when the visitor is signed out', async () => {
    render(<WishlistView />)

    expect(await screen.findByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })

  it('renders the SharePanel from its own client-fetched data, independent of the product grid state', async () => {
    useSessionMock.mockReturnValue({ signedIn: true, role: 'CUSTOMER', loading: false })
    getSharePanelDataActionMock.mockResolvedValue({
      shareState: { enabled: false, token: null, addressId: null },
      addresses: [{ id: 'addr-1', fullName: 'Ada Lovelace', city: 'Lagos', state: 'Lagos' }],
    })

    render(<WishlistView />)

    expect(await screen.findByRole('button', { name: /create share link/i })).toBeInTheDocument()
    // The empty-wishlist state below still renders alongside the panel.
    expect(await screen.findByText(/your wishlist is empty/i)).toBeInTheDocument()
  })

  it('renders the empty state with a link back to shopping when the wishlist has no items', async () => {
    render(<WishlistView />)

    expect(await screen.findByText(/your wishlist is empty/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /explore collections/i })
    expect(link).toHaveAttribute('href', '/collections')
  })

  it('renders saved products resolved from the DB catalog', async () => {
    const product = products[0]
    useWishlistStore.getState().toggle(product.id)

    render(<WishlistView />)

    expect(await screen.findByText(product.name)).toBeInTheDocument()
    expect(screen.getByText(/1 saved item/i)).toBeInTheDocument()
  })

  it('drops ids that no longer resolve to a product', async () => {
    useWishlistStore.getState().toggle('does-not-exist')

    render(<WishlistView />)

    expect(await screen.findByText(/your wishlist is empty/i)).toBeInTheDocument()
  })

  it('"Clear wishlist" empties the store and shows the empty state', async () => {
    const user = userEvent.setup()
    const product = products[0]
    useWishlistStore.getState().toggle(product.id)

    render(<WishlistView />)
    await screen.findByText(product.name)

    await user.click(screen.getByRole('button', { name: /clear wishlist/i }))

    expect(useWishlistStore.getState().ids).toEqual([])
    expect(await screen.findByText(/your wishlist is empty/i)).toBeInTheDocument()
  })

  it('renders an "Add to bag" control for a variantless saved product', async () => {
    const product = products.find((p) => p.variants.length === 0)
    if (!product) throw new Error('fixture expects at least one variantless product')
    useWishlistStore.getState().toggle(product.id)

    render(<WishlistView />)

    expect(await screen.findByRole('button', { name: /add to bag/i })).toBeInTheDocument()
  })

  it('renders a "Select options" link to the PDP for a saved product with variants', async () => {
    const product = products.find((p) => p.variants.length > 0)
    if (!product) throw new Error('fixture expects at least one product with variants')
    useWishlistStore.getState().toggle(product.id)

    render(<WishlistView />)

    const link = await screen.findByRole('link', { name: /select options/i })
    expect(link).toHaveAttribute('href', `/products/${product.slug}`)
  })

  it('shows the loading skeleton while signed-in ids are still loading, then renders resolved products', async () => {
    useSessionMock.mockReturnValue({ signedIn: true, role: 'CUSTOMER', loading: false })

    const product = products[0]
    let resolveIds!: (ids: string[]) => void
    getServerWishlistIdsMock.mockReturnValue(
      new Promise((resolve) => {
        resolveIds = resolve
      }),
    )

    render(<WishlistView />)

    expect(screen.queryByText(/your wishlist is empty/i)).not.toBeInTheDocument()
    expect(screen.queryByText(product.name)).not.toBeInTheDocument()

    resolveIds([product.id])

    expect(await screen.findByText(product.name)).toBeInTheDocument()
  })
})
