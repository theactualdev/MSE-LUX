import { cn } from '@/lib/utils'

interface AnnouncementBarProps {
  message?: string
  className?: string
}

const DEFAULT_MESSAGE = 'Handcrafted in Lagos — complimentary shipping on orders over ₦150,000'

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
