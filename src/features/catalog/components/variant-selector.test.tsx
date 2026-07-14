import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VariantSelector } from '@/features/catalog/components/variant-selector'
import type { Product } from '@/types/catalog'

const priceSet = {
  ngn: { amountMinor: 1_500_000, currency: 'NGN' as const },
  usd: { amountMinor: 1900, currency: 'USD' as const },
}

const product = {
  id: 'TEST-1',
  name: 'Test Bracelet',
  slug: 'test-bracelet',
  shortDescription: 'A test bracelet.',
  description: 'A test bracelet.',
  priceSet,
  sku: 'TEST-1',
  inventory: 0,
  material: 'Gold',
  categorySlug: 'bracelets',
  collectionSlugs: [],
  images: [{ src: 'https://picsum.photos/seed/test-bracelet-1/800/1000', alt: 'Test Bracelet' }],
  optionTypes: [{ name: 'Size', values: ['16cm', '18cm', '20cm'] }],
  variants: [
    { id: 'TEST-1-V1', sku: 'TEST-1-16', options: [{ name: 'Size', value: '16cm' }], inventory: 10 },
    { id: 'TEST-1-V2', sku: 'TEST-1-18', options: [{ name: 'Size', value: '18cm' }], inventory: 5 },
    { id: 'TEST-1-V3', sku: 'TEST-1-20', options: [{ name: 'Size', value: '20cm' }], inventory: 0 },
  ],
  badges: [],
  status: 'active',
  seo: {},
} as unknown as Product

describe('VariantSelector', () => {
  it('selects an option value on click and reports the matching variant', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<VariantSelector product={product} optionState={{}} onChange={onChange} />)

    const eighteen = screen.getByRole('button', { name: '18cm' })
    expect(eighteen).toHaveAttribute('aria-pressed', 'false')

    await user.click(eighteen)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      options: [{ name: 'Size', value: '18cm' }],
      variant: product.variants[1],
    })
  })

  it('reflects the currently selected value via aria-pressed when controlled', () => {
    render(<VariantSelector product={product} optionState={{ Size: '16cm' }} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: '16cm' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '18cm' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('disables an option value with no in-stock variant', () => {
    render(<VariantSelector product={product} optionState={{}} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /20cm/ })).toBeDisabled()
  })

  it('labels each option group with the option type name', () => {
    render(<VariantSelector product={product} optionState={{}} onChange={vi.fn()} />)

    expect(screen.getByText('Size')).toBeInTheDocument()
  })
})
