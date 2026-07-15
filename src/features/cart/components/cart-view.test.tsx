import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CartView } from '@/features/cart/components/cart-view'
import { getAllProducts } from '@/features/catalog/lib/selectors'
import { useCartStore } from '@/features/cart/store'

describe('CartView', () => {
  beforeEach(() => {
    useCartStore.getState().clear()
  })

  it('shows the branded empty-bag state with a continue-shopping link when there are no items', () => {
    render(<CartView />)

    expect(screen.getByText(/your bag is empty/i)).toBeInTheDocument()
    const continueLink = screen.getByRole('link', { name: /continue shopping/i })
    expect(continueLink).toHaveAttribute('href', '/')
  })

  it('lists cart lines, a checkout link, and updates the total when quantity changes', async () => {
    const user = userEvent.setup()
    const product = getAllProducts()[0]
    const variantId = product.variants[0]?.id
    useCartStore.getState().addItem(product.id, variantId, 1)

    const { rerender } = render(<CartView />)
    expect(screen.getByText(product.name)).toBeInTheDocument()

    const checkoutLink = screen.getByRole('link', { name: /proceed to checkout/i })
    expect(checkoutLink).toHaveAttribute('href', '/checkout')

    const increase = screen.getByRole('button', { name: /increase/i })
    await user.click(increase)
    rerender(<CartView />)

    expect(useCartStore.getState().items[0].quantity).toBe(2)
  })

  it('removes a line and falls back to the empty state once the bag is cleared', async () => {
    const user = userEvent.setup()
    const product = getAllProducts()[0]
    const variantId = product.variants[0]?.id
    useCartStore.getState().addItem(product.id, variantId, 1)

    const { rerender } = render(<CartView />)
    const removeButton = screen.getByRole('button', { name: new RegExp(`remove ${product.name}`, 'i') })
    await user.click(removeButton)
    rerender(<CartView />)

    expect(screen.getByText(/your bag is empty/i)).toBeInTheDocument()
  })
})
