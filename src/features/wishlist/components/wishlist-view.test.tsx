import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WishlistView } from '@/features/wishlist/components/wishlist-view'
import { useWishlistStore } from '@/features/wishlist/store'
import { getAllProducts } from '@/features/catalog/lib/selectors'

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
})
