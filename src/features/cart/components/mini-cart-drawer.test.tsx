import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MiniCartDrawer } from '@/features/cart/components/mini-cart-drawer'
import { getAllProducts } from '@/features/catalog/lib/selectors'
import { useCartStore } from '@/features/cart/store'
import { useUiStore } from '@/stores/ui'

vi.mock('@/features/auth/use-session', () => ({ useSession: vi.fn(() => ({ signedIn: false, loading: false })) }))
vi.mock('@/features/catalog/server/resolve-products', () => ({
  resolveProductsByIds: vi.fn(async (ids: string[]) => getAllProducts().filter((p) => ids.includes(p.id))),
}))

describe('MiniCartDrawer', () => {
  beforeEach(() => {
    useUiStore.getState().closeAll()
    useCartStore.getState().clear()
  })

  it('is hidden by default', () => {
    render(<MiniCartDrawer />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the drawer and lists cart items once opened', async () => {
    const product = getAllProducts()[0]
    useCartStore.getState().addItem(product.id, undefined, 2)

    const { rerender } = render(<MiniCartDrawer />)
    useUiStore.getState().openCartDrawer()
    rerender(<MiniCartDrawer />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(await screen.findByText(product.name)).toBeInTheDocument()
  })
})
