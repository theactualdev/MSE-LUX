'use client'

import { useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SearchCriteria } from '@/features/catalog/lib/search-params'
import { toggleParamValue } from '@/features/catalog/lib/search-params'
import type { FacetCounts } from '@/features/catalog/lib/search'
import { BADGE_LABELS, type FacetVocab } from '@/features/catalog/components/facet-panel'

interface ActiveFilterChipsProps {
  criteria: SearchCriteria
  counts: FacetCounts
  vocab: FacetVocab
  /** Gates the category/subcategory chips. Route-scoped listing pages pass `false` for the dimension they force into `criteria`, so it never renders as a removable chip. Defaults to shown. */
  show?: { category?: boolean; subcategory?: boolean }
  className?: string
}

interface ActiveChip {
  key: string
  /** Accessible, count-free value used to name the remove control (e.g. "Remove filter Brass"). */
  name: string
  /** Visible chip text — may include the option's current count. */
  label: string
  onRemove: () => void
}

function withCount(name: string, count: number | undefined): string {
  return count === undefined ? name : `${name} (${count})`
}

/**
 * Removable chip row summarizing every active facet value in `criteria`,
 * plus a "Clear all" reset. Reads/writes the same URL search params as
 * `FacetPanel` — each chip's remove control deletes just that one value.
 */
export function ActiveFilterChips({ criteria, counts, vocab, show, className }: ActiveFilterChipsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const push = useCallback(
    (params: URLSearchParams) => {
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router],
  )

  const removeSingle = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete(key)
      push(params)
    },
    [push, searchParams],
  )

  const removeMulti = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      const next = toggleParamValue(params.getAll(key), value)
      params.delete(key)
      for (const v of next) params.append(key, v)
      push(params)
    },
    [push, searchParams],
  )

  const clearAll = useCallback(() => {
    router.replace(pathname, { scroll: false })
  }, [pathname, router])

  const categoryName = (slug: string) => vocab.categories?.find((c) => c.slug === slug)?.name ?? slug
  const subcategoryName = (slug: string) => vocab.subcategories?.find((s) => s.slug === slug)?.name ?? slug

  const chips: ActiveChip[] = []

  if (criteria.query) {
    chips.push({ key: 'query', name: criteria.query, label: `“${criteria.query}”`, onRemove: () => removeSingle('q') })
  }
  if (show?.category !== false) {
    for (const slug of criteria.categories) {
      const name = categoryName(slug)
      chips.push({ key: `category-${slug}`, name, label: withCount(name, counts.categories[slug]), onRemove: () => removeMulti('category', slug) })
    }
  }
  if (show?.subcategory !== false && criteria.subcategory) {
    const name = subcategoryName(criteria.subcategory)
    chips.push({ key: 'subcategory', name, label: name, onRemove: () => removeSingle('subcategory') })
  }
  for (const material of criteria.materials) {
    chips.push({ key: `material-${material}`, name: material, label: withCount(material, counts.materials[material]), onRemove: () => removeMulti('material', material) })
  }
  for (const color of criteria.colors) {
    chips.push({ key: `color-${color}`, name: color, label: withCount(color, counts.colors[color]), onRemove: () => removeMulti('color', color) })
  }
  for (const badge of criteria.badges) {
    const name = BADGE_LABELS[badge]
    chips.push({ key: `badge-${badge}`, name, label: withCount(name, counts.badges[badge]), onRemove: () => removeMulti('badge', badge) })
  }
  if (criteria.priceMin !== undefined) {
    const name = `Min ₦${criteria.priceMin.toLocaleString('en-NG')}`
    chips.push({ key: 'priceMin', name, label: name, onRemove: () => removeSingle('priceMin') })
  }
  if (criteria.priceMax !== undefined) {
    const name = `Max ₦${criteria.priceMax.toLocaleString('en-NG')}`
    chips.push({ key: 'priceMax', name, label: name, onRemove: () => removeSingle('priceMax') })
  }
  if (criteria.inStock) {
    chips.push({ key: 'inStock', name: 'In stock only', label: 'In stock only', onRemove: () => removeSingle('inStock') })
  }

  if (chips.length === 0) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {chips.map((chip) => (
        <Badge key={chip.key} variant="outline" className="gap-1 py-1 pr-1">
          <span>{chip.label}</span>
          <button
            type="button"
            aria-label={`Remove filter ${chip.name}`}
            className="rounded-full p-0.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            onClick={chip.onRemove}
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </Badge>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
        Clear all
      </Button>
    </div>
  )
}
