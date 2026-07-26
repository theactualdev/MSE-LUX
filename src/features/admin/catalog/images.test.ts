import { describe, it, expect, vi, beforeEach } from 'vitest'

const upload = vi.fn()
const getPublicUrl = vi.fn()
const remove = vi.fn()
const from = vi.fn(() => ({ upload, getPublicUrl, remove }))
const createClient = vi.fn(async () => ({ storage: { from } }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: []) => createClient(...args),
}))

const {
  PRODUCT_IMAGES_BUCKET,
  MAX_IMAGE_BYTES,
  uploadProductImage,
  deleteProductImageObject,
} = await import('@/features/admin/catalog/images')

const PRODUCT_ID = 'prod-123'
const KEY_RE = /^products\/prod-123\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/

/** jsdom's File computes `.size` from actual content length — building a
 * real 5MB+1 byte File would work but is wasteful to allocate per test. A
 * defined `size` getter gives the same observable behavior for far less
 * memory. */
function fakeFile(name: string, type: string, size: number): File {
  const file = new File([], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('uploadProductImage', () => {
  it('rejects an unsupported MIME type without creating a client', async () => {
    const file = fakeFile('photo.gif', 'image/gif', 1024)

    const result = await uploadProductImage(PRODUCT_ID, file)

    expect(result).toEqual({ ok: false, error: 'invalid-type' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('rejects a file over MAX_IMAGE_BYTES without creating a client', async () => {
    const file = fakeFile('photo.jpg', 'image/jpeg', MAX_IMAGE_BYTES + 1)

    const result = await uploadProductImage(PRODUCT_ID, file)

    expect(result).toEqual({ ok: false, error: 'too-large' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('accepts a file exactly at MAX_IMAGE_BYTES', async () => {
    const file = fakeFile('photo.jpg', 'image/jpeg', MAX_IMAGE_BYTES)
    upload.mockResolvedValue({ data: { path: 'x' }, error: null })
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://x.supabase.co/storage/v1/object/public/product-images/x' } })

    const result = await uploadProductImage(PRODUCT_ID, file)

    expect(result.ok).toBe(true)
  })

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])('builds a products/<productId>/<uuid>.<ext> key for %s', async (mime, ext) => {
    const file = fakeFile('photo', mime, 1024)
    upload.mockResolvedValue({ data: { path: 'x' }, error: null })
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://proj.supabase.co/storage/v1/object/public/product-images/x' } })

    await uploadProductImage(PRODUCT_ID, file)

    expect(upload).toHaveBeenCalledTimes(1)
    const [key] = upload.mock.calls[0]
    expect(key).toMatch(KEY_RE)
    expect(key.endsWith(`.${ext}`)).toBe(true)
  })

  it('uploads via storage.from(PRODUCT_IMAGES_BUCKET).upload with contentType and cacheControl', async () => {
    const file = fakeFile('photo.png', 'image/png', 2048)
    upload.mockResolvedValue({ data: { path: 'x' }, error: null })
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://proj.supabase.co/storage/v1/object/public/product-images/x' } })

    await uploadProductImage(PRODUCT_ID, file)

    expect(from).toHaveBeenCalledWith(PRODUCT_IMAGES_BUCKET)
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(KEY_RE),
      file,
      { contentType: 'image/png', cacheControl: '3600' },
    )
  })

  it('returns storage-error (without throwing) when upload fails', async () => {
    const file = fakeFile('photo.png', 'image/png', 2048)
    upload.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const result = await uploadProductImage(PRODUCT_ID, file)

    expect(result).toEqual({ ok: false, error: 'storage-error' })
    expect(getPublicUrl).not.toHaveBeenCalled()
  })

  it('returns storage-error when upload throws', async () => {
    const file = fakeFile('photo.png', 'image/png', 2048)
    upload.mockRejectedValue(new Error('network down'))

    await expect(uploadProductImage(PRODUCT_ID, file)).resolves.toEqual({ ok: false, error: 'storage-error' })
  })

  it('returns ok:true with the public URL on success', async () => {
    const file = fakeFile('photo.webp', 'image/webp', 2048)
    upload.mockResolvedValue({ data: { path: 'products/prod-123/abc.webp' }, error: null })
    getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://proj.supabase.co/storage/v1/object/public/product-images/products/prod-123/abc.webp' },
    })

    const result = await uploadProductImage(PRODUCT_ID, file)

    expect(result).toEqual({
      ok: true,
      src: 'https://proj.supabase.co/storage/v1/object/public/product-images/products/prod-123/abc.webp',
    })
  })
})

describe('deleteProductImageObject', () => {
  it('extracts the object key and calls remove([key])', async () => {
    remove.mockResolvedValue({ data: [{ name: 'x' }], error: null })

    const result = await deleteProductImageObject(
      'https://proj.supabase.co/storage/v1/object/public/product-images/products/prod-123/abc.webp',
    )

    expect(result).toBe(true)
    expect(from).toHaveBeenCalledWith(PRODUCT_IMAGES_BUCKET)
    expect(remove).toHaveBeenCalledWith(['products/prod-123/abc.webp'])
  })

  it('works regardless of origin, as long as the path matches', async () => {
    remove.mockResolvedValue({ data: [{ name: 'x' }], error: null })

    const result = await deleteProductImageObject(
      'https://some-other-host.example/storage/v1/object/public/product-images/products/prod-123/abc.webp',
    )

    expect(result).toBe(true)
    expect(remove).toHaveBeenCalledWith(['products/prod-123/abc.webp'])
  })

  it('returns false and logs without calling storage when the URL is unparseable', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await deleteProductImageObject('https://proj.supabase.co/not-a-storage-url')

    expect(result).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('returns false and logs when .remove() reports an error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    remove.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const result = await deleteProductImageObject(
      'https://proj.supabase.co/storage/v1/object/public/product-images/products/prod-123/abc.webp',
    )

    expect(result).toBe(false)
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('returns false and logs when .remove() throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    remove.mockRejectedValue(new Error('network down'))

    const result = await deleteProductImageObject(
      'https://proj.supabase.co/storage/v1/object/public/product-images/products/prod-123/abc.webp',
    )

    expect(result).toBe(false)
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })
})
