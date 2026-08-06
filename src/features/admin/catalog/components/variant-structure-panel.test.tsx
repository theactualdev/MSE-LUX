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

  it('clears the "Variants saved." note as soon as the builder reports a further edit', async () => {
    const user = userEvent.setup({ delay: null })
    render(<VariantStructurePanel product={BASE_PRODUCT} />)

    await user.click(screen.getByRole('checkbox', { name: /delete/i }))
    await user.click(screen.getByRole('button', { name: /save variants/i }))
    expect(await screen.findByText(/variants saved/i)).toBeInTheDocument()

    // Any further edit — even toggling the same checkbox back off — must
    // clear the stale note; otherwise it would misleadingly imply the
    // in-progress, unsaved edit was already persisted (mirrors ImageManager's
    // own clear-on-edit idiom).
    await user.click(screen.getByRole('checkbox', { name: /delete/i }))

    expect(screen.queryByText(/variants saved/i)).not.toBeInTheDocument()
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

/**
 * Regression cover for the failure the store owner actually hit: a product
 * with options and no variants renders every size struck through and refuses
 * "Add to bag", while the admin looks saved. Generated rows start with a blank
 * SKU, so the save that fixes it was also the save that failed — and the panel
 * reported "Something went wrong. Please try again."
 */
describe('VariantStructurePanel — explaining failures', () => {
  const OPTIONS_NO_VARIANTS: AdminProductDetail = { ...BASE_PRODUCT, variants: [] }

  it('warns up front when a product has options but no variants', () => {
    render(<VariantStructurePanel product={OPTIONS_NO_VARIANTS} />)

    expect(screen.getByText(/options but no variants/i)).toBeInTheDocument()
    expect(screen.getByText(/cannot buy it/i)).toBeInTheDocument()
  })

  it('does not show that warning once variants exist', () => {
    render(<VariantStructurePanel product={BASE_PRODUCT} />)

    expect(screen.queryByText(/options but no variants/i)).not.toBeInTheDocument()
  })

  it('names the rows missing a SKU instead of calling the server', async () => {
    const user = userEvent.setup({ delay: null })
    render(<VariantStructurePanel product={OPTIONS_NO_VARIANTS} />)

    await user.click(screen.getByRole('button', { name: /generate variants/i }))
    await user.click(screen.getByRole('button', { name: /save variants/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/every variant needs its own sku/i)
    // The row is identified by its options, so it can be found on screen.
    expect(alert.textContent).toMatch(/Size: Small/i)
    expect(updateProductVariantsActionMock).not.toHaveBeenCalled()
  })

  it('translates a server field issue into the offending row and field', async () => {
    const user = userEvent.setup({ delay: null })
    updateProductVariantsActionMock.mockResolvedValue({
      ok: false,
      error: 'invalid-input',
      issues: [{ code: 'custom', path: ['addVariants', 0, 'sku'], message: 'Too small' }],
    } as Awaited<ReturnType<typeof updateProductVariantsAction>>)

    render(<VariantStructurePanel product={OPTIONS_NO_VARIANTS} />)
    await user.click(screen.getByRole('button', { name: /generate variants/i }))
    await user.type(screen.getByLabelText(/small sku/i), 'MSE-RNG-002-S2')
    await user.click(screen.getByRole('button', { name: /save variants/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Size: Small — SKU is required/i)
    expect(alert.textContent).not.toMatch(/something went wrong/i)
  })

  it('explains a SKU already used by another product', async () => {
    const user = userEvent.setup({ delay: null })
    updateProductVariantsActionMock.mockResolvedValue({ ok: false, error: 'conflict-sku' })

    render(<VariantStructurePanel product={OPTIONS_NO_VARIANTS} />)
    await user.click(screen.getByRole('button', { name: /generate variants/i }))
    await user.type(screen.getByLabelText(/small sku/i), 'MSE-RNG-002-S')
    await user.click(screen.getByRole('button', { name: /save variants/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/already belongs to a different product/i)
  })

  // Blank inventory saves as 0 without complaint, which reproduces the exact
  // symptom the owner started with — options that refuse to be selected — by
  // a different route and with nothing having gone visibly wrong.
  it('warns when every saved variant has zero stock', async () => {
    const user = userEvent.setup({ delay: null })
    render(<VariantStructurePanel product={OPTIONS_NO_VARIANTS} />)

    await user.click(screen.getByRole('button', { name: /generate variants/i }))
    await user.type(screen.getByLabelText(/small sku/i), 'MSE-RNG-002-S3')
    await user.click(screen.getByRole('button', { name: /save variants/i }))

    expect(await screen.findByText(/every one has 0 stock/i)).toBeInTheDocument()
  })
})
