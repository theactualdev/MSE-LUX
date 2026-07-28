import 'server-only'

import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'

/**
 * The Supabase Storage engine for product images: validated upload
 * (`uploadProductImage`), best-effort orphan cleanup
 * (`deleteProductImageObject`), and a best-effort periodic sweep for
 * orphaned STAGED uploads (`sweepStagedUploads`). Server-only and UNGATED on
 * purpose — the caller (a later task's Server Action, or the secret-gated
 * cron route for the sweep) re-checks ADMIN/the cron secret itself, the same
 * trust model as the rest of `admin/catalog` (server actions are public
 * HTTP endpoints; the `(admin)` layout gate covers rendering only). Unlike
 * the Prisma-backed siblings in this directory, storage calls run through
 * `createClient()` AS the signed-in admin, so the bucket's RLS policies are
 * a second, independent enforcement layer at the storage tier — not the
 * only one.
 *
 * Type/size are validated before any Supabase client is created, so a
 * rejected file never spends a round trip. None of the exported functions
 * throw: upload failures collapse to `'storage-error'`, delete failures
 * collapse to `false` (logged) for the caller to treat as an orphaned object
 * rather than a hard failure, and the sweep collapses any Storage/db error to
 * `0` removed (logged).
 */

export const PRODUCT_IMAGES_BUCKET = 'product-images'
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export type ImageUploadResult =
  | { ok: true; src: string }
  | { ok: false; error: 'invalid-type' | 'too-large' | 'storage-error' }

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function uploadProductImage(productId: string, file: File): Promise<ImageUploadResult> {
  const ext = MIME_TO_EXT[file.type]
  if (!ext) {
    return { ok: false, error: 'invalid-type' }
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'too-large' }
  }

  const key = `products/${productId}/${randomUUID()}.${ext}`

  try {
    const supabase = await createClient()
    const bucket = supabase.storage.from(PRODUCT_IMAGES_BUCKET)

    const { error } = await bucket.upload(key, file, {
      contentType: file.type,
      cacheControl: '3600',
    })
    if (error) {
      console.error('uploadProductImage: storage upload failed', error)
      return { ok: false, error: 'storage-error' }
    }

    const { data } = bucket.getPublicUrl(key)
    return { ok: true, src: data.publicUrl }
  } catch (err) {
    console.error('uploadProductImage: unexpected error', err)
    return { ok: false, error: 'storage-error' }
  }
}

const PUBLIC_OBJECT_PATH_RE = /\/storage\/v1\/object\/public\/product-images\/(.+)$/

/**
 * Parses a public Storage URL back to its bucket-relative object key (e.g.
 * `products/<folder>/<file>.jpg`), or `null` if the URL doesn't match this
 * bucket's public-URL shape at all. Shared by `deleteProductImageObject`
 * (single-object best-effort delete) and `sweepStagedUploads` (bulk
 * reference-set build) — the one place this URL->key parse is written.
 */
function parsePublicObjectKey(src: string): string | null {
  const match = PUBLIC_OBJECT_PATH_RE.exec(src)
  return match ? match[1] : null
}

/**
 * Best-effort: parses a public URL back to its object key and removes it.
 * Never throws; false = logged orphan (the caller does not fail its own
 * operation over a cleanup miss — a stray object is a minor cost, not a
 * correctness bug).
 */
export async function deleteProductImageObject(src: string): Promise<boolean> {
  const key = parsePublicObjectKey(src)
  if (!key) {
    console.error('deleteProductImageObject: unparseable URL', src)
    return false
  }

  try {
    const supabase = await createClient()
    const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([key])
    if (error) {
      console.error('deleteProductImageObject: storage remove failed', error)
      return false
    }
    return true
  } catch (err) {
    console.error('deleteProductImageObject: unexpected error', err)
    return false
  }
}

/** Orphaned staging uploads older than this are swept. Matches the plan's "e.g. 7 days" window for the create-product staging flow (8c-2) — long enough that an in-progress form (even across a browser restart) is never swept out from under someone actively filling it in. */
export const STAGED_UPLOAD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A folder under `products/` is only a sweep CANDIDATE at all if its name has
 * this shape — `Product.id` is a Prisma **cuid** (`@default(cuid())` in
 * schema.prisma — e.g. `clx0abc123def456ghi789jkl`), while staging folders
 * are named with `crypto.randomUUID()` client-side (see `stagingId` in
 * `product-create-form.tsx`), so a cuid-named folder can never even reach the
 * per-object checks below. This is NOT the sweep's safety property, though —
 * see `sweepStagedUploads`'s doc comment for why the shape alone can never be
 * enough: a UUID-shaped staging folder is exactly where a LIVE product's
 * images live too (the create-product flow uploads under
 * `products/<stagingId>/…` before the product row exists, and that URL is
 * persisted into `ProductImage.src` verbatim — there is no move/re-key step
 * anywhere). The real safety property is per-OBJECT: an object is only ever
 * removed if its full key is absent from the set of every `ProductImage.src`
 * in the database.
 */
const STAGING_FOLDER_NAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Page size for both levels of `bucket.list()` pagination below. */
const LIST_PAGE_SIZE = 1000

type ListedEntry = { name: string; created_at?: string | null }
type SupabaseStorage = Awaited<ReturnType<typeof createClient>>['storage']
type ProductImagesBucket = ReturnType<SupabaseStorage['from']>

/**
 * Lists every entry under `path`, paginating with `offset` until a
 * short (< `LIST_PAGE_SIZE`) page comes back — `bucket.list()` caps a single
 * call at `limit`, so a folder (or the top-level `products/` listing itself)
 * holding more entries than that would otherwise be silently half-swept
 * (and, for the top-level call, half-*protected*, since the caller wouldn't
 * even see every folder). Returns `null` (already logged) on a Storage
 * error at any page.
 */
async function listAllEntries(bucket: ProductImagesBucket, path: string): Promise<ListedEntry[] | null> {
  const all: ListedEntry[] = []
  let offset = 0

  for (;;) {
    const { data, error } = await bucket.list(path, { limit: LIST_PAGE_SIZE, offset })
    if (error) {
      console.error(`sweepStagedUploads: failed to list ${path}`, error)
      return null
    }
    if (!data || data.length === 0) break

    all.push(...data)
    if (data.length < LIST_PAGE_SIZE) break
    offset += LIST_PAGE_SIZE
  }

  return all
}

/**
 * `uploadProductImage` writes new-product images to `products/<staging-uuid>/…`
 * BEFORE the product row exists (8c-2's create-product flow needs somewhere
 * to put the file while the form is still open). There is NO move/re-key
 * step once the product is created — `createProduct` (`create.ts`) persists
 * that staging URL straight into `ProductImage.src` — so a live product's
 * images can permanently live under a UUID-shaped folder that is not, and
 * will never become, any `Product.id`. An earlier version of this function
 * treated "UUID-shaped folder that isn't a live `Product.id`" as sufficient
 * to sweep, which is exactly backwards: EVERY create-flow product's folder
 * matches that description forever. The regex/id check can therefore only
 * ever be a spare, never the safety property.
 *
 * The actual safety property is per-OBJECT, not per-folder: an object is
 * swept only if its full key (`products/<folder>/<object>`) does NOT appear
 * as the parsed object key of any `ProductImage.src` row, AND it is older
 * than `STAGED_UPLOAD_MAX_AGE_MS`. This has to be object-level rather than
 * folder-level because a folder can legitimately hold BOTH kinds of object at
 * once: after creation, the edit form uploads further images for the same
 * product under `products/<cuid>/…`, but the original staging folder
 * (`products/<stagingId>/…`) keeps holding that product's original,
 * still-referenced images alongside — over time — any abandoned extras a
 * user uploaded and then never included in the final `images` array.
 *
 * `Product.id` folders are kept as an additional spare on top of the
 * object-key check: a folder whose name IS a live product's id is never even
 * listed, regardless of age or of what the `ProductImage` table returns.
 * This never subtracts safety (a cuid folder was already excluded by
 * `STAGING_FOLDER_NAME_RE`; a UUID-shaped live-product-id folder is
 * additionally spared here) — it can only ever skip work that the
 * object-key check would have arrived at anyway.
 *
 * Best-effort throughout, matching every other function in this module: a
 * Storage or db failure at any point is logged and the function returns `0`
 * rather than throwing — a missed sweep is a minor, self-correcting cost (it
 * just runs again tomorrow), not a reason to fail the cron route's own
 * result.
 *
 * ** PRODUCTION NOTE (no code fix here — an operational precondition): this
 * sweep is currently INERT in production. `createClient()` builds the
 * cookie-bound anon Supabase client; a Vercel Cron request carries no
 * session, so every `bucket.list()` call runs as an anonymous request against
 * Storage RLS. Unless the `product-images` bucket has a `select` policy that
 * permits anonymous listing, `list()` resolves an empty page and the sweep
 * silently no-ops (`0`, no error) forever. Before anyone gives the cron route
 * a privileged client (e.g. a service-role key) to make this sweep actually
 * run, THIS fix must already be in place — running the old folder-shape sweep
 * with real listing permissions would have started deleting live product
 * images from the day it went live. **
 */
export async function sweepStagedUploads(): Promise<number> {
  try {
    const supabase = await createClient()
    const bucket = supabase.storage.from(PRODUCT_IMAGES_BUCKET)

    const topLevel = await listAllEntries(bucket, 'products')
    if (topLevel === null) return 0 // error already logged by listAllEntries
    if (topLevel.length === 0) return 0

    // Structural filter FIRST: a cuid-named product folder is never even a
    // candidate — see STAGING_FOLDER_NAME_RE's doc comment for why this
    // alone is not the safety property.
    const uuidCandidates = topLevel.filter((entry) => STAGING_FOLDER_NAME_RE.test(entry.name))
    if (uuidCandidates.length === 0) return 0

    const images = await db.productImage.findMany({ select: { src: true } })

    // Defence in depth: UUID-shaped candidate folders exist under products/,
    // but `productImage.findMany()` resolved zero rows. That combination is
    // far more likely a transient/query fault (replica lag, a mid-migration
    // window, a future refactor of this query) than a genuinely image-less
    // catalog that somehow already has staging folders — refuse to sweep
    // rather than risk treating every live product's images as orphans.
    if (images.length === 0) {
      console.error(
        `sweepStagedUploads: db.productImage.findMany() returned 0 rows while ${uuidCandidates.length} UUID-shaped folder(s) exist under products/ — refusing to sweep`,
      )
      return 0
    }

    // The actual safety property: every object key any ProductImage row
    // currently points at. An object matching a key in this set is
    // referenced — live — no matter which folder (staging-UUID or
    // product-cuid) it happens to sit in.
    const referencedKeys = new Set<string>()
    for (const image of images) {
      const key = parsePublicObjectKey(image.src)
      if (key) referencedKeys.add(key)
    }

    // Spare only, on top of the object-key check above (see doc comment):
    // a folder named for a live product id is skipped outright, without
    // even listing its contents.
    const products = await db.product.findMany({ select: { id: true } })
    const productIds = new Set(products.map((p) => p.id))

    const cutoff = Date.now() - STAGED_UPLOAD_MAX_AGE_MS
    let removed = 0

    for (const folder of uuidCandidates) {
      if (productIds.has(folder.name)) continue

      const objects = await listAllEntries(bucket, `products/${folder.name}`)
      if (objects === null) continue // error already logged by listAllEntries
      if (objects.length === 0) continue

      const staleKeys = objects
        .filter((object) => {
          const key = `products/${folder.name}/${object.name}`
          if (referencedKeys.has(key)) return false // a live ProductImage row points here — never sweep
          return !!object.created_at && new Date(object.created_at).getTime() < cutoff
        })
        .map((object) => `products/${folder.name}/${object.name}`)

      if (staleKeys.length === 0) continue

      const { error: removeError } = await bucket.remove(staleKeys)
      if (removeError) {
        console.error(`sweepStagedUploads: failed to remove stale objects under products/${folder.name}`, removeError)
        continue
      }

      removed += staleKeys.length
    }

    return removed
  } catch (err) {
    console.error('sweepStagedUploads: unexpected error', err)
    return 0
  }
}
