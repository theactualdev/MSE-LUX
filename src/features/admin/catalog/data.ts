import 'server-only'

import { db } from '@/lib/db'
import { type Badge, type Prisma, type ProductStatus } from '@/generated/prisma/client'

/**
 * Admin-scoped catalog readers — filtered/paginated product list, full
 * edit-page detail, and taxonomy options for form selects. Server-only and
 * UNGATED on purpose: every caller reaches these through the `(admin)/admin`
 * layout, which has already enforced `requireRole(ADMIN)` — same trust model
 * as `src/features/admin/data.ts` and `src/features/admin/orders/data.ts`.
 *
 * Prisma reads bypass RLS (direct Postgres connection), so that layout gate
 * is the entire protection — do not export this from any ungated route.
 */

export const CATALOG_PAGE_SIZE = 20

export interface AdminProductListItem {
  id: string
  name: string
  slug: string
  sku: string
  status: ProductStatus
  priceNgnMinor: number
  priceUsdMinor: number
  /** Own `inventory` for variantless products, Σ variant inventory otherwise. */
  stock: number
  variantCount: number
  categoryName: string
  heroImage: string | null
}

export interface ListCatalogProductsInput {
  search?: string
  status?: ProductStatus
  categoryId?: string
  sort?: 'newest' | 'low-stock'
  page?: number
}

export interface ListCatalogProductsResult {
  products: AdminProductListItem[]
  total: number
  page: number
  pageCount: number
}

const LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  status: true,
  priceNgnMinor: true,
  priceUsdMinor: true,
  inventory: true,
  category: { select: { name: true } },
  images: { orderBy: { position: 'asc' as const }, take: 1, select: { src: true } },
  variants: { select: { inventory: true } },
} satisfies Prisma.ProductSelect

type ListRow = Prisma.ProductGetPayload<{ select: typeof LIST_SELECT }>

function mapListRow(row: ListRow): AdminProductListItem {
  const stock = row.variants.length > 0 ? row.variants.reduce((sum, variant) => sum + variant.inventory, 0) : row.inventory
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    status: row.status,
    priceNgnMinor: row.priceNgnMinor,
    priceUsdMinor: row.priceUsdMinor,
    stock,
    variantCount: row.variants.length,
    categoryName: row.category.name,
    heroImage: row.images[0]?.src ?? null,
  }
}

/**
 * List admin catalog products with optional search/status/category
 * filtering, sort, and pagination (default page size: 20).
 *
 * @param input - Optional filters: search (name/sku/slug), status, categoryId, sort, page (1-indexed)
 * @returns Paginated list with total count and page count
 */
export async function listCatalogProducts(input: ListCatalogProductsInput = {}): Promise<ListCatalogProductsResult> {
  const { search, status, categoryId, sort, page = 1 } = input

  // Clamp page to a minimum-1 INTEGER — a fractional page (?page=2.01 typed
  // into the URL) would otherwise produce a fractional `skip`, which Prisma
  // rejects at runtime ("Expected Int") and crash the whole list route.
  const clampedPage = Math.max(1, Math.floor(page))
  const skip = (clampedPage - 1) * CATALOG_PAGE_SIZE

  const conditions: Prisma.ProductWhereInput[] = []

  const trimmedSearch = search?.trim()
  if (trimmedSearch) {
    conditions.push({
      OR: [{ name: { contains: trimmedSearch, mode: 'insensitive' } }, { sku: trimmedSearch }, { slug: trimmedSearch }],
    })
  }
  if (status) conditions.push({ status })
  if (categoryId) conditions.push({ categoryId })

  const where: Prisma.ProductWhereInput = conditions.length === 0 ? {} : conditions.length === 1 ? conditions[0] : { AND: conditions }

  // 'low-stock' sorts by the product's own `inventory` column. That column
  // is unused for variant products (their stock lives on `ProductVariant`
  // rows instead — see the schema comment on `Product.inventory`), so
  // variant products all sort as if they had 0 stock and float to the top
  // regardless of their actual (correctly summed, see `mapListRow`) stock.
  // Acceptable for 8c-1; revisit with a computed/aggregated sort in 8c-2.
  const orderBy: Prisma.ProductOrderByWithRelationInput = sort === 'low-stock' ? { inventory: 'asc' } : { createdAt: 'desc' }

  const [rows, total] = await Promise.all([
    db.product.findMany({ where, orderBy, skip, take: CATALOG_PAGE_SIZE, select: LIST_SELECT }),
    db.product.count({ where }),
  ])

  return {
    products: rows.map(mapListRow),
    total,
    page: clampedPage,
    pageCount: Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE)),
  }
}

export interface AdminProductDetail {
  id: string
  name: string
  slug: string
  sku: string
  shortDescription: string
  description: string
  material: string
  materialTags: string[]
  badges: Badge[]
  status: ProductStatus
  priceNgnMinor: number
  priceUsdMinor: number
  salePriceNgnMinor: number | null
  salePriceUsdMinor: number | null
  inventory: number
  weightGrams: number | null
  seoTitle: string | null
  seoDescription: string | null
  categoryId: string
  subcategoryId: string | null
  collectionIds: string[]
  images: { id: string; src: string; alt: string; position: number }[]
  optionTypes: { id: string; name: string; position: number; values: { id: string; value: string; position: number }[] }[]
  variants: {
    id: string
    sku: string
    inventory: number
    priceNgnMinor: number | null
    priceUsdMinor: number | null
    options: { name: string; value: string }[]
    /** Whether any `OrderLine` references THIS variant — drives the
     * variant-structure panel's per-row "can't delete — has orders" UI
     * (`VariantsBuilder`'s `ExistingVariantSummary.hasOrders`). Distinct
     * from the product-level `hasOrderLines` below, which only guards
     * whole-product delete. */
    hasOrders: boolean
  }[]
  /** Whether any `OrderLine` references this product — drives the delete-vs-archive UI affordance. */
  hasOrderLines: boolean
}

const DETAIL_INCLUDE = {
  images: { orderBy: { position: 'asc' as const } },
  optionTypes: { orderBy: { position: 'asc' as const }, include: { values: { orderBy: { position: 'asc' as const } } } },
  variants: { include: { options: { select: { name: true, value: true } }, orderLines: { take: 1, select: { id: true } } } },
  collections: { select: { collectionId: true } },
  orderLines: { take: 1, select: { id: true } },
} satisfies Prisma.ProductInclude

type DetailRow = Prisma.ProductGetPayload<{ include: typeof DETAIL_INCLUDE }>

function mapDetailRow(row: DetailRow): AdminProductDetail {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    shortDescription: row.shortDescription,
    description: row.description,
    material: row.material,
    materialTags: row.materialTags,
    badges: row.badges,
    status: row.status,
    priceNgnMinor: row.priceNgnMinor,
    priceUsdMinor: row.priceUsdMinor,
    salePriceNgnMinor: row.salePriceNgnMinor,
    salePriceUsdMinor: row.salePriceUsdMinor,
    inventory: row.inventory,
    weightGrams: row.weightGrams,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    categoryId: row.categoryId,
    subcategoryId: row.subcategoryId,
    collectionIds: row.collections.map((c) => c.collectionId),
    images: row.images.map((image) => ({ id: image.id, src: image.src, alt: image.alt, position: image.position })),
    optionTypes: row.optionTypes.map((optionType) => ({
      id: optionType.id,
      name: optionType.name,
      position: optionType.position,
      values: optionType.values.map((value) => ({ id: value.id, value: value.value, position: value.position })),
    })),
    variants: row.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      inventory: variant.inventory,
      priceNgnMinor: variant.priceNgnMinor,
      priceUsdMinor: variant.priceUsdMinor,
      options: variant.options.map((option) => ({ name: option.name, value: option.value })),
      hasOrders: variant.orderLines.length > 0,
    })),
    hasOrderLines: row.orderLines.length > 0,
  }
}

/**
 * Get the full admin edit-page detail for a single product — every
 * 8c-1-editable field with ids, plus `hasOrderLines`. Field names are kept
 * aligned with `updateProductSchema` (`./schema.ts`) so the edit form can
 * round-trip this shape back through `updateProduct` without renaming.
 *
 * @param id - The product id to fetch
 * @returns Full product detail or null if not found
 */
export async function getCatalogProduct(id: string): Promise<AdminProductDetail | null> {
  const row = await db.product.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  if (!row) return null
  return mapDetailRow(row)
}

export interface TaxonomyOptions {
  categories: { id: string; name: string; subcategories: { id: string; name: string }[] }[]
  collections: { id: string; name: string; slug: string }[]
}

/**
 * Taxonomy options for the product-edit form's category/subcategory/collection selects.
 */
export async function listTaxonomy(): Promise<TaxonomyOptions> {
  const [categories, collections] = await Promise.all([
    db.category.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, subcategories: { orderBy: { name: 'asc' }, select: { id: true, name: true } } },
    }),
    db.collection.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true } }),
  ])

  return { categories, collections }
}

export interface AdminCollectionListItem {
  id: string
  name: string
  slug: string
  description: string | null
  productCount: number
}

/**
 * List collections with their product counts, for the admin collections index.
 */
export async function listCollectionsWithCounts(): Promise<AdminCollectionListItem[]> {
  const rows = await db.collection.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  })

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    productCount: row._count.products,
  }))
}
