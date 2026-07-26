import type { Metadata } from 'next'
import Link from 'next/link'
import { listTaxonomy } from '@/features/admin/catalog/data'
import { ProductCreateForm } from '@/features/admin/catalog/components/product-create-form'

export const metadata: Metadata = { title: 'New product' }

/**
 * `/admin/catalog/new` — the from-scratch product create form. Server
 * component; the `(admin)/admin` layout has already enforced the ADMIN
 * gate. Only reads `listTaxonomy()` — unlike the edit page, there is no
 * `getCatalogProduct` read since there's no product yet.
 */
export default async function AdminCatalogNewPage() {
  const taxonomy = await listTaxonomy()

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/catalog" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to catalog
        </Link>
        <h1 className="font-display text-2xl font-semibold text-foreground">New product</h1>
      </div>

      <ProductCreateForm taxonomy={taxonomy} />
    </div>
  )
}
