'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PriceDisplay } from '@/features/catalog/components/price-display'
import { getAllProducts } from '@/features/catalog/lib/selectors'
import { searchAndFilterProducts } from '@/features/catalog/lib/search'
import type { SearchCriteria } from '@/features/catalog/lib/search-params'
import { useUiStore } from '@/stores/ui'
import { cn } from '@/lib/utils'

/** Default (empty) search criteria, overridden with just `query` for instant header search. */
const EMPTY_CRITERIA: SearchCriteria = {
  query: undefined,
  categories: [],
  subcategory: undefined,
  materials: [],
  colors: [],
  badges: [],
  priceMin: undefined,
  priceMax: undefined,
  inStock: false,
  sort: 'newest',
}

const DEBOUNCE_MS = 150
const MAX_RESULTS = 6

/**
 * Header search overlay: a focus-trapped dialog with instant client-side
 * results as the visitor types, opened from the header's search button.
 * Debounces the raw keystrokes before querying so large/fast typing doesn't
 * re-filter the catalog on every character.
 */
export function SearchOverlay() {
  const open = useUiStore((s) => s.searchOpen)
  const closeSearch = useUiStore((s) => s.closeSearch)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [value, setValue] = useState('')
  const [deferredQuery, setDeferredQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)

  // Debounce the raw input into the value actually queried against the catalog.
  useEffect(() => {
    const timer = setTimeout(() => setDeferredQuery(value.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value])

  // Autofocus the searchbox each time the overlay opens (a side effect on an
  // external DOM node, not state — safe to run directly in an effect).
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Reset to a clean slate each time the overlay opens, using the "adjust
  // state during render" pattern (react.dev/learn/you-might-not-need-an-effect)
  // instead of a setState-in-effect, which avoids an extra cascading render.
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) {
      setValue('')
      setDeferredQuery('')
      setActiveIndex(-1)
    }
  }

  const results = useMemo(() => {
    if (!deferredQuery) return []
    return searchAndFilterProducts(getAllProducts(), { ...EMPTY_CRITERIA, query: deferredQuery }).slice(0, MAX_RESULTS)
  }, [deferredQuery])

  // Clear the highlighted result whenever the effective query changes.
  const [prevQuery, setPrevQuery] = useState(deferredQuery)
  if (prevQuery !== deferredQuery) {
    setPrevQuery(deferredQuery)
    setActiveIndex(-1)
  }

  function goToSearchPage() {
    if (!deferredQuery) return
    closeSearch()
    router.push(`/search?q=${encodeURIComponent(deferredQuery)}`)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (results.length) setActiveIndex((i) => (i + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (results.length) setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const active = activeIndex >= 0 ? results[activeIndex] : undefined
      if (active) {
        closeSearch()
        router.push(`/products/${active.slug}`)
      } else {
        goToSearchPage()
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeSearch()
      }}
    >
      <DialogContent className="top-[12%] max-w-lg -translate-y-0 gap-3 sm:max-w-lg">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <label htmlFor="header-search-input" className="sr-only">
          Search products
        </label>
        <Input
          id="header-search-input"
          ref={inputRef}
          role="searchbox"
          type="search"
          placeholder="Search jewelry, beads, materials…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div role="listbox" aria-label="Search results" className="flex flex-col gap-1">
          {!deferredQuery ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              Search jewelry, beads, materials…
            </p>
          ) : results.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              No results for &ldquo;{deferredQuery}&rdquo;
            </p>
          ) : (
            results.map((product, index) => (
              <Link
                key={product.id}
                href={`/products/${product.slug}`}
                onClick={() => closeSearch()}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  'flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted',
                  index === activeIndex && 'bg-muted',
                )}
              >
                <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                  {product.images[0] ? (
                    <Image
                      src={product.images[0].src}
                      alt={product.images[0].alt}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{product.name}</span>
                  <PriceDisplay product={product} className="text-xs" />
                </div>
              </Link>
            ))
          )}
        </div>

        {deferredQuery ? (
          <Link
            href={`/search?q=${encodeURIComponent(deferredQuery)}`}
            onClick={() => closeSearch()}
            className="text-center text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            See all results for &ldquo;{deferredQuery}&rdquo;
          </Link>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
