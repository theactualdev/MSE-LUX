'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PriceDisplay } from '@/features/catalog/components/price-display'
import { searchCatalog, type SearchOverlayResult } from '@/features/catalog/search-action'
import { useUiStore } from '@/stores/ui'
import { cn } from '@/lib/utils'

const DEBOUNCE_MS = 250

const LISTBOX_ID = 'header-search-results'
const optionId = (index: number) => `${LISTBOX_ID}-option-${index}`

/**
 * Header search overlay: a focus-trapped dialog with client-side results
 * fetched from the real catalog as the visitor types, opened from the
 * header's search button. Raw keystrokes are debounced before querying the
 * `searchCatalog` Server Action so large/fast typing doesn't fire a request
 * per character.
 */
export function SearchOverlay() {
  const open = useUiStore((s) => s.searchOpen)
  const closeSearch = useUiStore((s) => s.closeSearch)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [value, setValue] = useState('')
  const [deferredQuery, setDeferredQuery] = useState('')
  const [results, setResults] = useState<SearchOverlayResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  // Debounce the raw input into the value actually queried against the catalog.
  useEffect(() => {
    const timer = setTimeout(() => setDeferredQuery(value.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value])

  // Seed `loading`/reset `results` the instant the debounced query changes,
  // using the "adjust state during render" pattern (react.dev/learn/you-might-not-need-an-effect
  // — the same idiom `book-shipment-dialog.tsx` uses) rather than a
  // setState-in-effect, which avoids an extra cascading render and keeps the
  // fetch effect below free of synchronous setState calls in its body.
  const [prevDeferredQuery, setPrevDeferredQuery] = useState(deferredQuery)
  if (prevDeferredQuery !== deferredQuery) {
    setPrevDeferredQuery(deferredQuery)
    setActiveIndex(-1)
    if (deferredQuery) {
      setLoading(true)
    } else {
      setResults([])
      setLoading(false)
    }
  }

  // Fetch results for the debounced query. An empty query never calls the
  // action (matches the action's own `< 2` chars guard and avoids a request
  // for the overlay's blank/prompt state). Guarded against races so a slow
  // earlier response can't clobber a faster later one, and against rejection
  // so a broken action never crashes the header.
  useEffect(() => {
    if (!deferredQuery) return
    let cancelled = false
    searchCatalog(deferredQuery)
      .then((found) => {
        if (cancelled) return
        setResults(found)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setResults([])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [deferredQuery])

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
      setResults([])
      setLoading(false)
      setActiveIndex(-1)
    }
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
          role="combobox"
          type="search"
          placeholder="Search jewelry, beads, materials…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-expanded={results.length > 0}
          aria-controls={LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 && results.length > 0 ? optionId(activeIndex) : undefined
          }
        />

        {!deferredQuery ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            Search jewelry, beads, materials…
          </p>
        ) : loading ? (
          <p role="status" className="px-1 py-6 text-center text-sm text-muted-foreground">
            Searching…
          </p>
        ) : results.length === 0 ? (
          <p role="status" className="px-1 py-6 text-center text-sm text-muted-foreground">
            No results for &ldquo;{deferredQuery}&rdquo;
          </p>
        ) : (
          <div id={LISTBOX_ID} role="listbox" aria-label="Search results" className="flex flex-col gap-1">
            {results.map((product, index) => (
              <Link
                key={product.slug}
                href={`/products/${product.slug}`}
                onClick={() => closeSearch()}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  'flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted',
                  index === activeIndex && 'bg-muted',
                )}
              >
                <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                  {product.image.src ? (
                    <Image
                      src={product.image.src}
                      alt={product.image.alt}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{product.name}</span>
                  <PriceDisplay product={{ priceSet: product.priceSet }} className="text-xs" />
                </div>
              </Link>
            ))}
          </div>
        )}

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
