import Link from 'next/link'
import { cn } from '@/lib/utils'
import { siteConfig } from '@/lib/config'

interface LogoProps {
  className?: string
}

/** Wordmark in the display face, linking back to the homepage. */
export function Logo({ className }: LogoProps) {
  return (
    <Link
      href="/"
      className={cn(
        'font-display text-xl font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80',
        className,
      )}
    >
      {siteConfig.name}
    </Link>
  )
}
