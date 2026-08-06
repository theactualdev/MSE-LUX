import 'server-only'
import { z } from 'zod'
import { db } from '@/lib/db'
import { CatalogWriteResult } from './products'

/**
 * The admin catalog TAXONOMY engine: categories and their subcategories.
 *
 * This exists because taxonomy previously had no admin at all — categories
 * lived only in the `features/catalog/data/categories.ts` fixture, so adding
 * one meant editing code, re-seeding and deploying. That path was also unsafe
 * once the store held real stock, since the same seed script republishes the
 * demo product catalog (see `prisma/seed.ts`'s guard).
 *
 * Ungated by design — every caller reaches this through actions.ts, which
 * re-checks ADMIN (server actions are public endpoints; the (admin) layout
 * gate covers rendering only).
 */

const SLUG = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'kebab-case only')

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: SLUG,
  description: z.string().trim().max(500).nullable(),
  image: z.string().trim().max(500).nullable(),
})

export const subcategorySchema = z.object({
  categoryId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  slug: SLUG,
})

export type CategoryInput = z.infer<typeof categorySchema>
export type SubcategoryInput = z.infer<typeof subcategorySchema>

/**
 * Pure — no I/O.
 *
 * Taxonomy writes are unusual in that they change the NAVIGATION, which since
 * the nav became database-driven lives in the root layout and therefore
 * renders on every page. Listing individual paths would leave a renamed
 * category stale in the header of every route not named here, so callers pair
 * these targets with a layout-level revalidation; see
 * `revalidateTaxonomyTargets` in actions.ts.
 */
export function computeCategoryRevalidateTargets(input: {
  beforeSlug: string
  afterSlug: string
}): string[] {
  const targets = new Set<string>([`/${input.beforeSlug}`, `/${input.afterSlug}`, '/'])
  return [...targets]
}

export async function createCategory(input: unknown): Promise<CatalogWriteResult> {
  const parsed = categorySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid-input', issues: parsed.error.issues }
  const data = parsed.data

  try {
    if (await db.category.findFirst({ where: { slug: data.slug } })) {
      return { ok: false, error: 'conflict-slug' }
    }

    await db.category.create({
      data: { name: data.name, slug: data.slug, description: data.description, image: data.image },
    })

    return { ok: true, revalidate: computeCategoryRevalidateTargets({ beforeSlug: data.slug, afterSlug: data.slug }) }
  } catch (error) {
    console.error('[createCategory] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

export async function updateCategory(id: string, input: unknown): Promise<CatalogWriteResult> {
  const parsed = categorySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid-input', issues: parsed.error.issues }
  const data = parsed.data

  try {
    const current = await db.category.findUnique({ where: { id } })
    if (!current) return { ok: false, error: 'not-found' }

    if (await db.category.findFirst({ where: { slug: data.slug, NOT: { id } } })) {
      return { ok: false, error: 'conflict-slug' }
    }

    await db.category.update({
      where: { id },
      data: { name: data.name, slug: data.slug, description: data.description, image: data.image },
    })

    return { ok: true, revalidate: computeCategoryRevalidateTargets({ beforeSlug: current.slug, afterSlug: data.slug }) }
  } catch (error) {
    console.error('[updateCategory] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

/**
 * Deletes a category, but only once it is empty.
 *
 * `Product.categoryId` is REQUIRED, so Postgres restricts this delete anyway —
 * the explicit count is here so the admin can say "move these 12 products
 * first" instead of surfacing a foreign-key violation. Subcategories cascade
 * (`onDelete: Cascade`), which is safe precisely because the category having
 * no products means its subcategories have none either.
 */
export async function deleteCategory(id: string): Promise<CatalogWriteResult> {
  try {
    const current = await db.category.findUnique({ where: { id } })
    if (!current) return { ok: false, error: 'not-found' }

    if ((await db.product.count({ where: { categoryId: id } })) > 0) {
      return { ok: false, error: 'has-products' }
    }

    await db.category.delete({ where: { id } })

    return { ok: true, revalidate: computeCategoryRevalidateTargets({ beforeSlug: current.slug, afterSlug: current.slug }) }
  } catch (error) {
    console.error('[deleteCategory] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

export async function createSubcategory(input: unknown): Promise<CatalogWriteResult> {
  const parsed = subcategorySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid-input', issues: parsed.error.issues }
  const data = parsed.data

  try {
    const category = await db.category.findUnique({ where: { id: data.categoryId } })
    if (!category) return { ok: false, error: 'invalid-taxonomy' }

    // Subcategory slugs are unique PER CATEGORY (`@@unique([categoryId, slug])`),
    // not globally — two categories may both have a "bracelets".
    const conflict = await db.subcategory.findFirst({
      where: { categoryId: data.categoryId, slug: data.slug },
    })
    if (conflict) return { ok: false, error: 'conflict-slug' }

    await db.subcategory.create({
      data: { categoryId: data.categoryId, name: data.name, slug: data.slug },
    })

    return { ok: true, revalidate: computeCategoryRevalidateTargets({ beforeSlug: category.slug, afterSlug: category.slug }) }
  } catch (error) {
    console.error('[createSubcategory] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

export async function updateSubcategory(id: string, input: unknown): Promise<CatalogWriteResult> {
  const parsed = subcategorySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid-input', issues: parsed.error.issues }
  const data = parsed.data

  try {
    const current = await db.subcategory.findUnique({ where: { id }, include: { category: true } })
    if (!current) return { ok: false, error: 'not-found' }

    const conflict = await db.subcategory.findFirst({
      where: { categoryId: current.categoryId, slug: data.slug, NOT: { id } },
    })
    if (conflict) return { ok: false, error: 'conflict-slug' }

    // The parent is intentionally NOT reassignable here: moving a subcategory
    // between categories would silently change the category of every product
    // filed under it, and that belongs in a deliberate bulk move, not a rename.
    await db.subcategory.update({ where: { id }, data: { name: data.name, slug: data.slug } })

    return {
      ok: true,
      revalidate: computeCategoryRevalidateTargets({
        beforeSlug: current.category.slug,
        afterSlug: current.category.slug,
      }),
    }
  } catch (error) {
    console.error('[updateSubcategory] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}

/**
 * Deletes a subcategory, but only once nothing is filed under it.
 *
 * Unlike a category, `Product.subcategoryId` is NULLABLE — Postgres would
 * happily null it out and leave the products alive but unfiled, with no
 * warning. That silent reshuffling is exactly what this check exists to
 * prevent.
 */
export async function deleteSubcategory(id: string): Promise<CatalogWriteResult> {
  try {
    const current = await db.subcategory.findUnique({ where: { id }, include: { category: true } })
    if (!current) return { ok: false, error: 'not-found' }

    if ((await db.product.count({ where: { subcategoryId: id } })) > 0) {
      return { ok: false, error: 'has-products' }
    }

    await db.subcategory.delete({ where: { id } })

    return {
      ok: true,
      revalidate: computeCategoryRevalidateTargets({
        beforeSlug: current.category.slug,
        afterSlug: current.category.slug,
      }),
    }
  } catch (error) {
    console.error('[deleteSubcategory] unexpected error', error)
    return { ok: false, error: 'error' }
  }
}
