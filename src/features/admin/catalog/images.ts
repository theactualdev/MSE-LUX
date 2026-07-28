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
 * Best-effort: parses a public URL back to its object key and removes it.
 * Never throws; false = logged orphan (the caller does not fail its own
 * operation over a cleanup miss — a stray object is a minor cost, not a
 * correctness bug).
 */
export async function deleteProductImageObject(src: string): Promise<boolean> {
  const match = PUBLIC_OBJECT_PATH_RE.exec(src)
  if (!match) {
    console.error('deleteProductImageObject: unparseable URL', src)
    return false
  }
  const key = match[1]

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
 * `uploadProductImage` writes new-product images to `products/<staging-uuid>/…`
 * BEFORE the product row exists (8c-2's create-product flow needs somewhere
 * to put the file while the form is still open) and re-keys them under the
 * real `products/<productId>/…` once the product is actually created. A
 * form that's abandoned mid-fill leaves its staging folder behind forever —
 * this is the periodic cron sweep for that: list every folder segment under
 * `products/`, keep only the ones that are NOT an existing `Product.id` (a
 * real product's own folder is never touched, no matter its age), and among
 * those remove any object older than `STAGED_UPLOAD_MAX_AGE_MS`.
 *
 * Best-effort throughout, matching every other function in this module: a
 * Storage or db failure at any point is logged and the function returns `0`
 * rather than throwing — a missed sweep is a minor, self-correcting cost
 * (it just runs again tomorrow), not a reason to fail the cron route's own
 * result.
 */
export async function sweepStagedUploads(): Promise<number> {
  try {
    const supabase = await createClient()
    const bucket = supabase.storage.from(PRODUCT_IMAGES_BUCKET)

    const { data: topLevel, error: listError } = await bucket.list('products', { limit: 1000 })
    if (listError) {
      console.error('sweepStagedUploads: failed to list products/', listError)
      return 0
    }
    if (!topLevel || topLevel.length === 0) return 0

    const products = await db.product.findMany({ select: { id: true } })
    const productIds = new Set(products.map((p) => p.id))

    // A real product's folder — matched by id — is never inspected any
    // further, regardless of age; only segments that AREN'T a live product
    // id are staging candidates.
    const staleFolders = topLevel.filter((entry) => !productIds.has(entry.name))
    if (staleFolders.length === 0) return 0

    const cutoff = Date.now() - STAGED_UPLOAD_MAX_AGE_MS
    let removed = 0

    for (const folder of staleFolders) {
      const { data: objects, error: folderError } = await bucket.list(`products/${folder.name}`, { limit: 1000 })
      if (folderError) {
        console.error(`sweepStagedUploads: failed to list products/${folder.name}`, folderError)
        continue
      }
      if (!objects || objects.length === 0) continue

      const staleKeys = objects
        .filter((object) => object.created_at && new Date(object.created_at).getTime() < cutoff)
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
