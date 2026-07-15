import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MiniCartDrawer } from '@/features/cart/components/mini-cart-drawer'
import { getAllProducts } from '@/features/catalog/lib/selectors'
import { useCartStore } from '@/features/cart/store'
import { useUiStore } from '@/stores/ui'

describe('MiniCartDrawer', () => {
  beforeEach(() => {
    useUiStore.getState().closeAll()
    useCartStore.getState().clear()
  })

  it('is hidden by default', () => {
    render(<MiniCartDrawer />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the drawer and lists cart items once opened', () => {
    const product = getAllProducts()[0]
    useCartStore.getState().addItem(product.id, undefined, 2)

    const { rerender } = render(<MiniCartDrawer />)
    useUiStore.getState().openCartDrawer()
    rerender(<MiniCartDrawer />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(product.name)).toBeInTheDocument()
  })
})
