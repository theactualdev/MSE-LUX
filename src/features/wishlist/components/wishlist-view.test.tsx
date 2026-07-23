import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WishlistView } from '@/features/wishlist/components/wishlist-view'
import { useWishlistStore } from '@/features/wishlist/store'
import { getAllProducts } from '@/features/catalog/lib/selectors'

// A variantless saved product renders `<AddToCart>`, which now reads
// `useCart()` — pulling in `useSession()` (the real Supabase browser client,
// which throws when `NEXT_PUBLIC_SUPABASE_*` is unset under test) and the
// `resolveProductsByIds` server action (irrelevant here: this suite only
// asserts on `AddToCart`'s presence/disabled state, never on cart lines).
vi.mock('@/features/auth/use-session', () => ({ useSession: vi.fn(() => ({ signedIn: false, loading: false })) }))
vi.mock('@/features/catalog/server/resolve-products', () => ({ resolveProductsByIds: vi.fn(async () => []) }))

describe('WishlistView', () => {
  beforeEach(() => {
    useWishlistStore.getState().clear()
  })

  it('renders the empty state with a link back to shopping when the wishlist has no items', () => {
    render(<WishlistView />)

    expect(screen.getByText(/your wishlist is empty/i)).toBeInTheDocument()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/collections')
  })

  it('renders saved products resolved from the store', () => {
    const product = getAllProducts()[0]
    useWishlistStore.getState().toggle(product.id)

    render(<WishlistView />)

    expect(screen.getByText(product.name)).toBeInTheDocument()
    expect(screen.getByText(/1 saved item/i)).toBeInTheDocument()
  })

  it('drops ids that no longer resolve to a product', () => {
    useWishlistStore.getState().toggle('does-not-exist')

    render(<WishlistView />)

    expect(screen.getByText(/your wishlist is empty/i)).toBeInTheDocument()
  })

  it('"Clear wishlist" empties the store and shows the empty state', async () => {
    const user = userEvent.setup()
    const product = getAllProducts()[0]
    useWishlistStore.getState().toggle(product.id)

    const { rerender } = render(<WishlistView />)
    await user.click(screen.getByRole('button', { name: /clear wishlist/i }))
    rerender(<WishlistView />)

    expect(useWishlistStore.getState().ids).toEqual([])
    expect(screen.getByText(/your wishlist is empty/i)).toBeInTheDocument()
  })

  it('renders an "Add to bag" control for a variantless saved product', () => {
    const product = getAllProducts().find((p) => p.variants.length === 0)
    if (!product) throw new Error('fixture expects at least one variantless product')
    useWishlistStore.getState().toggle(product.id)

    render(<WishlistView />)

    expect(screen.getByRole('button', { name: /add to bag/i })).toBeInTheDocument()
  })

  it('renders a "Select options" link to the PDP for a saved product with variants', () => {
    const product = getAllProducts().find((p) => p.variants.length > 0)
    if (!product) throw new Error('fixture expects at least one product with variants')
    useWishlistStore.getState().toggle(product.id)

    render(<WishlistView />)

    const link = screen.getByRole('link', { name: /select options/i })
    expect(link).toHaveAttribute('href', `/products/${product.slug}`)
  })
})
