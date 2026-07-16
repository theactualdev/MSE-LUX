'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface FilterDrawerProps {
  /** Current result count, shown on the sticky close button ("View N results"). */
  resultCount: number
  /** A `<FacetPanel />` (or equivalent) rendered inside the sheet body. */
  children: React.ReactNode
  className?: string
}

/**
 * Mobile-only entry point for the shared facet controls: a `lg:hidden`
 * "Filters" trigger that opens a slide-over `Sheet` containing `children`,
 * with a sticky "View N results" button that closes it. On `lg` and up this
 * renders nothing — the page is expected to render `FacetPanel` directly in
 * a sidebar instead.
 */
export function FilterDrawer({ resultCount, children, className }: FilterDrawerProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className={cn('lg:hidden', className)}>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <SlidersHorizontal aria-hidden="true" />
        Filters
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-4/5 max-w-sm flex-col">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4">{children}</div>

          <SheetFooter>
            <Button type="button" className="w-full" onClick={() => setOpen(false)}>
              View {resultCount} results
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
