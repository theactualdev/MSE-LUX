import type { Metadata } from 'next'
import Link from 'next/link'
import { listCollectionsWithCounts } from '@/features/admin/catalog/data'
import { CollectionManager } from '@/features/admin/catalog/components/collection-manager'

export const metadata: Metadata = { title: 'Collections' }

/**
 * `/admin/catalog/collections` — the collections manager: create, rename,
 * and (detach-only) delete. Server component; the `(admin)/admin` layout has
 * already enforced the ADMIN gate, and `listCollectionsWithCounts` assumes
 * that. Only the serializable list crosses into the client `CollectionManager`.
 */
export default async function AdminCollectionsPage() {
  const collections = await listCollectionsWithCounts()

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/catalog" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to catalog
        </Link>
        <h1 className="font-display text-2xl font-semibold text-foreground">Collections</h1>
      </div>

      <CollectionManager collections={collections} />
    </div>
  )
}
