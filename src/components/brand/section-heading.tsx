import { cn } from '@/lib/utils'

interface SectionHeadingProps {
  title: string
  subtitle?: string
  className?: string
  /** Heading level to render. Defaults to `h2`. */
  as?: 'h1' | 'h2' | 'h3'
}

/** Display-font section title with an optional muted subtitle. */
export function SectionHeading({ title, subtitle, className, as: Tag = 'h2' }: SectionHeadingProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Tag className="font-display text-2xl font-semibold text-foreground sm:text-3xl">{title}</Tag>
      {subtitle ? <p className="text-sm text-muted-foreground sm:text-base">{subtitle}</p> : null}
    </div>
  )
}
