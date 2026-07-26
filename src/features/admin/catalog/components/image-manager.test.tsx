import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageManager } from '@/features/admin/catalog/components/image-manager'
import { uploadProductImageAction, updateProductImagesAction } from '@/features/admin/catalog/actions'

vi.mock('@/features/admin/catalog/actions', () => ({
  uploadProductImageAction: vi.fn(),
  updateProductImagesAction: vi.fn(),
}))

const refreshMock = vi.fn()
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    useRouter: () => ({ refresh: refreshMock, replace: vi.fn(), push: vi.fn() }),
  }
})

const uploadProductImageActionMock = vi.mocked(uploadProductImageAction)
const updateProductImagesActionMock = vi.mocked(updateProductImagesAction)

const PRODUCT_ID = 'prod-123'

const TWO_IMAGES = [
  { src: 'https://x.supabase.co/storage/v1/object/public/product-images/a.jpg', alt: 'Alt A' },
  { src: 'https://x.supabase.co/storage/v1/object/public/product-images/b.jpg', alt: 'Alt B' },
]

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Mirrors the size-getter trick in `images.test.ts` — a real 5MB+ File is
 * wasteful to allocate per test; a defined `size` getter is observably the
 * same for far less memory. */
function fakeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function getRows() {
  return screen.getAllByRole('img').map((img) => img.closest('div.rounded-xl')) as HTMLDivElement[]
}

beforeEach(() => {
  vi.clearAllMocks()
  uploadProductImageActionMock.mockResolvedValue({ ok: true, src: 'https://x.supabase.co/storage/v1/object/public/product-images/new.jpg' })
  updateProductImagesActionMock.mockResolvedValue({ ok: true, revalidate: [] })
})

describe('ImageManager', () => {
  it('renders current images ordered with thumbnails, alt inputs, and boundary-disabled move buttons', () => {
    render(<ImageManager productId={PRODUCT_ID} initialImages={TWO_IMAGES} mode="edit" />)

    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(2)
    expect(images[0]).toHaveAttribute('src', TWO_IMAGES[0].src)
    expect(images[1]).toHaveAttribute('src', TWO_IMAGES[1].src)

    expect(screen.getByLabelText(/alt text for image 1/i)).toHaveValue('Alt A')
    expect(screen.getByLabelText(/alt text for image 2/i)).toHaveValue('Alt B')

    const rows = getRows()
    expect(within(rows[0]).getByRole('button', { name: /move up/i })).toBeDisabled()
    expect(within(rows[0]).getByRole('button', { name: /move down/i })).toBeEnabled()
    expect(within(rows[1]).getByRole('button', { name: /move up/i })).toBeEnabled()
    expect(within(rows[1]).getByRole('button', { name: /move down/i })).toBeDisabled()
  })

  it('remove is disabled once only one image remains', () => {
    render(<ImageManager productId={PRODUCT_ID} initialImages={[TWO_IMAGES[0]]} mode="edit" />)

    expect(screen.getByRole('button', { name: /remove image/i })).toBeDisabled()
  })

  it('edit mode: moving an image down reorders the list', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ImageManager productId={PRODUCT_ID} initialImages={TWO_IMAGES} mode="edit" />)

    const rows = getRows()
    await user.click(within(rows[0]).getByRole('button', { name: /move down/i }))

    expect(screen.getByLabelText(/alt text for image 1/i)).toHaveValue('Alt B')
    expect(screen.getByLabelText(/alt text for image 2/i)).toHaveValue('Alt A')
  })

  it('edit mode: removing an image drops it from the list', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ImageManager productId={PRODUCT_ID} initialImages={TWO_IMAGES} mode="edit" />)

    const rows = getRows()
    await user.click(within(rows[0]).getByRole('button', { name: /remove image/i }))

    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByLabelText(/alt text for image 1/i)).toHaveValue('Alt B')
  })

  it('edit mode: editing alt text updates the field', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ImageManager productId={PRODUCT_ID} initialImages={TWO_IMAGES} mode="edit" />)

    const input = screen.getByLabelText(/alt text for image 1/i)
    await user.clear(input)
    await user.type(input, 'New alt')

    expect(input).toHaveValue('New alt')
  })

  it('staged mode: renders no Save button', () => {
    render(<ImageManager productId="staging-uuid" initialImages={TWO_IMAGES} mode="staged" />)

    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })

  it('staged mode: reorder, remove, and alt edits each call onImagesChange', async () => {
    const user = userEvent.setup({ delay: null })
    const onImagesChange = vi.fn()
    render(<ImageManager productId="staging-uuid" initialImages={TWO_IMAGES} mode="staged" onImagesChange={onImagesChange} />)

    const rows = getRows()
    await user.click(within(rows[0]).getByRole('button', { name: /move down/i }))
    expect(onImagesChange).toHaveBeenLastCalledWith([TWO_IMAGES[1], TWO_IMAGES[0]])

    onImagesChange.mockClear()
    const altInput = screen.getByLabelText(/alt text for image 1/i)
    await user.type(altInput, '!')
    expect(onImagesChange).toHaveBeenCalled()

    onImagesChange.mockClear()
    const rowsAfter = getRows()
    await user.click(within(rowsAfter[1]).getByRole('button', { name: /remove image/i }))
    expect(onImagesChange).toHaveBeenLastCalledWith([expect.objectContaining({ src: TWO_IMAGES[1].src })])
  })

  it('file input: wrong type is rejected inline without calling the upload action', () => {
    render(<ImageManager productId={PRODUCT_ID} initialImages={TWO_IMAGES} mode="edit" />)

    const file = fakeFile('photo.gif', 'image/gif', 1024)
    const input = screen.getByLabelText(/add image/i)
    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.getByRole('alert')).toHaveTextContent(/jpeg|png|webp/i)
    expect(uploadProductImageActionMock).not.toHaveBeenCalled()
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('file input: oversize file is rejected inline without calling the upload action', () => {
    render(<ImageManager productId={PRODUCT_ID} initialImages={TWO_IMAGES} mode="edit" />)

    const file = fakeFile('photo.jpg', 'image/jpeg', MAX_IMAGE_BYTES + 1)
    const input = screen.getByLabelText(/add image/i)
    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.getByRole('alert')).toHaveTextContent(/5mb/i)
    expect(uploadProductImageActionMock).not.toHaveBeenCalled()
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('file input: an accepted file calls uploadProductImageAction and appends with empty alt', async () => {
    uploadProductImageActionMock.mockResolvedValue({
      ok: true,
      src: 'https://x.supabase.co/storage/v1/object/public/product-images/new.jpg',
    })
    render(<ImageManager productId={PRODUCT_ID} initialImages={TWO_IMAGES} mode="edit" />)

    const file = fakeFile('photo.jpg', 'image/jpeg', 1024)
    const input = screen.getByLabelText(/add image/i)
    fireEvent.change(input, { target: { files: [file] } })

    await vi.waitFor(() => {
      expect(uploadProductImageActionMock).toHaveBeenCalledTimes(1)
    })
    const [calledProductId, formData] = uploadProductImageActionMock.mock.calls[0]
    expect(calledProductId).toBe(PRODUCT_ID)
    expect((formData as FormData).get('file')).toBe(file)

    await vi.waitFor(() => {
      expect(screen.getAllByRole('img')).toHaveLength(3)
    })
    expect(screen.getByLabelText(/alt text for image 3/i)).toHaveValue('')
  })

  it('staged mode: a successful upload calls onImagesChange with the appended image', async () => {
    uploadProductImageActionMock.mockResolvedValue({
      ok: true,
      src: 'https://x.supabase.co/storage/v1/object/public/product-images/new.jpg',
    })
    const onImagesChange = vi.fn()
    render(<ImageManager productId="staging-uuid" initialImages={TWO_IMAGES} mode="staged" onImagesChange={onImagesChange} />)

    const file = fakeFile('photo.png', 'image/png', 1024)
    const input = screen.getByLabelText(/add image/i)
    fireEvent.change(input, { target: { files: [file] } })

    await vi.waitFor(() => {
      expect(onImagesChange).toHaveBeenCalledWith([
        ...TWO_IMAGES,
        { src: 'https://x.supabase.co/storage/v1/object/public/product-images/new.jpg', alt: '' },
      ])
    })
  })

  it.each(['too-large', 'invalid-type', 'storage-error'] as const)(
    'upload error %s shows an inline alert and leaves the list unchanged',
    async (error) => {
      uploadProductImageActionMock.mockResolvedValue({ ok: false, error })
      render(<ImageManager productId={PRODUCT_ID} initialImages={TWO_IMAGES} mode="edit" />)

      const file = fakeFile('photo.jpg', 'image/jpeg', 1024)
      const input = screen.getByLabelText(/add image/i)
      fireEvent.change(input, { target: { files: [file] } })

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(screen.getAllByRole('img')).toHaveLength(2)
    },
  )

  it('edit mode: Save calls updateProductImagesAction and refreshes on success', async () => {
    const user = userEvent.setup({ delay: null })
    render(<ImageManager productId={PRODUCT_ID} initialImages={TWO_IMAGES} mode="edit" />)

    await user.click(screen.getByRole('button', { name: /save images/i }))

    await vi.waitFor(() => {
      expect(updateProductImagesActionMock).toHaveBeenCalledWith(PRODUCT_ID, { images: TWO_IMAGES })
    })
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })
    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
  })

  it('edit mode: Save is blocked with an inline message while any alt is blank', async () => {
    const user = userEvent.setup({ delay: null })
    const images = [TWO_IMAGES[0], { src: TWO_IMAGES[1].src, alt: '' }]
    render(<ImageManager productId={PRODUCT_ID} initialImages={images} mode="edit" />)

    await user.click(screen.getByRole('button', { name: /save images/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(updateProductImagesActionMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('edit mode: a server failure on save shows role=alert and does not refresh', async () => {
    updateProductImagesActionMock.mockResolvedValue({ ok: false, error: 'error' })
    const user = userEvent.setup({ delay: null })
    render(<ImageManager productId={PRODUCT_ID} initialImages={TWO_IMAGES} mode="edit" />)

    await user.click(screen.getByRole('button', { name: /save images/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
