'use client'

import { useCallback, useId } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { SearchCriteria } from '@/features/catalog/lib/search-params'
import { toggleParamValue } from '@/features/catalog/lib/search-params'
import type { FacetCounts } from '@/features/catalog/lib/search'
import { PRODUCT_BADGES, type ProductBadge } from '@/features/catalog/lib/facets'
import type { ListingSort } from '@/features/catalog/lib/listing'
import { getSwatchColor } from '@/features/catalog/lib/color-swatches'

/** Named vocabulary a facet panel/chips row renders options from. */
export interface FacetVocab {
  materials: string[]
  colors: string[]
  categories?: { slug: string; name: string }[]
  subcategories?: { slug: string; name: string }[]
}

export interface FacetPanelProps {
  criteria: SearchCriteria
  counts: FacetCounts
  vocab: FacetVocab
  /** Gates the category/subcategory sections. Route-scoped listing pages (e.g. a subcategory page) pass `false` for the dimension they're already scoped to. */
  show?: { category?: boolean; subcategory?: boolean }
  className?: string
}

const SORT_OPTIONS: { value: ListingSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
]

export const BADGE_LABELS: Record<ProductBadge, string> = {
  new: 'New',
  'best-seller': 'Best seller',
}

interface OptionRowProps {
  id: string
  label: string
  count?: number
  checked: boolean
  onChange: () => void
  type?: 'checkbox' | 'radio'
  name?: string
}

/** A single labelled checkbox/radio facet option; zero-count options are disabled rather than hidden. */
function OptionRow({ id, label, count, checked, onChange, type = 'checkbox', name }: OptionRowProps) {
  const disabled = count === 0
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-foreground has-[:disabled]:opacity-50">
      <input
        id={id}
        type={type}
        name={name}
        className="size-4 rounded border-input accent-accent disabled:cursor-not-allowed"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span>{label}</span>
      {count !== undefined ? <span className="text-muted-foreground">({count})</span> : null}
    </label>
  )
}

/**
 * Shared, URL-driven facet controls for the catalog listing/search
 * experience: category/subcategory (route-gated), material, color, price
 * range, in-stock, badges, and sort. Reads current state from `criteria`
 * (parsed server-side from the URL) and `counts` (computed alongside it),
 * and pushes updates back to the URL so the server-rendered result list,
 * which derives from `searchParams`, always reflects what's shown.
 */
export function FacetPanel({ criteria, counts, vocab, show, className }: FacetPanelProps) {
  const uid = useId()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const push = useCallback(
    (params: URLSearchParams) => {
      // No pagination cursor exists in this app today; if one is added later
      // it should be deleted here so every facet change resets to page 1.
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router],
  )

  /** Set or delete a single-value param (sort, priceMin, priceMax, inStock, subcategory). */
  const setSingle = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (!value) params.delete(key)
      else params.set(key, value)
      push(params)
    },
    [push, searchParams],
  )

  /** Add/remove one value from a multi-value param (category, material, color, badge). */
  const toggleMulti = useCallback(
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

  const priceMin = searchParams.get('priceMin') ?? ''
  const priceMax = searchParams.get('priceMax') ?? ''

  const hasActiveFilters =
    Boolean(criteria.query) ||
    (Boolean(show?.category) && criteria.categories.length > 0) ||
    (Boolean(show?.subcategory) && Boolean(criteria.subcategory)) ||
    criteria.materials.length > 0 ||
    criteria.colors.length > 0 ||
    criteria.badges.length > 0 ||
    criteria.priceMin !== undefined ||
    criteria.priceMax !== undefined ||
    criteria.inStock

  const showCategory = show?.category && vocab.categories && vocab.categories.length > 0
  const showSubcategory = show?.subcategory && vocab.subcategories && vocab.subcategories.length > 0

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-base font-medium text-foreground">Filters</h2>
        <Button type="button" variant="ghost" size="sm" disabled={!hasActiveFilters} onClick={clearAll}>
          Clear all
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-sort`}>Sort by</Label>
        <Select
          value={criteria.sort}
          onValueChange={(value) => setSingle('sort', value === 'newest' ? null : String(value))}
        >
          <SelectTrigger id={`${uid}-sort`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {showCategory ? (
        <>
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-foreground">Category</legend>
            <div className="flex flex-col gap-2">
              {vocab.categories!.map((category) => (
                <OptionRow
                  key={category.slug}
                  id={`${uid}-category-${category.slug}`}
                  label={category.name}
                  count={counts.categories[category.slug] ?? 0}
                  checked={criteria.categories.includes(category.slug)}
                  onChange={() => toggleMulti('category', category.slug)}
                />
              ))}
            </div>
          </fieldset>
          <Separator />
        </>
      ) : null}

      {showSubcategory ? (
        <>
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-foreground">Subcategory</legend>
            <div className="flex flex-col gap-2">
              <OptionRow
                id={`${uid}-subcategory-all`}
                name={`${uid}-subcategory`}
                type="radio"
                label="All"
                checked={!criteria.subcategory}
                onChange={() => setSingle('subcategory', null)}
              />
              {vocab.subcategories!.map((sub) => (
                <OptionRow
                  key={sub.slug}
                  id={`${uid}-subcategory-${sub.slug}`}
                  name={`${uid}-subcategory`}
                  type="radio"
                  label={sub.name}
                  checked={criteria.subcategory === sub.slug}
                  onChange={() => setSingle('subcategory', sub.slug)}
                />
              ))}
            </div>
          </fieldset>
          <Separator />
        </>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">Material</legend>
        <div className="flex flex-col gap-2">
          {vocab.materials.map((material) => (
            <OptionRow
              key={material}
              id={`${uid}-material-${material}`}
              label={material}
              count={counts.materials[material] ?? 0}
              checked={criteria.materials.includes(material)}
              onChange={() => toggleMulti('material', material)}
            />
          ))}
        </div>
      </fieldset>

      <Separator />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">Color</legend>
        <div className="flex flex-wrap gap-2">
          {vocab.colors.map((color) => {
            const count = counts.colors[color] ?? 0
            const selected = criteria.colors.includes(color)
            const swatchHex = getSwatchColor(color)
            return (
              <Button
                key={color}
                type="button"
                variant={selected ? 'default' : 'outline'}
                size="sm"
                aria-pressed={selected}
                disabled={count === 0}
                onClick={() => toggleMulti('color', color)}
              >
                {/* Swatch is decorative only — the color name is always shown as text, never color alone. Unknown color words fall back to the bg-muted token rather than a curated swatch. */}
                <span
                  aria-hidden="true"
                  className="inline-block size-3 shrink-0 rounded-full border border-border bg-muted"
                  style={swatchHex ? { backgroundColor: swatchHex } : undefined}
                />
                <span>{color}</span>
                <span>({count})</span>
              </Button>
            )
          })}
        </div>
      </fieldset>

      <Separator />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">Price (NGN)</legend>
        <div className="flex items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor={`${uid}-price-min`}>Min</Label>
            <Input
              id={`${uid}-price-min`}
              key={`min-${priceMin}`}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              defaultValue={priceMin}
              onBlur={(event) => setSingle('priceMin', event.target.value || null)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setSingle('priceMin', event.currentTarget.value || null)
              }}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor={`${uid}-price-max`}>Max</Label>
            <Input
              id={`${uid}-price-max`}
              key={`max-${priceMax}`}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="Any"
              defaultValue={priceMax}
              onBlur={(event) => setSingle('priceMax', event.target.value || null)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setSingle('priceMax', event.currentTarget.value || null)
              }}
            />
          </div>
        </div>
      </fieldset>

      <Separator />

      <OptionRow
        id={`${uid}-in-stock`}
        label="In stock only"
        checked={criteria.inStock}
        onChange={() => setSingle('inStock', !criteria.inStock ? '1' : null)}
      />

      <Separator />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">Highlights</legend>
        <div className="flex flex-col gap-2">
          {PRODUCT_BADGES.map((badge) => (
            <OptionRow
              key={badge}
              id={`${uid}-badge-${badge}`}
              label={BADGE_LABELS[badge]}
              count={counts.badges[badge] ?? 0}
              checked={criteria.badges.includes(badge)}
              onChange={() => toggleMulti('badge', badge)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  )
}
