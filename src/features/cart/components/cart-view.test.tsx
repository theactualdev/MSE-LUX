import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CartView } from '@/features/cart/components/cart-view'
import { getAllProducts } from '@/features/catalog/lib/selectors'
import { useCartStore } from '@/features/cart/store'

vi.mock('@/features/auth/use-session', () => ({ useSession: vi.fn(() => ({ signedIn: false, loading: false })) }))
vi.mock('@/features/catalog/server/resolve-products', () => ({
  resolveProductsByIds: vi.fn(async (ids: string[]) => getAllProducts().filter((p) => ids.includes(p.id))),
}))

describe('CartView', () => {
  beforeEach(() => {
    useCartStore.getState().clear()
  })

  it('shows the branded empty-bag state with a continue-shopping link when there are no items', async () => {
    render(<CartView />)

    expect(await screen.findByText(/your bag is empty/i)).toBeInTheDocument()
    const continueLink = screen.getByRole('link', { name: /continue shopping/i })
    expect(continueLink).toHaveAttribute('href', '/')
  })

  it('lists cart lines, a checkout link, and updates the total when quantity changes', async () => {
    const user = userEvent.setup()
    const product = getAllProducts()[0]
    const variantId = product.variants[0]?.id
    useCartStore.getState().addItem(product.id, variantId, 1)

    render(<CartView />)
    expect(await screen.findByText(product.name)).toBeInTheDocument()

    const checkoutLink = screen.getByRole('link', { name: /proceed to checkout/i })
    expect(checkoutLink).toHaveAttribute('href', '/checkout')

    const increase = screen.getByRole('button', { name: /increase/i })
    await user.click(increase)

    await waitFor(() => expect(useCartStore.getState().items[0].quantity).toBe(2))
  })

  it('removes a line and falls back to the empty state once the bag is cleared', async () => {
    const user = userEvent.setup()
    const product = getAllProducts()[0]
    const variantId = product.variants[0]?.id
    useCartStore.getState().addItem(product.id, variantId, 1)

    render(<CartView />)
    const removeButton = await screen.findByRole('button', { name: new RegExp(`remove ${product.name}`, 'i') })
    await user.click(removeButton)

    expect(await screen.findByText(/your bag is empty/i)).toBeInTheDocument()
  })
})
