import type { Metadata } from 'next'
import Link from 'next/link'
import { listCategoriesWithCounts } from '@/features/admin/catalog/data'
import { CategoryManager } from '@/features/admin/catalog/components/category-manager'

export const metadata: Metadata = { title: 'Categories' }

/**
 * `/admin/catalog/categories` — the storefront taxonomy manager: create,
 * rename and delete categories and their subcategories. Server component; the
 * `(admin)/admin` layout has already enforced the ADMIN gate, and
 * `listCategoriesWithCounts` assumes that. Only the serializable list crosses
 * into the client `CategoryManager`.
 */
export default async function AdminCategoriesPage() {
  const categories = await listCategoriesWithCounts()

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/catalog" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to catalog
        </Link>
        <h1 className="font-display text-2xl font-semibold text-foreground">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Categories and subcategories drive the storefront navigation and each category&rsquo;s listing page.
        </p>
      </div>

      <CategoryManager categories={categories} />
    </div>
  )
}
