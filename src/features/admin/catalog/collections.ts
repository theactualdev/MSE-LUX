import 'server-only'
import { db } from '@/lib/db'
import { CatalogWriteResult } from './products'
import { z } from 'zod'

/**
 * The admin catalog collection engine: validated creates (`createCollection`),
 * validated edits (`updateCollection`), and hard delete (`deleteCollection`).
 * `computeCollectionRevalidateTargets` is pure — no I/O — so the revalidation
 * path list can be unit tested without mocking Prisma.
 *
 * Ungated by design — every caller reaches this through actions.ts, which
 * re-checks ADMIN (server actions are public endpoints; the (admin) layout
 * gate covers rendering only).
 */

export const collectionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case only'),
  description: z.string().trim().max(500).nullable(),
  // The `Collection.image` column has existed since the schema was written,
  // but no admin ever exposed it — so collection tiles on the home page were
  // stuck with whatever the seed put there and could only be changed in the
  // database. Same shape as the category image field.
  image: z.string().trim().max(500).nullable(),
})

export type CreateCollectionInput = z.infer<typeof collectionSchema>

/**
 * Pure — no I/O. Builds the list of storefront paths a collection
 * write needs revalidated: the collection page itself, `/collections`, and `/`.
 */
export function computeCollectionRevalidateTargets(input: {
  beforeSlug: string
  afterSlug: string
}): string[] {
  const targets = new Set<string>()
  targets.add(`/collections/${input.beforeSlug}`)
  if (input.afterSlug !== input.beforeSlug) {
    targets.add(`/collections/${input.afterSlug}`)
  }
  targets.add('/collections')
  targets.add('/')
  return [...targets]
}

export async function createCollection(input: unknown): Promise<CatalogWriteResult> {
  const parsed = collectionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid-input', issues: parsed.error.issues }
  const data = parsed.data

  try {
    const slugConflict = await db.collection.findFirst({ where: { slug: data.slug } })
    if (slugConflict) return { ok: false, error: 'conflict-slug' }

    await db.collection.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        image: data.image,
      },
    })

    const targets = computeCollectionRevalidateTargets({
      beforeSlug: data.slug,
      afterSlug: data.slug,
    })
    return { ok: true, revalidate: targets }
  } catch (error) {
    console.error('[createCollection] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

export async function updateCollection(id: string, input: unknown): Promise<CatalogWriteResult> {
  const parsed = collectionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid-input', issues: parsed.error.issues }
  const data = parsed.data

  try {
    const current = await db.collection.findUnique({ where: { id } })
    if (!current) return { ok: false, error: 'not-found' }

    const slugConflict = await db.collection.findFirst({ where: { slug: data.slug, NOT: { id } } })
    if (slugConflict) return { ok: false, error: 'conflict-slug' }

    await db.collection.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        image: data.image,
      },
    })

    const targets = computeCollectionRevalidateTargets({
      beforeSlug: current.slug,
      afterSlug: data.slug,
    })
    return { ok: true, revalidate: targets }
  } catch (error) {
    console.error('[updateCollection] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

export async function deleteCollection(id: string): Promise<CatalogWriteResult> {
  try {
    const current = await db.collection.findUnique({ where: { id } })
    if (!current) return { ok: false, error: 'not-found' }

    await db.collection.delete({ where: { id } })

    const targets = computeCollectionRevalidateTargets({
      beforeSlug: current.slug,
      afterSlug: current.slug,
    })
    return { ok: true, revalidate: targets }
  } catch (error) {
    console.error('[deleteCollection] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}
