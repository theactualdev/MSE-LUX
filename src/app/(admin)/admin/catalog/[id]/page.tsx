import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCatalogProduct, listTaxonomy } from '@/features/admin/catalog/data'
import { ProductForm } from '@/features/admin/catalog/components/product-form'
import { DangerZone } from '@/features/admin/catalog/components/danger-zone'

export const metadata: Metadata = { title: 'Edit product' }

interface CatalogEditPageProps {
  params: Promise<{ id: string }>
}

/**
 * `/admin/catalog/[id]` — the full product edit form plus the danger zone
 * (archive/restore/guarded delete). Server component; the `(admin)/admin`
 * layout has already enforced the ADMIN gate, and both data readers assume
 * that. An unknown id renders the `(admin)` group's generic 404 via
 * `notFound()` rather than a bespoke empty state — same idiom as the order
 * detail page. Only serializable props (`detail`, `taxonomy`) cross into the
 * client components below.
 */
export default async function AdminCatalogEditPage({ params }: CatalogEditPageProps) {
  const { id } = await params
  const [product, taxonomy] = await Promise.all([getCatalogProduct(id), listTaxonomy()])
  if (!product) notFound()

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/catalog" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to catalog
        </Link>
        <h1 className="font-display text-2xl font-semibold text-foreground">{product.name}</h1>
      </div>

      <ProductForm product={product} taxonomy={taxonomy} />

      <DangerZone
        productId={product.id}
        productName={product.name}
        status={product.status}
        hasOrderLines={product.hasOrderLines}
      />
    </div>
  )
}
