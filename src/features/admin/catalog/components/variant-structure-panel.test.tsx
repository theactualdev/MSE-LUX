import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VariantStructurePanel } from '@/features/admin/catalog/components/variant-structure-panel'
import { updateProductVariantsAction } from '@/features/admin/catalog/actions'
import type { AdminProductDetail } from '@/features/admin/catalog/data'

vi.mock('@/features/admin/catalog/actions', () => ({
  updateProductVariantsAction: vi.fn(),
}))

const refreshMock = vi.fn()
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    useRouter: () => ({ refresh: refreshMock, replace: vi.fn(), push: vi.fn() }),
  }
})

const updateProductVariantsActionMock = vi.mocked(updateProductVariantsAction)

const BASE_PRODUCT: AdminProductDetail = {
  id: 'prod-1',
  name: 'Solitaire Ring',
  slug: 'solitaire-ring',
  sku: 'MSE-RNG-002',
  shortDescription: 'A classic solitaire ring.',
  description: 'A classic solitaire ring in platinum.',
  material: 'Platinum',
  materialTags: ['platinum'],
  badges: [],
  status: 'DRAFT',
  priceNgnMinor: 8_000_000,
  priceUsdMinor: 90_000,
  salePriceNgnMinor: null,
  salePriceUsdMinor: null,
  inventory: 0,
  weightGrams: null,
  seoTitle: null,
  seoDescription: null,
  categoryId: 'cat-a',
  subcategoryId: null,
  collectionIds: [],
  images: [],
  optionTypes: [{ id: 'opt-1', name: 'Size', position: 0, values: [{ id: 'val-1', value: 'Small', position: 0 }] }],
  variants: [
    { id: 'var-1', sku: 'MSE-RNG-002-S', inventory: 3, priceNgnMinor: null, priceUsdMinor: null, options: [{ name: 'Size', value: 'Small' }], hasOrders: false },
  ],
  hasOrderLines: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  updateProductVariantsActionMock.mockResolvedValue({ ok: true, revalidate: [] })
})

describe('VariantStructurePanel', () => {
  it('seeds VariantsBuilder from the product\'s optionTypes and existing variants', () => {
    render(<VariantStructurePanel product={BASE_PRODUCT} />)

    expect(screen.getByDisplayValue('Size')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Small')).toBeInTheDocument()
    expect(screen.getByText('MSE-RNG-002-S')).toBeInTheDocument()
  })

  it('a variant with hasOrders renders read-only with no delete toggle', () => {
    const product: AdminProductDetail = {
      ...BASE_PRODUCT,
      variants: [{ ...BASE_PRODUCT.variants[0], hasOrders: true }],
    }
    render(<VariantStructurePanel product={product} />)

    expect(screen.getByText(/has orders/i)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('a duplicate SKU across new rows blocks save with an inline message and no action call', async () => {
    const user = userEvent.setup({ delay: null })
    render(<VariantStructurePanel product={BASE_PRODUCT} />)

    await user.click(screen.getByRole('button', { name: /add option type/i }))
    const nameInputs = screen.getAllByLabelText(/option name/i)
    const valuesInputs = screen.getAllByLabelText(/^values$/i)
    await user.type(nameInputs[nameInputs.length - 1], 'Color')
    await user.type(valuesInputs[valuesInputs.length - 1], 'Gold')
    await user.click(screen.getByRole('button', { name: /generate variants/i }))

    await user.type(screen.getByLabelText(/small \/ gold sku/i), 'mse-rng-002-s')

    await user.click(screen.getByRole('button', { name: /save variants/i }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some((alert) => /fix duplicate variant skus/i.test(alert.textContent ?? ''))).toBe(true)
    expect(updateProductVariantsActionMock).not.toHaveBeenCalled()
  })

  it('save calls updateProductVariantsAction with addVariants/deleteVariantIds/optionTypes, then refreshes on success', async () => {
    const user = userEvent.setup({ delay: null })
    render(<VariantStructurePanel product={BASE_PRODUCT} />)

    await user.click(screen.getByRole('button', { name: /add option type/i }))
    const nameInputs = screen.getAllByLabelText(/option name/i)
    const valuesInputs = screen.getAllByLabelText(/^values$/i)
    await user.type(nameInputs[nameInputs.length - 1], 'Color')
    await user.type(valuesInputs[valuesInputs.length - 1], 'Gold')
    await user.click(screen.getByRole('button', { name: /generate variants/i }))
    await user.type(screen.getByLabelText(/small \/ gold sku/i), 'MSE-RNG-002-SG')

    await user.click(screen.getByRole('checkbox', { name: /delete/i }))

    await user.click(screen.getByRole('button', { name: /save variants/i }))

    await vi.waitFor(() => {
      expect(updateProductVariantsActionMock).toHaveBeenCalledWith('prod-1', {
        addVariants: [
          {
            sku: 'MSE-RNG-002-SG',
            inventory: 0,
            priceNgnMinor: null,
            priceUsdMinor: null,
            options: [
              { name: 'Size', value: 'Small' },
              { name: 'Color', value: 'Gold' },
            ],
          },
        ],
        deleteVariantIds: ['var-1'],
        optionTypes: [
          { name: 'Size', values: ['Small'] },
          { name: 'Color', values: ['Gold'] },
        ],
      })
    })

    expect(await screen.findByText(/variants saved/i)).toBeInTheDocument()
    expect(refreshMock).toHaveBeenCalled()
  })

  it("'variant-has-orders' shows a clear alert distinct from the generic error", async () => {
    updateProductVariantsActionMock.mockResolvedValue({ ok: false, error: 'variant-has-orders' })
    const user = userEvent.setup({ delay: null })
    render(<VariantStructurePanel product={BASE_PRODUCT} />)

    await user.click(screen.getByRole('checkbox', { name: /delete/i }))
    await user.click(screen.getByRole('button', { name: /save variants/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/existing orders/i)
    expect(alert).not.toHaveTextContent(/something went wrong/i)
  })

  it('a generic failure shows the fallback error message', async () => {
    updateProductVariantsActionMock.mockResolvedValue({ ok: false, error: 'error' })
    const user = userEvent.setup({ delay: null })
    render(<VariantStructurePanel product={BASE_PRODUCT} />)

    await user.click(screen.getByRole('checkbox', { name: /delete/i }))
    await user.click(screen.getByRole('button', { name: /save variants/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
  })
})
