import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ContainerProps {
  children: ReactNode
  className?: string
  /** Element (or component) to render as. Defaults to `div`. */
  as?: ElementType
}

/**
 * Centered max-width wrapper with 8-pt horizontal padding.
 * Use for any section that should align to the site's content column.
 */
export function Container({ children, className, as: Tag = 'div' }: ContainerProps) {
  return (
    <Tag className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)}>
      {children}
    </Tag>
  )
}
