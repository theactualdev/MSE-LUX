import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductCard } from '@/features/catalog/components/product-card'
import { getAllProducts } from '@/features/catalog/lib/selectors'
import { useWishlistStore } from '@/features/wishlist/store'

// `ProductCard`'s heart now reads `useWishlist()`, which pulls in
// `useSession()` (the real Supabase browser client, which throws when
// `NEXT_PUBLIC_SUPABASE_*` is unset under test). Stubbed to guest, same as
// the other wishlist/cart consumer suites.
vi.mock('@/features/auth/use-session', () => ({ useSession: vi.fn(() => ({ signedIn: false, loading: false })) }))

const product = getAllProducts()[0]

describe('ProductCard', () => {
  beforeEach(() => useWishlistStore.getState().clear())
  it('renders the product name and links to its PDP', () => {
    render(<ProductCard product={product} />)
    expect(screen.getByText(product.name)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: new RegExp(product.name, 'i') })).toHaveAttribute('href', `/products/${product.slug}`)
  })
  it('has an accessible wishlist toggle', () => {
    render(<ProductCard product={product} />)
    expect(screen.getByRole('button', { name: /wishlist|save/i })).toBeInTheDocument()
  })
  it('toggles the guest wishlist store on click', async () => {
    const user = userEvent.setup()
    render(<ProductCard product={product} />)

    const toggleButton = screen.getByRole('button', { name: /wishlist|save/i })
    await user.click(toggleButton)

    expect(useWishlistStore.getState().ids).toEqual([product.id])
  })
})
