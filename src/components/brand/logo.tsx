import Link from 'next/link'
import { cn } from '@/lib/utils'
import { siteConfig } from '@/lib/config'

interface LogoProps {
  className?: string
}

/**
 * Wordmark in the display face, linking back to the homepage.
 *
 * Set in caps to match the brand logo, via `uppercase` rather than a
 * capitalised string: the DOM text stays "MSE Lux", so screen readers announce
 * the name normally instead of spelling it out, and everything keyed to
 * `siteConfig.name` — page titles, og:site_name, the Organization schema —
 * keeps its natural casing. Caps need the extra tracking; at `tracking-tight`
 * the letters collide.
 *
 * `whitespace-nowrap` is load-bearing, not tidying. The tracking widens the
 * wordmark enough that on a 320px phone it broke across two lines — "MSE"
 * above "LUX" — doubling the header's height. A wordmark is a single object
 * and must never wrap.
 */
export function Logo({ className }: LogoProps) {
  return (
    <Link
      href="/"
      className={cn(
        'font-display text-xl font-semibold uppercase tracking-[0.12em] whitespace-nowrap text-foreground transition-opacity hover:opacity-80',
        className,
      )}
    >
      {siteConfig.name}
    </Link>
  )
}
