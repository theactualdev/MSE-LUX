import 'server-only'

import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'

/**
 * The Supabase Storage engine for product images: validated upload
 * (`uploadProductImage`) and best-effort orphan cleanup
 * (`deleteProductImageObject`). Server-only and UNGATED on purpose — the
 * caller (a later task's Server Action) re-checks ADMIN itself, the same
 * trust model as the rest of `admin/catalog` (server actions are public
 * HTTP endpoints; the `(admin)` layout gate covers rendering only). Unlike
 * the Prisma-backed siblings in this directory, storage calls run through
 * `createClient()` AS the signed-in admin, so the bucket's RLS policies are
 * a second, independent enforcement layer at the storage tier — not the
 * only one.
 *
 * Type/size are validated before any Supabase client is created, so a
 * rejected file never spends a round trip. Neither exported function
 * throws: upload failures collapse to `'storage-error'`, and delete
 * failures collapse to `false` (logged) for the caller to treat as an
 * orphaned object rather than a hard failure.
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
