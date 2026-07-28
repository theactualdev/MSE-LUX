import { cn } from '@/lib/utils'

interface AnnouncementBarProps {
  message?: string
  className?: string
}

/**
 * Any claim here ships on EVERY storefront page, so it must be true of the code.
 * The previous default promised free shipping over ₦150,000; no such threshold
 * exists — `placeOrder` charges the quoted shipping amount unconditionally
 * (`checkout/data.ts`). Do not reinstate a promise the checkout can't honour.
 */
const DEFAULT_MESSAGE = 'Handcrafted in Lagos — shipping worldwide'

/** Thin, single-line promotional strip above the header. */
export function AnnouncementBar({ message = DEFAULT_MESSAGE, className }: AnnouncementBarProps) {
  return (
    <div
      className={cn(
        'w-full bg-accent px-4 py-2 text-center text-xs font-medium tracking-wide text-accent-foreground sm:text-sm',
        className,
      )}
    >
      {message}
    </div>
  )
}
