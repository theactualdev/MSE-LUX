import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProductCard } from '@/features/catalog/components/product-card'
import { getAllProducts } from '@/features/catalog/lib/selectors'
import { useWishlistStore } from '@/features/wishlist/store'

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
})
