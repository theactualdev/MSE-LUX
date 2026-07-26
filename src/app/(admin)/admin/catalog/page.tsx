import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ProductStatus } from '@/generated/prisma/client'
import { listCatalogProducts, listTaxonomy } from '@/features/admin/catalog/data'
import { LOW_STOCK_THRESHOLD } from '@/features/admin/data'
import { ProductStatusBadge } from '@/features/admin/catalog/components/product-status-badge'
import { formatMoney } from '@/lib/money/format'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Catalog' }

const STATUS_TABS = [undefined, ...Object.values(ProductStatus)] as const

function isProductStatus(value: string | undefined): value is ProductStatus {
  return typeof value === 'string' && (Object.values(ProductStatus) as string[]).includes(value)
}

/** Title-cases a status for tab labels, e.g. `ACTIVE` -> `Active`; `undefined` -> `All`. */
function tabLabel(status: ProductStatus | undefined): string {
  if (!status) return 'All'
  return status.charAt(0) + status.slice(1).toLowerCase()
}

type SortOption = 'low-stock'

function isSortOption(value: string | undefined): value is SortOption {
  return value === 'low-stock'
}

const SORT_TABS: { value: SortOption | undefined; label: string }[] = [
  { value: undefined, label: 'Newest' },
  { value: 'low-stock', label: 'Low stock' },
]

interface CatalogFilters {
  status: ProductStatus | undefined
  query: string | undefined
  categoryId: string | undefined
  sort: SortOption | undefined
}

/** Builds an /admin/catalog URL for a given filter set + page, dropping empty params and page=1. */
function hrefFor(filters: CatalogFilters, page?: number): string {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.query) params.set('q', filters.query)
  if (filters.categoryId) params.set('category', filters.categoryId)
  if (filters.sort) params.set('sort', filters.sort)
  if (page && page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/admin/catalog?${qs}` : '/admin/catalog'
}

/**
 * Admin catalog list: status tabs (All/Active/Draft), a newest/low-stock sort
 * toggle, a GET search+category form (name/SKU/slug text + a category
 * select), a bordered row list linking to the per-product detail page, and
 * Prev/Next pagination — all filter state lives in the URL so it's
 * shareable/back-button-safe. Server component; the `(admin)/admin` layout
 * has already enforced the ADMIN gate.
 */
export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawStatus = typeof params.status === 'string' ? params.status : undefined
  const status = isProductStatus(rawStatus) ? rawStatus : undefined
  const query = typeof params.q === 'string' && params.q.trim() ? params.q.trim() : undefined
  const rawCategory = typeof params.category === 'string' ? params.category.trim() : undefined
  const categoryId = rawCategory ? rawCategory : undefined
  const rawSort = typeof params.sort === 'string' ? params.sort : undefined
  const sort = isSortOption(rawSort) ? rawSort : undefined
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1)

  const filters: CatalogFilters = { status, query, categoryId, sort }

  const [{ products, total, pageCount }, { categories }] = await Promise.all([
    listCatalogProducts({ search: query, status, categoryId, sort, page }),
    listTaxonomy(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-foreground">Catalog</h1>
          <Link
            href="/admin/catalog/collections"
            className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Collections
          </Link>
        </div>
        <div className="flex items-baseline gap-3">
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? 'product' : 'products'}
          </p>
          <Link
            href="/admin/catalog/new"
            className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            New product
          </Link>
        </div>
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
        {STATUS_TABS.map((tab) => {
          const active = tab === status
          return (
            <Link
              key={tab ?? 'all'}
              href={hrefFor({ ...filters, status: tab })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {tabLabel(tab)}
            </Link>
          )
        })}
      </nav>

      <nav aria-label="Sort" className="flex flex-wrap gap-1">
        {SORT_TABS.map((tab) => {
          const active = tab.value === sort
          return (
            <Link
              key={tab.label}
              href={hrefFor({ ...filters, sort: tab.value })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      <form method="GET" className="flex flex-wrap gap-2">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        {sort ? <input type="hidden" name="sort" value={sort} /> : null}
        <Input
          type="search"
          name="q"
          defaultValue={query ?? ''}
          placeholder="Search by name or SKU"
          aria-label="Search products"
          className="max-w-sm"
        />
        <select
          name="category"
          defaultValue={categoryId ?? ''}
          aria-label="Filter by category"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
      </form>

      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No products match.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/admin/catalog/${product.id}`}
              className="flex items-center gap-4 p-4 transition-colors hover:bg-muted"
            >
              <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                {product.heroImage ? (
                  <Image src={product.heroImage} alt={product.name} fill sizes="48px" className="object-cover" />
                ) : null}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-display text-sm font-medium text-foreground">{product.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  SKU {product.sku} &middot; {product.categoryName}
                  {product.variantCount > 0 ? (
                    <>
                      {' '}
                      &middot; {product.variantCount} {product.variantCount === 1 ? 'variant' : 'variants'}
                    </>
                  ) : null}
                </span>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                <ProductStatusBadge status={product.status} />
                <span
                  className={cn(
                    'text-xs font-medium',
                    product.stock <= LOW_STOCK_THRESHOLD ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {product.stock} in stock
                </span>
                <span className="text-sm font-medium text-foreground">
                  {formatMoney({ amountMinor: product.priceNgnMinor, currency: 'NGN' })} /{' '}
                  {formatMoney({ amountMinor: product.priceUsdMinor, currency: 'USD' })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <Link
            href={hrefFor(filters, Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={cn(
              'font-medium',
              page <= 1 ? 'pointer-events-none text-muted-foreground/50' : 'text-foreground hover:underline',
            )}
          >
            Prev
          </Link>
          <span className="text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Link
            href={hrefFor(filters, Math.min(pageCount, page + 1))}
            aria-disabled={page >= pageCount}
            className={cn(
              'font-medium',
              page >= pageCount ? 'pointer-events-none text-muted-foreground/50' : 'text-foreground hover:underline',
            )}
          >
            Next
          </Link>
        </div>
      ) : null}
    </div>
  )
}
