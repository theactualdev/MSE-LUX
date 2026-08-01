import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GiftSelection } from '@/features/gifting/components/gift-selection'
import type { Product } from '@/types/catalog'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}))

const PRICE_SET = {
  ngn: { amountMinor: 5_000_00, currency: 'NGN' },
  usd: { amountMinor: 50_00, currency: 'USD' },
}

function buildProduct(overrides: Partial<Product>): Product {
  return {
    id: 'p1',
    name: 'Coral Strand Necklace',
    slug: 'coral-strand-necklace',
    shortDescription: 'A hand-strung coral necklace.',
    description: 'A hand-strung coral necklace.',
    priceSet: PRICE_SET,
    sku: 'CSN-001',
    inventory: 5,
    material: 'Coral',
    materialTags: ['Coral'],
    categorySlug: 'necklaces',
    collectionSlugs: [],
    images: [{ src: '/coral.jpg', alt: 'Coral strand necklace' }],
    optionTypes: [],
    variants: [],
    badges: [],
    status: 'active',
    seo: {},
    ...overrides,
  }
}

const VARIANTLESS_IN_STOCK = buildProduct({ id: 'p-necklace', name: 'Coral Strand Necklace', inventory: 5 })

const VARIANTLESS_OUT_OF_STOCK = buildProduct({
  id: 'p-out',
  name: 'Sold Out Bangle',
  inventory: 0,
})

const VARIANT_PRODUCT = buildProduct({
  id: 'p-ring',
  name: 'Signet Ring',
  optionTypes: [{ name: 'Size', values: ['16cm', '18cm'] }],
  variants: [
    { id: 'v-16', sku: 'RING-16', options: [{ name: 'Size', value: '16cm' }], inventory: 4 },
    { id: 'v-18', sku: 'RING-18', options: [{ name: 'Size', value: '18cm' }], inventory: 2 },
  ],
})

const VARIANT_PRODUCT_ALL_OUT = buildProduct({
  id: 'p-ring-out',
  name: 'Out of Stock Ring',
  optionTypes: [{ name: 'Size', values: ['16cm', '18cm'] }],
  variants: [
    { id: 'v-16o', sku: 'RINGO-16', options: [{ name: 'Size', value: '16cm' }], inventory: 0 },
    { id: 'v-18o', sku: 'RINGO-18', options: [{ name: 'Size', value: '18cm' }], inventory: 0 },
  ],
})

describe('GiftSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disables a variant product\'s checkbox and shows a hint until a variant is chosen', async () => {
    const user = userEvent.setup()
    render(<GiftSelection token="tok" products={[VARIANT_PRODUCT]} />)

    const checkbox = screen.getByRole('checkbox', { name: /add signet ring to the gift/i })
    expect(checkbox).toBeDisabled()
    expect(screen.getByText(/choose an option to add this to the gift/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '18cm' }))

    expect(checkbox).toBeEnabled()
    expect(screen.queryByText(/choose an option to add this to the gift/i)).not.toBeInTheDocument()
  })

  it('disables the checkbox for a variantless out-of-stock product and shows "Out of stock"', () => {
    render(<GiftSelection token="tok" products={[VARIANTLESS_OUT_OF_STOCK]} />)

    const checkbox = screen.getByRole('checkbox', { name: /add sold out bangle to the gift/i })
    expect(checkbox).toBeDisabled()
    expect(screen.getByText(/^out of stock$/i)).toBeInTheDocument()
  })

  it('disables the checkbox for a variant product with no in-stock variant at all, without a variant hint', () => {
    render(<GiftSelection token="tok" products={[VARIANT_PRODUCT_ALL_OUT]} />)

    const checkbox = screen.getByRole('checkbox', { name: /add out of stock ring to the gift/i })
    expect(checkbox).toBeDisabled()
    expect(screen.getByText(/^out of stock$/i)).toBeInTheDocument()
    expect(screen.queryByText(/choose an option to add this to the gift/i)).not.toBeInTheDocument()
  })

  it('disables "Continue" with nothing selected', () => {
    render(<GiftSelection token="tok" products={[VARIANTLESS_IN_STOCK]} />)

    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
  })

  it('enables "Continue" once an item is checked, and navigates to the gift checkout route on submit', async () => {
    const user = userEvent.setup()
    render(<GiftSelection token="tok-123" products={[VARIANTLESS_IN_STOCK]} />)

    const checkbox = screen.getByRole('checkbox', { name: /add coral strand necklace to the gift/i })
    await user.click(checkbox)

    const continueButton = screen.getByRole('button', { name: /continue/i })
    expect(continueButton).toBeEnabled()
    await user.click(continueButton)

    expect(push).toHaveBeenCalledTimes(1)
    const url = push.mock.calls[0][0] as string
    expect(url.startsWith('/wishlist/shared/tok-123/checkout?selections=')).toBe(true)

    const query = new URL(url, 'https://example.com').searchParams.get('selections')
    expect(JSON.parse(query ?? '[]')).toEqual([{ productId: 'p-necklace', variantId: null }])
  })

  it('serialises a chosen variant\'s id, and never includes an unchecked product', async () => {
    const user = userEvent.setup()
    render(<GiftSelection token="tok" products={[VARIANT_PRODUCT, VARIANTLESS_IN_STOCK]} />)

    await user.click(screen.getByRole('button', { name: '18cm' }))
    await user.click(screen.getByRole('checkbox', { name: /add signet ring to the gift/i }))
    // Leave the necklace unchecked.

    await user.click(screen.getByRole('button', { name: /continue/i }))

    const url = push.mock.calls[0][0] as string
    const query = new URL(url, 'https://example.com').searchParams.get('selections')
    expect(JSON.parse(query ?? '[]')).toEqual([{ productId: 'p-ring', variantId: 'v-18' }])
  })
})
