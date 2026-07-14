'use client'

import { useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ListingSort } from '@/features/catalog/lib/listing'
import type { Subcategory } from '@/types/catalog'

const SORT_OPTIONS: { value: ListingSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
]

const ALL_SUBCATEGORIES_VALUE = 'all'

interface ListingControlsProps {
  /** When provided, renders a subcategory filter alongside sort + price. Omit on subcategory pages, which are already scoped. */
  subcategories?: Subcategory[]
  className?: string
}

/**
 * Sort / price-range / subcategory controls for a listing page. Reads its
 * current state from the URL's search params and pushes updates back to the
 * URL (rather than local state), so the server-rendered product list — which
 * is derived from `searchParams` on the page — always reflects what's shown.
 */
export function ListingControls({ subcategories, className }: ListingControlsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const sort = (searchParams.get('sort') as ListingSort | null) ?? 'newest'
  const priceMin = searchParams.get('priceMin') ?? ''
  const priceMax = searchParams.get('priceMax') ?? ''
  const subcategory = searchParams.get('subcategory') ?? ALL_SUBCATEGORIES_VALUE

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (!value || value === ALL_SUBCATEGORIES_VALUE || value === 'newest') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  return (
    <div
      className={cn(
        'flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6',
        className,
      )}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="listing-sort">Sort by</Label>
        <Select value={sort} onValueChange={(value) => updateParam('sort', String(value))}>
          <SelectTrigger id="listing-sort" className="w-full sm:w-52">
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="listing-price-min">Min price (NGN)</Label>
        <Input
          id="listing-price-min"
          key={`min-${priceMin}`}
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="0"
          defaultValue={priceMin}
          className="w-full sm:w-32"
          onBlur={(event) => updateParam('priceMin', event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') updateParam('priceMin', event.currentTarget.value)
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="listing-price-max">Max price (NGN)</Label>
        <Input
          id="listing-price-max"
          key={`max-${priceMax}`}
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Any"
          defaultValue={priceMax}
          className="w-full sm:w-32"
          onBlur={(event) => updateParam('priceMax', event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') updateParam('priceMax', event.currentTarget.value)
          }}
        />
      </div>

      {subcategories && subcategories.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="listing-subcategory">Subcategory</Label>
          <Select value={subcategory} onValueChange={(value) => updateParam('subcategory', String(value))}>
            <SelectTrigger id="listing-subcategory" className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL_SUBCATEGORIES_VALUE}>All</SelectItem>
                {subcategories.map((sub) => (
                  <SelectItem key={sub.slug} value={sub.slug}>
                    {sub.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  )
}
