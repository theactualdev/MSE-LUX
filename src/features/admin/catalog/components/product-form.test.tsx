import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductForm } from '@/features/admin/catalog/components/product-form'
import { updateProductAction } from '@/features/admin/catalog/actions'
import type { AdminProductDetail, TaxonomyOptions } from '@/features/admin/catalog/data'

vi.mock('@/features/admin/catalog/actions', () => ({
  updateProductAction: vi.fn(),
}))

const refreshMock = vi.fn()
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    useRouter: () => ({ refresh: refreshMock, replace: vi.fn(), push: vi.fn() }),
  }
})

const updateProductActionMock = vi.mocked(updateProductAction)

const TAXONOMY: TaxonomyOptions = {
  categories: [
    {
      id: 'cat-a',
      name: 'Rings',
      subcategories: [
        { id: 'sub-a1', name: 'Engagement' },
        { id: 'sub-a2', name: 'Wedding' },
      ],
    },
    { id: 'cat-b', name: 'Bracelets', subcategories: [] },
  ],
  collections: [
    { id: 'col-1', name: 'Spring 2026', slug: 'spring-2026' },
    { id: 'col-2', name: 'Bridal', slug: 'bridal' },
  ],
}

const PRODUCT_SIMPLE: AdminProductDetail = {
  id: 'prod-1',
  name: 'Diamond Tennis Bracelet',
  slug: 'diamond-tennis-bracelet',
  sku: 'MSE-BRC-001',
  shortDescription: 'A timeless tennis bracelet.',
  description: 'A timeless tennis bracelet in 18k gold with brilliant-cut diamonds.',
  material: '18k Gold',
  materialTags: ['gold', 'diamond'],
  badges: ['NEW'],
  status: 'ACTIVE',
  priceNgnMinor: 4_500_000,
  priceUsdMinor: 50_000,
  salePriceNgnMinor: null,
  salePriceUsdMinor: null,
  inventory: 12,
  weightGrams: 18,
  seoTitle: 'Diamond Tennis Bracelet | MSE Lux',
  seoDescription: null,
  categoryId: 'cat-a',
  subcategoryId: 'sub-a1',
  collectionIds: ['col-1'],
  images: [],
  optionTypes: [],
  variants: [],
  hasOrderLines: false,
}

const EXPECTED_PAYLOAD_SIMPLE = {
  name: 'Diamond Tennis Bracelet',
  slug: 'diamond-tennis-bracelet',
  sku: 'MSE-BRC-001',
  shortDescription: 'A timeless tennis bracelet.',
  description: 'A timeless tennis bracelet in 18k gold with brilliant-cut diamonds.',
  material: '18k Gold',
  materialTags: ['gold', 'diamond'],
  badges: ['NEW'],
  priceNgnMinor: 4_500_000,
  priceUsdMinor: 50_000,
  salePriceNgnMinor: null,
  salePriceUsdMinor: null,
  inventory: 12,
  weightGrams: 18,
  status: 'ACTIVE',
  seoTitle: 'Diamond Tennis Bracelet | MSE Lux',
  seoDescription: null,
  categoryId: 'cat-a',
  subcategoryId: 'sub-a1',
  collectionIds: ['col-1'],
  variants: [],
}

const PRODUCT_VARIANTS: AdminProductDetail = {
  id: 'prod-2',
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
  optionTypes: [],
  variants: [
    {
      id: 'var-1',
      sku: 'MSE-RNG-002-S',
      inventory: 3,
      priceNgnMinor: null,
      priceUsdMinor: null,
      options: [{ name: 'Size', value: 'Small' }],
    },
    {
      id: 'var-2',
      sku: 'MSE-RNG-002-M',
      inventory: 5,
      priceNgnMinor: 8_500_000,
      priceUsdMinor: 95_000,
      options: [{ name: 'Size', value: 'Medium' }],
    },
  ],
  hasOrderLines: false,
}

const EXPECTED_PAYLOAD_VARIANTS = {
  name: 'Solitaire Ring',
  slug: 'solitaire-ring',
  sku: 'MSE-RNG-002',
  shortDescription: 'A classic solitaire ring.',
  description: 'A classic solitaire ring in platinum.',
  material: 'Platinum',
  materialTags: ['platinum'],
  badges: [],
  priceNgnMinor: 8_000_000,
  priceUsdMinor: 90_000,
  salePriceNgnMinor: null,
  salePriceUsdMinor: null,
  inventory: 0,
  weightGrams: null,
  status: 'DRAFT',
  seoTitle: null,
  seoDescription: null,
  categoryId: 'cat-a',
  subcategoryId: null,
  collectionIds: [],
  variants: [
    { id: 'var-1', sku: 'MSE-RNG-002-S', inventory: 3, priceNgnMinor: null, priceUsdMinor: null },
    { id: 'var-2', sku: 'MSE-RNG-002-M', inventory: 5, priceNgnMinor: 8_500_000, priceUsdMinor: 95_000 },
  ],
}

describe('ProductForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateProductActionMock.mockResolvedValue({ ok: true, revalidate: [] })
  })

  it('renders every editable field prefilled from AdminProductDetail', () => {
    render(<ProductForm product={PRODUCT_SIMPLE} taxonomy={TAXONOMY} />)

    expect(screen.getByLabelText('Name')).toHaveValue('Diamond Tennis Bracelet')
    expect(screen.getByLabelText('Slug')).toHaveValue('diamond-tennis-bracelet')
    expect(screen.getByLabelText('SKU')).toHaveValue('MSE-BRC-001')
    expect(screen.getByLabelText('Short description')).toHaveValue('A timeless tennis bracelet.')
    expect(screen.getByLabelText('Description')).toHaveValue('A timeless tennis bracelet in 18k gold with brilliant-cut diamonds.')
    expect(screen.getByLabelText('Material')).toHaveValue('18k Gold')
    expect(screen.getByLabelText('Material tags')).toHaveValue('gold, diamond')

    expect(screen.getByLabelText('New')).toBeChecked()
    expect(screen.getByLabelText('Best seller')).not.toBeChecked()

    expect(screen.getByLabelText('Price (NGN)')).toHaveValue(45000)
    expect(screen.getByLabelText('Price (USD)')).toHaveValue(500)
    expect(screen.getByLabelText('Sale price (NGN)')).toHaveValue(null)
    expect(screen.getByLabelText('Sale price (USD)')).toHaveValue(null)

    expect(screen.getByLabelText('Inventory')).toHaveValue(12)
    expect(screen.getByLabelText('Weight (g)')).toHaveValue(18)

    expect(screen.getByLabelText('Status')).toHaveValue('ACTIVE')
    expect(screen.getByLabelText('SEO title')).toHaveValue('Diamond Tennis Bracelet | MSE Lux')
    expect(screen.getByLabelText('SEO description')).toHaveValue('')

    expect(screen.getByLabelText('Category')).toHaveValue('cat-a')
    expect(screen.getByLabelText('Subcategory')).toHaveValue('sub-a1')
    expect(screen.getByRole('option', { name: 'Engagement' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Wedding' })).toBeInTheDocument()

    expect(screen.getByLabelText('Spring 2026')).toBeChecked()
    expect(screen.getByLabelText('Bridal')).not.toBeChecked()
  })

  it('submitting unchanged calls updateProductAction with a payload matching UpdateProductInput exactly', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProductForm product={PRODUCT_SIMPLE} taxonomy={TAXONOMY} />)

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await vi.waitFor(() => {
      expect(updateProductActionMock).toHaveBeenCalledWith('prod-1', EXPECTED_PAYLOAD_SIMPLE)
    })
  })

  it('success shows a success note and calls router.refresh()', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProductForm product={PRODUCT_SIMPLE} taxonomy={TAXONOMY} />)

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('conflict-slug shows a field-level alert on slug', async () => {
    updateProductActionMock.mockResolvedValue({ ok: false, error: 'conflict-slug' })
    const user = userEvent.setup({ delay: null })
    render(<ProductForm product={PRODUCT_SIMPLE} taxonomy={TAXONOMY} />)

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/slug/i)
  })

  it('invalid-input with issues renders each issue at its path', async () => {
    updateProductActionMock.mockResolvedValue({
      ok: false,
      error: 'invalid-input',
      issues: [{ code: 'custom', path: ['description'], message: 'Description looks off.' } as never],
    })
    const user = userEvent.setup({ delay: null })
    render(<ProductForm product={PRODUCT_SIMPLE} taxonomy={TAXONOMY} />)

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('description: Description looks off.')
  })

  it('a conflict result reads "Something changed — refresh and try again", never "not found"', async () => {
    updateProductActionMock.mockResolvedValue({ ok: false, error: 'conflict' })
    const user = userEvent.setup({ delay: null })
    render(<ProductForm product={PRODUCT_SIMPLE} taxonomy={TAXONOMY} />)

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something changed — refresh and try again')
    expect(alert).not.toHaveTextContent(/not found/i)
  })

  it('blank name blocks submit', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProductForm product={PRODUCT_SIMPLE} taxonomy={TAXONOMY} />)

    await user.clear(screen.getByLabelText('Name'))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i)
    expect(updateProductActionMock).not.toHaveBeenCalled()
  })

  it('sale price >= regular price blocks submit with the schema.ts copy', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProductForm product={PRODUCT_SIMPLE} taxonomy={TAXONOMY} />)

    await user.type(screen.getByLabelText('Sale price (NGN)'), '45000')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sale price must be below the regular NGN price')
    expect(updateProductActionMock).not.toHaveBeenCalled()
  })

  it('category change resets the subcategory to None', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProductForm product={PRODUCT_SIMPLE} taxonomy={TAXONOMY} />)

    await user.selectOptions(screen.getByLabelText('Category'), 'cat-b')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await vi.waitFor(() => {
      expect(updateProductActionMock).toHaveBeenCalledWith(
        'prod-1',
        expect.objectContaining({ categoryId: 'cat-b', subcategoryId: null }),
      )
    })
  })

  it('variant product: renders per-variant sku/inventory/price rows and hides the product-level inventory input', () => {
    render(<ProductForm product={PRODUCT_VARIANTS} taxonomy={TAXONOMY} />)

    expect(screen.queryByLabelText('Inventory')).not.toBeInTheDocument()

    expect(screen.getByLabelText('Small SKU')).toHaveValue('MSE-RNG-002-S')
    expect(screen.getByLabelText('Small inventory')).toHaveValue(3)
    expect(screen.getByLabelText('Small price override (NGN)')).toHaveValue(null)
    expect(screen.getByLabelText('Small price override (USD)')).toHaveValue(null)

    expect(screen.getByLabelText('Medium SKU')).toHaveValue('MSE-RNG-002-M')
    expect(screen.getByLabelText('Medium inventory')).toHaveValue(5)
    expect(screen.getByLabelText('Medium price override (NGN)')).toHaveValue(85000)
    expect(screen.getByLabelText('Medium price override (USD)')).toHaveValue(950)
  })

  it('variant product: submitting unchanged submits the current product-level inventory unchanged plus every variant', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProductForm product={PRODUCT_VARIANTS} taxonomy={TAXONOMY} />)

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await vi.waitFor(() => {
      expect(updateProductActionMock).toHaveBeenCalledWith('prod-2', EXPECTED_PAYLOAD_VARIANTS)
    })
  })
})
