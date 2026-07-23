import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RecentlyViewedShelf } from '@/features/catalog/components/recently-viewed-shelf'
import { useRecentlyViewedStore } from '@/features/catalog/hooks/use-recently-viewed'
import { getAllProducts } from '@/features/catalog/lib/selectors'

// Each rendered `ProductCard` reads `useWishlist()`, which reads
// `useSession()` (the real Supabase browser client, which throws when
// `NEXT_PUBLIC_SUPABASE_*` is unset under test) — mocked the same way
// `wishlist-view.test.tsx` mocks it.
vi.mock('@/features/auth/use-session', () => ({ useSession: vi.fn(() => ({ signedIn: false, loading: false })) }))

// `resolveProductsByIds` is the DB-catalog server action; mocked here so the
// async grid resolves against the bundled fixture products without hitting
// the real catalog loader, mirroring `wishlist-view.test.tsx`.
vi.mock('@/features/catalog/server/resolve-products', () => ({
  resolveProductsByIds: vi.fn(async (ids: string[]) => {
    const byId = new Map(getAllProducts().map((p) => [p.id, p]))
    const out = []
    for (const id of ids) {
      const p = byId.get(id)
      if (p) out.push(p)
    }
    return out
  }),
}))

describe('RecentlyViewedShelf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRecentlyViewedStore.getState().clear()
  })

  it('renders nothing when the store is empty', async () => {
    const { container } = render(<RecentlyViewedShelf />)

    // Let any pending effects flush before asserting nothing rendered.
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('renders the resolved products in recency (most-recent-first) order', async () => {
    const [productA, productB] = getAllProducts()
    // Store adds most-recent-first: viewing A then B leaves ids = [B, A].
    useRecentlyViewedStore.getState().add(productA.id)
    useRecentlyViewedStore.getState().add(productB.id)

    render(<RecentlyViewedShelf />)

    await screen.findByText(productB.name)
    await screen.findByText(productA.name)

    const headings = screen.getAllByRole('heading', { level: 3 })
    const names = headings.map((h) => h.textContent)
    expect(names.indexOf(productB.name)).toBeLessThan(names.indexOf(productA.name))
  })

  it('omits the excluded product id', async () => {
    const [productA, productB] = getAllProducts()
    useRecentlyViewedStore.getState().add(productA.id)
    useRecentlyViewedStore.getState().add(productB.id)

    render(<RecentlyViewedShelf excludeProductId={productB.id} />)

    await screen.findByText(productA.name)
    expect(screen.queryByText(productB.name)).not.toBeInTheDocument()
  })

  it('renders nothing when no stored id resolves to a product', async () => {
    useRecentlyViewedStore.getState().add('does-not-exist')

    const { container } = render(<RecentlyViewedShelf />)

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
