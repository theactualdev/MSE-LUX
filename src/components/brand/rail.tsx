import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Horizontal scroll-snap track for home-page sections (Phase: landing-page
 * density pass). Replaces a wrapping grid with a single row: six tiles at
 * three-across is two rows tall, the same six in a rail is one — which is
 * where most of the page-height saving comes from, and it is largest on
 * mobile where those grids collapse to a single column.
 *
 * Same CSS scroll-snap mechanism as the PDP gallery
 * (`catalog/components/product-gallery.tsx`) rather than a carousel library:
 * no dependency, no JS, works before hydration, and native momentum scrolling
 * on touch is better than anything we would reimplement.
 *
 * DELIBERATELY NOT a client component and deliberately no arrow buttons. Every
 * caller is an async server component, so keeping this server-rendered avoids
 * pushing four sections into the client bundle for a scroll affordance the
 * platform already provides. Discoverability comes from the peek (see
 * `itemClassName` widths) — the next tile is always partly visible, which is
 * what tells a reader there is more.
 *
 * ACCESSIBILITY: the track is focusable (`tabIndex={0}`) with an accessible
 * name, so a keyboard user can reach it and scroll with the arrow keys — a
 * scroll container that cannot be focused is unreachable without a pointer.
 * `aria-label` is required for that reason, not optional decoration.
 */
export function Rail({
  children,
  label,
  className,
}: {
  children: ReactNode
  /** Announced to screen readers, e.g. "Shop by category". Required — see the a11y note above. */
  label: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      tabIndex={0}
      className={cn(
        'flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2',
        // Full-bleed on mobile: the track runs edge to edge so a tile can sit
        // half off-screen (the peek), while the negative margin + padding keep
        // the first tile aligned to the Container's content column.
        '-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
        // scroll-padding MUST mirror that padding. A snapport defaults to the
        // padding box, so on load the browser snapped the first `snap-start`
        // item flush to the track edge — scrolling the row by exactly the
        // padding and destroying the left gutter. It only showed on rails that
        // actually overflow; the short ones have nothing to scroll and looked
        // fine, which is what made it a half-page bug rather than an obvious one.
        'scroll-pl-4 sm:scroll-pl-6 lg:scroll-pl-8',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * One rail item. `shrink-0` is what stops flex collapsing every child to fit —
 * without it the row silently becomes a squashed grid and scrolls nowhere.
 *
 * The default widths are chosen so the next tile always peeks: ~78% on mobile
 * (one and a bit), then 2-up, then 3-up. Pass `className` to override for a
 * section that wants a different density (the Instagram strip runs denser).
 */
export function RailItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('w-[78%] shrink-0 snap-start sm:w-[46%] lg:w-[31%]', className)}>{children}</div>
  )
}
