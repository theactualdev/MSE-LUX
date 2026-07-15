import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CartLineItem } from '@/features/cart/components/cart-line-item'
import type { CartLine } from '@/features/cart/lib/lines'
import type { Product } from '@/types/catalog'

const product = {
  id: 'TEST-1',
  name: 'Test Bracelet',
  slug: 'test-bracelet',
  shortDescription: 'A test bracelet.',
  description: 'A test bracelet.',
  priceSet: {
    ngn: { amountMinor: 1_500_000, currency: 'NGN' as const },
    usd: { amountMinor: 1900, currency: 'USD' as const },
  },
  sku: 'TEST-1',
  inventory: 10,
  material: 'Gold',
  categorySlug: 'bracelets',
  collectionSlugs: [],
  images: [{ src: 'https://picsum.photos/seed/test-bracelet-1/800/1000', alt: 'Test Bracelet' }],
  optionTypes: [{ name: 'Size', values: ['18cm'] }],
  variants: [{ id: 'TEST-1-V1', sku: 'TEST-1-18', options: [{ name: 'Size', value: '18cm' }], inventory: 5 }],
  badges: [],
  status: 'active',
  seo: {},
} as unknown as Product

const line: CartLine = {
  product,
  variant: product.variants[0],
  image: product.images[0],
  quantity: 2,
  unitPrice: { amountMinor: 1_500_000, currency: 'NGN' },
  lineTotal: { amountMinor: 3_000_000, currency: 'NGN' },
}

describe('CartLineItem', () => {
  it('renders the product name and formatted line total', () => {
    render(<CartLineItem line={line} />)

    expect(screen.getByText('Test Bracelet')).toBeInTheDocument()
    expect(screen.getByText(/₦30,000/)).toBeInTheDocument()
  })

  it('renders an accessible remove button and quantity stepper when editable, wired to callbacks', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    const onQtyChange = vi.fn()

    render(<CartLineItem line={line} editable onQtyChange={onQtyChange} onRemove={onRemove} />)

    const removeButton = screen.getByRole('button', { name: /remove test bracelet/i })
    await user.click(removeButton)
    expect(onRemove).toHaveBeenCalledTimes(1)

    const increase = screen.getByRole('button', { name: /increase/i })
    await user.click(increase)
    expect(onQtyChange).toHaveBeenCalledWith(3)
  })

  it('does not render editing controls when not editable', () => {
    render(<CartLineItem line={line} />)

    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
