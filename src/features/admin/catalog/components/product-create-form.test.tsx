import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductCreateForm } from '@/features/admin/catalog/components/product-create-form'
import { createProductAction, uploadProductImageAction } from '@/features/admin/catalog/actions'
import type { TaxonomyOptions } from '@/features/admin/catalog/data'
import type { CreateProductInput } from '@/features/admin/catalog/schema'

// This form's fuller scenarios (full-payload fill, builder interaction,
// staged image upload) chain many `user.type`/`user.click` calls plus a
// real upload-then-re-enable round trip — comfortably past the 5s default
// under this environment's slower transform/transition timing.
vi.setConfig({ testTimeout: 20_000 })

vi.mock('@/features/admin/catalog/actions', () => ({
  createProductAction: vi.fn(),
  uploadProductImageAction: vi.fn(),
  updateProductImagesAction: vi.fn(),
  updateProductAction: vi.fn(),
}))

const pushMock = vi.fn()
const refreshMock = vi.fn()
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    useRouter: () => ({ refresh: refreshMock, replace: vi.fn(), push: pushMock }),
  }
})

// Mirrors the `next/image` stub in `image-manager.test.tsx` — a plain
// `<img>` passthrough so ImageManager's thumbnails render without
// next/image's real loader/srcset machinery.
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}))

const createProductActionMock = vi.mocked(createProductAction)
const uploadProductImageActionMock = vi.mocked(uploadProductImageAction)

type TestUser = ReturnType<typeof userEvent.setup>

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

/** Mirrors the size-getter trick in `image-manager.test.tsx` — a real File
 * object is enough here, size/type only matter for the client pre-checks
 * ImageManager itself already covers. */
function fakeFile(name: string, type: string): File {
  return new File(['x'], name, { type })
}

/** Uploads one file via the staged ImageManager and fills its alt text —
 * both steps are needed before this form's own "every image needs alt
 * text" pre-submit check passes. */
async function uploadImageWithAlt(user: TestUser, alt: string) {
  const before = screen.queryAllByRole('img').length
  const file = fakeFile(`photo-${before}.jpg`, 'image/jpeg')
  const input = screen.getByLabelText(/add image/i)
  fireEvent.change(input, { target: { files: [file] } })
  await vi.waitFor(
    () => {
      expect(screen.getAllByRole('img')).toHaveLength(before + 1)
    },
    { timeout: 10_000 },
  )
  const altInputs = screen.getAllByLabelText(/alt text for image/i)
  const target = altInputs[altInputs.length - 1]
  // The upload's `useTransition` flips `pending` back to `false` (and the
  // alt input re-enables) one tick after the awaited mock resolves — the
  // image thumbnail itself can already be in the DOM before that happens,
  // so wait for the input to actually be interactive before typing into it.
  // A generous explicit timeout here (well under the file's `testTimeout`)
  // absorbs this sandbox's slow/variable transition timing under parallel
  // test-worker load, without masking a genuine hang.
  await vi.waitFor(
    () => {
      expect(target).toBeEnabled()
    },
    { timeout: 10_000 },
  )
  await user.type(target, alt)
}

/** Minimal set of fields that clears every pre-submit check: a name, both
 * regular prices, and one image with alt text. */
async function fillMinimalValid(user: TestUser) {
  await user.type(screen.getByLabelText('Name'), 'Diamond Ring')
  await user.type(screen.getByLabelText('Price (NGN)'), '45000')
  await user.type(screen.getByLabelText('Price (USD)'), '500')
  await uploadImageWithAlt(user, 'Front view')
}

beforeEach(() => {
  vi.clearAllMocks()
  let uploadCount = 0
  uploadProductImageActionMock.mockImplementation(async () => {
    uploadCount += 1
    return { ok: true, src: `https://x.supabase.co/storage/v1/object/public/product-images/${uploadCount}.jpg` }
  })
  createProductActionMock.mockResolvedValue({ ok: true, revalidate: [], productId: 'prod-999' })
})

describe('ProductCreateForm', () => {
  it('defaults: status DRAFT preselected, everything else empty', () => {
    render(<ProductCreateForm taxonomy={TAXONOMY} />)

    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Draft')
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Slug')).toHaveValue('')
    expect(screen.getByLabelText('SKU')).toHaveValue('')
    expect(screen.getByLabelText('Short description')).toHaveValue('')
    expect(screen.getByLabelText('Description')).toHaveValue('')
    expect(screen.getByLabelText('Material')).toHaveValue('')
    expect(screen.getByLabelText('Material tags')).toHaveValue('')

    expect(screen.getByLabelText('New')).not.toBeChecked()
    expect(screen.getByLabelText('Best seller')).not.toBeChecked()

    expect(screen.getByLabelText('Price (NGN)')).toHaveValue(null)
    expect(screen.getByLabelText('Price (USD)')).toHaveValue(null)
    expect(screen.getByLabelText('Sale price (NGN)')).toHaveValue(null)
    expect(screen.getByLabelText('Sale price (USD)')).toHaveValue(null)

    expect(screen.getByLabelText('Inventory')).toHaveValue(null)
    expect(screen.getByLabelText('Weight (g)')).toHaveValue(null)

    expect(screen.getByLabelText('SEO title')).toHaveValue('')
    expect(screen.getByLabelText('SEO description')).toHaveValue('')

    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Rings')
    expect(screen.getByRole('combobox', { name: 'Subcategory' })).toHaveTextContent('None')
    expect(screen.getByLabelText('Spring 2026')).not.toBeChecked()
    expect(screen.getByLabelText('Bridal')).not.toBeChecked()

    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })

  it('blank name blocks submit', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProductCreateForm taxonomy={TAXONOMY} />)

    await user.type(screen.getByLabelText('Price (NGN)'), '45000')
    await user.type(screen.getByLabelText('Price (USD)'), '500')
    await uploadImageWithAlt(user, 'Front view')

    await user.click(screen.getByRole('button', { name: /create product/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i)
    expect(createProductActionMock).not.toHaveBeenCalled()
  })

  it('blank/invalid regular price blocks submit', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProductCreateForm taxonomy={TAXONOMY} />)

    await user.type(screen.getByLabelText('Name'), 'Diamond Ring')
    await uploadImageWithAlt(user, 'Front view')

    await user.click(screen.getByRole('button', { name: /create product/i }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some((alert) => /valid ngn price is required/i.test(alert.textContent ?? ''))).toBe(true)
    expect(alerts.some((alert) => /valid usd price is required/i.test(alert.textContent ?? ''))).toBe(true)
    expect(createProductActionMock).not.toHaveBeenCalled()
  })

  it('no images blocks submit', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProductCreateForm taxonomy={TAXONOMY} />)

    await user.type(screen.getByLabelText('Name'), 'Diamond Ring')
    await user.type(screen.getByLabelText('Price (NGN)'), '45000')
    await user.type(screen.getByLabelText('Price (USD)'), '500')

    await user.click(screen.getByRole('button', { name: /create product/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one image/i)
    expect(createProductActionMock).not.toHaveBeenCalled()
  })

  it('blank image alt text blocks submit', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProductCreateForm taxonomy={TAXONOMY} />)

    await user.type(screen.getByLabelText('Name'), 'Diamond Ring')
    await user.type(screen.getByLabelText('Price (NGN)'), '45000')
    await user.type(screen.getByLabelText('Price (USD)'), '500')

    const file = fakeFile('photo.jpg', 'image/jpeg')
    const input = screen.getByLabelText(/add image/i)
    fireEvent.change(input, { target: { files: [file] } })
    await vi.waitFor(() => {
      expect(screen.getAllByRole('img')).toHaveLength(1)
    })
    // Alt text left blank on purpose.

    await user.click(screen.getByRole('button', { name: /create product/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/every image needs alt text/i)
    expect(createProductActionMock).not.toHaveBeenCalled()
  })

  it('a duplicate variant SKU from the builder blocks submit', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProductCreateForm taxonomy={TAXONOMY} />)

    await fillMinimalValid(user)

    await user.click(screen.getByRole('button', { name: /add option type/i }))
    await user.type(screen.getByLabelText(/option name/i), 'Size')
    await user.type(screen.getByLabelText(/^values$/i), 'Small, Large')
    await user.click(screen.getByRole('button', { name: /generate variants/i }))

    await user.type(screen.getByLabelText('Small SKU'), 'DUPE-SKU')
    await user.type(screen.getByLabelText('Large SKU'), 'DUPE-SKU')

    await user.click(screen.getByRole('button', { name: /create product/i }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some((alert) => /fix duplicate variant skus/i.test(alert.textContent ?? ''))).toBe(true)
    expect(createProductActionMock).not.toHaveBeenCalled()
  })

  // Third-arg timeout (above the file's 20s default): this test fills every
  // field on the form, and this sandbox's node process count/CPU load
  // varies test-run to test-run — even with the fireEvent.change conversion
  // below, a slow tick under load can still push it past 20s.
  it('submit calls createProductAction with a full CreateProductInput payload', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProductCreateForm taxonomy={TAXONOMY} />)

    // This test fills every field on the form, so per-keystroke `user.type`
    // (each character its own act()-wrapped keydown/input/keyup cycle,
    // re-rendering this large form every time) pushed it well past its
    // siblings' runtime under load. One real `user.type` interaction stays
    // (Name) so genuine typing behavior is still covered; every other bulk
    // text field below fires a single `fireEvent.change` instead — same
    // idiom already used for these controlled inputs in
    // `variants-builder.test.tsx`.
    await user.type(screen.getByLabelText('Name'), 'Diamond Ring')
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'diamond-ring' } })
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'MSE-RNG-100' } })
    fireEvent.change(screen.getByLabelText('Short description'), { target: { value: 'A ring.' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A lovely diamond ring.' } })
    fireEvent.change(screen.getByLabelText('Material'), { target: { value: '18k Gold' } })
    fireEvent.change(screen.getByLabelText('Material tags'), { target: { value: 'gold, diamond' } })

    await user.click(screen.getByLabelText('New'))
    await user.click(screen.getByLabelText('Best seller'))

    fireEvent.change(screen.getByLabelText('Price (NGN)'), { target: { value: '45000' } })
    fireEvent.change(screen.getByLabelText('Price (USD)'), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('Sale price (NGN)'), { target: { value: '40000' } })
    fireEvent.change(screen.getByLabelText('Sale price (USD)'), { target: { value: '450' } })

    fireEvent.change(screen.getByLabelText('Inventory'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Weight (g)'), { target: { value: '12' } })

    fireEvent.change(screen.getByLabelText('SEO title'), { target: { value: 'Diamond Ring | MSE Lux' } })
    fireEvent.change(screen.getByLabelText('SEO description'), { target: { value: 'Shop the Diamond Ring.' } })

    await user.click(screen.getByRole('combobox', { name: 'Subcategory' }))
    await user.click(await screen.findByRole('option', { name: 'Engagement' }))
    await user.click(screen.getByLabelText('Spring 2026'))

    await user.click(screen.getByRole('button', { name: /add option type/i }))
    fireEvent.change(screen.getByLabelText(/option name/i), { target: { value: 'Size' } })
    fireEvent.change(screen.getByLabelText(/^values$/i), { target: { value: 'Small' } })
    await user.click(screen.getByRole('button', { name: /generate variants/i }))
    fireEvent.change(screen.getByLabelText('Small SKU'), { target: { value: 'MSE-RNG-100-S' } })
    fireEvent.change(screen.getByLabelText('Small inventory'), { target: { value: '2' } })

    await uploadImageWithAlt(user, 'Front view')
    await uploadImageWithAlt(user, 'Side view')

    await user.click(screen.getByRole('button', { name: /create product/i }))

    const expectedPayload: CreateProductInput = {
      name: 'Diamond Ring',
      slug: 'diamond-ring',
      sku: 'MSE-RNG-100',
      shortDescription: 'A ring.',
      description: 'A lovely diamond ring.',
      material: '18k Gold',
      materialTags: ['gold', 'diamond'],
      badges: ['NEW', 'BEST_SELLER'],
      priceNgnMinor: 4_500_000,
      priceUsdMinor: 50_000,
      salePriceNgnMinor: 4_000_000,
      salePriceUsdMinor: 45_000,
      inventory: 5,
      weightGrams: 12,
      status: 'DRAFT',
      seoTitle: 'Diamond Ring | MSE Lux',
      seoDescription: 'Shop the Diamond Ring.',
      categoryId: 'cat-a',
      subcategoryId: 'sub-a1',
      collectionIds: ['col-1'],
      optionTypes: [{ name: 'Size', values: ['Small'] }],
      newVariants: [
        {
          sku: 'MSE-RNG-100-S',
          inventory: 2,
          priceNgnMinor: null,
          priceUsdMinor: null,
          options: [{ name: 'Size', value: 'Small' }],
        },
      ],
      images: [
        { src: 'https://x.supabase.co/storage/v1/object/public/product-images/1.jpg', alt: 'Front view' },
        { src: 'https://x.supabase.co/storage/v1/object/public/product-images/2.jpg', alt: 'Side view' },
      ],
    }

    await vi.waitFor(
      () => {
        expect(createProductActionMock).toHaveBeenCalledWith(expectedPayload)
      },
      { timeout: 10_000 },
    )
  }, 30_000)

  it('success calls router.push with /admin/catalog/[productId]', async () => {
    createProductActionMock.mockResolvedValue({ ok: true, revalidate: [], productId: 'prod-abc' })
    const user = userEvent.setup({ delay: null })
    render(<ProductCreateForm taxonomy={TAXONOMY} />)

    await fillMinimalValid(user)
    await user.click(screen.getByRole('button', { name: /create product/i }))

    await vi.waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/admin/catalog/prod-abc')
    })
  })

  it('conflict-slug shows a field-level alert on slug', async () => {
    createProductActionMock.mockResolvedValue({ ok: false, error: 'conflict-slug' })
    const user = userEvent.setup({ delay: null })
    render(<ProductCreateForm taxonomy={TAXONOMY} />)

    await fillMinimalValid(user)
    await user.click(screen.getByRole('button', { name: /create product/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/slug/i)
  })

  it('conflict-sku shows a field-level alert on sku', async () => {
    createProductActionMock.mockResolvedValue({ ok: false, error: 'conflict-sku' })
    const user = userEvent.setup({ delay: null })
    render(<ProductCreateForm taxonomy={TAXONOMY} />)

    await fillMinimalValid(user)
    await user.click(screen.getByRole('button', { name: /create product/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/sku/i)
  })

  it('invalid-input with issues renders each issue at its path, overflow paths in the generic list', async () => {
    createProductActionMock.mockResolvedValue({
      ok: false,
      error: 'invalid-input',
      issues: [{ code: 'custom', path: ['description'], message: 'Description looks off.' } as never],
    })
    const user = userEvent.setup({ delay: null })
    render(<ProductCreateForm taxonomy={TAXONOMY} />)

    await fillMinimalValid(user)
    await user.click(screen.getByRole('button', { name: /create product/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('description: Description looks off.')
  })
})
