import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const upload = vi.fn()
const getPublicUrl = vi.fn()
const remove = vi.fn()
const list = vi.fn()
const from = vi.fn(() => ({ upload, getPublicUrl, remove, list }))
const createClient = vi.fn(async () => ({ storage: { from } }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: []) => createClient(...args),
}))

const findMany = vi.fn()
vi.mock('@/lib/db', () => ({ db: { get product() { return { findMany } } } }))

const {
  PRODUCT_IMAGES_BUCKET,
  MAX_IMAGE_BYTES,
  STAGED_UPLOAD_MAX_AGE_MS,
  uploadProductImage,
  deleteProductImageObject,
  sweepStagedUploads,
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

describe('sweepStagedUploads', () => {
  const NOW = new Date('2026-07-28T12:00:00.000Z')
  const STALE_CREATED_AT = new Date(NOW.getTime() - STAGED_UPLOAD_MAX_AGE_MS - 60_000).toISOString() // 1 minute past the 7-day cutoff
  const FRESH_CREATED_AT = new Date(NOW.getTime() - 60_000).toISOString() // 1 minute old

  // Real staging folders are named with crypto.randomUUID() — these fixtures
  // are UUID-shaped on purpose, since sweepStagedUploads now filters to that
  // shape before ever comparing against the database.
  const STAGING_FRESH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const STAGING_STALE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const STAGING_MIXED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const STAGING_BROKEN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const STAGING_OTHER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  // Real product ids are cuids (Product.id @default(cuid())), never
  // UUID-shaped — used to exercise the "not a candidate at all" path.
  const PRODUCT_CUID = 'clx0abc123def456ghi789jkl'
  // A UUID-shaped folder that happens to BE a live product's id (edge case
  // covered by the DB check, defence in depth on top of the shape filter).
  const PRODUCT_UUID_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('a fresh staging folder (not a real product, but not old enough yet) is left untouched', async () => {
    list.mockImplementation(async (path: string) => {
      if (path === 'products') return { data: [{ name: STAGING_FRESH }], error: null }
      if (path === `products/${STAGING_FRESH}`) {
        return { data: [{ name: 'a.jpg', created_at: FRESH_CREATED_AT }], error: null }
      }
      throw new Error(`unexpected list path ${path}`)
    })
    findMany.mockResolvedValue([{ id: PRODUCT_CUID }])

    const result = await sweepStagedUploads()

    expect(result).toBe(0)
    expect(remove).not.toHaveBeenCalled()
  })

  it("a real product's folder is untouched regardless of age — never even listed", async () => {
    list.mockImplementation(async (path: string) => {
      if (path === 'products') return { data: [{ name: PRODUCT_CUID }], error: null }
      throw new Error(`unexpected list path ${path}`)
    })
    findMany.mockResolvedValue([{ id: PRODUCT_CUID }])

    const result = await sweepStagedUploads()

    expect(result).toBe(0)
    // The folder isn't even UUID-shaped, so it's filtered out before the DB
    // is ever consulted — only the top-level listing happened.
    expect(list).toHaveBeenCalledTimes(1)
    expect(findMany).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('a UUID-shaped folder that IS a live product id is spared (defence in depth on top of the shape filter)', async () => {
    list.mockImplementation(async (path: string) => {
      if (path === 'products') return { data: [{ name: PRODUCT_UUID_ID }], error: null }
      throw new Error(`unexpected list path ${path}`)
    })
    findMany.mockResolvedValue([{ id: PRODUCT_UUID_ID }])

    const result = await sweepStagedUploads()

    expect(result).toBe(0)
    // It's UUID-shaped so it IS a candidate and the DB is consulted, but
    // since it matches a live product id its contents are never listed.
    expect(list).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalled()
  })

  it('a stale orphaned staging folder has its old objects removed and counted', async () => {
    list.mockImplementation(async (path: string) => {
      if (path === 'products') return { data: [{ name: STAGING_STALE }], error: null }
      if (path === `products/${STAGING_STALE}`) {
        return {
          data: [
            { name: 'a.jpg', created_at: STALE_CREATED_AT },
            { name: 'b.jpg', created_at: STALE_CREATED_AT },
          ],
          error: null,
        }
      }
      throw new Error(`unexpected list path ${path}`)
    })
    findMany.mockResolvedValue([{ id: PRODUCT_CUID }])
    remove.mockResolvedValue({ data: [{ name: 'a.jpg' }, { name: 'b.jpg' }], error: null })

    const result = await sweepStagedUploads()

    expect(result).toBe(2)
    expect(remove).toHaveBeenCalledWith([`products/${STAGING_STALE}/a.jpg`, `products/${STAGING_STALE}/b.jpg`])
  })

  it('within one orphaned folder, only objects older than the cutoff are removed — a fresh one alongside a stale one is kept', async () => {
    list.mockImplementation(async (path: string) => {
      if (path === 'products') return { data: [{ name: STAGING_MIXED }], error: null }
      if (path === `products/${STAGING_MIXED}`) {
        return {
          data: [
            { name: 'old.jpg', created_at: STALE_CREATED_AT },
            { name: 'new.jpg', created_at: FRESH_CREATED_AT },
          ],
          error: null,
        }
      }
      throw new Error(`unexpected list path ${path}`)
    })
    findMany.mockResolvedValue([{ id: PRODUCT_CUID }])
    remove.mockResolvedValue({ data: [{ name: 'old.jpg' }], error: null })

    const result = await sweepStagedUploads()

    expect(result).toBe(1)
    expect(remove).toHaveBeenCalledWith([`products/${STAGING_MIXED}/old.jpg`])
  })

  it('top-level Storage list failure: returns 0 and logs, never touching db', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    list.mockResolvedValue({ data: null, error: { message: 'bucket unreachable' } })

    const result = await sweepStagedUploads()

    expect(result).toBe(0)
    expect(errorSpy).toHaveBeenCalled()
    expect(findMany).not.toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('top-level Storage list throws: returns 0 and logs', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    list.mockRejectedValue(new Error('network down'))

    const result = await sweepStagedUploads()

    expect(result).toBe(0)
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('db lookup throws: returns 0 and logs', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    list.mockResolvedValue({ data: [{ name: STAGING_OTHER }], error: null })
    findMany.mockRejectedValue(new Error('db down'))

    const result = await sweepStagedUploads()

    expect(result).toBe(0)
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('CRITICAL: a cuid-named product folder is never swept even when findMany() resolves empty', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    list.mockImplementation(async (path: string) => {
      if (path === 'products') return { data: [{ name: PRODUCT_CUID }], error: null }
      throw new Error(`unexpected list path ${path}`)
    })
    // The catastrophic scenario: the query resolves empty (replica lag,
    // mid-migration window, a future refactor) rather than throwing.
    findMany.mockResolvedValue([])

    const result = await sweepStagedUploads()

    expect(result).toBe(0)
    // The cuid-named folder is filtered out by shape before the DB is ever
    // consulted, so this anomalous empty result is never even reached.
    expect(findMany).not.toHaveBeenCalled()
    expect(list).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('CRITICAL: findMany() resolving empty while UUID-shaped candidates exist bails out loudly instead of sweeping', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    list.mockImplementation(async (path: string) => {
      if (path === 'products') return { data: [{ name: STAGING_STALE }], error: null }
      throw new Error(`unexpected list path ${path}`)
    })
    findMany.mockResolvedValue([])

    const result = await sweepStagedUploads()

    expect(result).toBe(0)
    expect(errorSpy).toHaveBeenCalled()
    // Must bail out before ever listing the folder's contents or removing
    // anything — this is the defence-in-depth guard against a transient or
    // faulty query being mistaken for "the catalog is empty".
    expect(list).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('a per-folder listing failure is skipped (logged) without aborting the rest of the sweep', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    list.mockImplementation(async (path: string) => {
      if (path === 'products') {
        return { data: [{ name: STAGING_BROKEN }, { name: STAGING_STALE }], error: null }
      }
      if (path === `products/${STAGING_BROKEN}`) return { data: null, error: { message: 'boom' } }
      if (path === `products/${STAGING_STALE}`) {
        return { data: [{ name: 'a.jpg', created_at: STALE_CREATED_AT }], error: null }
      }
      throw new Error(`unexpected list path ${path}`)
    })
    findMany.mockResolvedValue([{ id: PRODUCT_CUID }])
    remove.mockResolvedValue({ data: [{ name: 'a.jpg' }], error: null })

    const result = await sweepStagedUploads()

    expect(result).toBe(1)
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('a remove() failure for one folder is logged and does not throw, and does not count toward the total', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    list.mockImplementation(async (path: string) => {
      if (path === 'products') return { data: [{ name: STAGING_STALE }], error: null }
      if (path === `products/${STAGING_STALE}`) {
        return { data: [{ name: 'a.jpg', created_at: STALE_CREATED_AT }], error: null }
      }
      throw new Error(`unexpected list path ${path}`)
    })
    findMany.mockResolvedValue([{ id: PRODUCT_CUID }])
    remove.mockResolvedValue({ data: null, error: { message: 'remove failed' } })

    const result = await sweepStagedUploads()

    expect(result).toBe(0)
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('no folders at all under products/: returns 0 without calling db', async () => {
    list.mockResolvedValue({ data: [], error: null })

    const result = await sweepStagedUploads()

    expect(result).toBe(0)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('never throws on an unexpected top-level error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    createClient.mockRejectedValueOnce(new Error('supabase client init failed'))

    await expect(sweepStagedUploads()).resolves.toBe(0)
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })
})
