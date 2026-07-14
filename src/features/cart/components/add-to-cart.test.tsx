import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from '@/components/providers/toaster'
import { AddToCart } from '@/features/cart/components/add-to-cart'
import { useCartStore } from '@/features/cart/store'
import type { Product } from '@/types/catalog'

const priceSet = {
  ngn: { amountMinor: 2_400_000, currency: 'NGN' as const },
  usd: { amountMinor: 2900, currency: 'USD' as const },
}

const simpleProduct: Product = {
  id: 'TEST-SIMPLE',
  name: 'Test Cuff',
  slug: 'test-cuff',
  shortDescription: 'A test cuff.',
  description: 'A test cuff.',
  priceSet,
  sku: 'TEST-SIMPLE-SKU',
  inventory: 10,
  material: 'Gold-plated brass',
  categorySlug: 'bracelets',
  collectionSlugs: [],
  images: [{ src: 'https://picsum.photos/seed/test-cuff-1/800/1000', alt: 'Test Cuff' }],
  optionTypes: [],
  variants: [],
  badges: [],
  status: 'active',
  seo: {},
}

const variantProduct: Product = {
  ...simpleProduct,
  id: 'TEST-VARIANT',
  slug: 'test-variant',
  optionTypes: [{ name: 'Size', values: ['16cm', '18cm'] }],
  variants: [
    { id: 'TEST-VARIANT-V1', sku: 'TEST-V-16', options: [{ name: 'Size', value: '16cm' }], inventory: 5 },
    { id: 'TEST-VARIANT-V2', sku: 'TEST-V-18', options: [{ name: 'Size', value: '18cm' }], inventory: 0 },
  ],
}

describe('AddToCart', () => {
  beforeEach(() => useCartStore.getState().clear())

  it('adds the product to the cart and shows a toast on click', async () => {
    const user = userEvent.setup()
    render(
      <Toaster>
        <AddToCart product={simpleProduct} qty={2} />
      </Toaster>,
    )

    const before = useCartStore.getState().itemCount()
    await user.click(screen.getByRole('button', { name: /add to bag/i }))

    expect(useCartStore.getState().itemCount()).toBe(before + 2)
    expect(await screen.findByText(/added to bag/i)).toBeInTheDocument()
  })

  it('is disabled when the product requires a variant and none is selected', () => {
    render(
      <Toaster>
        <AddToCart product={variantProduct} qty={1} />
      </Toaster>,
    )

    expect(screen.getByRole('button', { name: /add to bag/i })).toBeDisabled()
  })

  it('is disabled when the selected variant is out of stock', () => {
    const outOfStock = variantProduct.variants[1]
    render(
      <Toaster>
        <AddToCart product={variantProduct} selectedVariant={outOfStock} qty={1} />
      </Toaster>,
    )

    expect(screen.getByRole('button', { name: /add to bag/i })).toBeDisabled()
  })

  it('enables and adds the exact variant when one is selected and in stock', async () => {
    const user = userEvent.setup()
    const inStock = variantProduct.variants[0]
    render(
      <Toaster>
        <AddToCart product={variantProduct} selectedVariant={inStock} qty={1} />
      </Toaster>,
    )

    const button = screen.getByRole('button', { name: /add to bag/i })
    expect(button).toBeEnabled()

    await user.click(button)

    expect(useCartStore.getState().items).toEqual([
      { productId: variantProduct.id, variantId: inStock.id, quantity: 1 },
    ])
  })
})
