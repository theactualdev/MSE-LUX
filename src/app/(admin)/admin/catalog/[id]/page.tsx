import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCatalogProduct, listTaxonomy } from '@/features/admin/catalog/data'
import { ProductForm } from '@/features/admin/catalog/components/product-form'
import { DangerZone } from '@/features/admin/catalog/components/danger-zone'
import { ImageManager } from '@/features/admin/catalog/components/image-manager'
import { VariantStructurePanel } from '@/features/admin/catalog/components/variant-structure-panel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Edit product' }

interface CatalogEditPageProps {
  params: Promise<{ id: string }>
}

/**
 * `/admin/catalog/[id]` — the full product edit form, the image manager, the
 * variant-structure panel, and the danger zone (archive/restore/guarded
 * delete). Server component; the `(admin)/admin` layout has already enforced
 * the ADMIN gate, and both data readers assume that. An unknown id renders
 * the `(admin)` group's generic 404 via `notFound()` rather than a bespoke
 * empty state — same idiom as the order detail page. Only serializable props
 * (`product`, `taxonomy`) cross into the client components below.
 *
 * Three independent Save actions live on this page — `ProductForm` (scalars
 * + existing-variant scalar edits), `ImageManager` (image set, `mode="edit"`),
 * `VariantStructurePanel` (variant add/delete + optionTypes) — each calling
 * its own Server Action and its own `router.refresh()` on success, rather
 * than one giant form. That split mirrors the engine's own three-way split
 * (`updateProduct` / `updateProductImages` / `updateProductVariants`, see
 * `structure.ts`'s docblock) and means saving one section never risks
 * clobbering an in-progress edit in another.
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

      {/* Remount on any variant-structure change — same idiom as
          `VariantStructurePanel`'s own remount key. Without it, `ProductForm`'s
          `variantRows` (a lazy `useState` initializer, never re-synced) would
          keep submitting rows for variants a structure save just deleted,
          failing the next scalar save server-side. */}
      <ProductForm key={product.variants.map((v) => v.id).join('|')} product={product} taxonomy={taxonomy} />

      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
        </CardHeader>
        <CardContent>
          <ImageManager
            mode="edit"
            productId={product.id}
            initialImages={product.images.map((image) => ({ src: image.src, alt: image.alt }))}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-foreground">Variants</h2>
        <VariantStructurePanel product={product} />
      </div>

      <DangerZone
        productId={product.id}
        productName={product.name}
        status={product.status}
        hasOrderLines={product.hasOrderLines}
      />
    </div>
  )
}
