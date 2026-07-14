import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function NotFound() {
  return (
    <Container className="flex flex-col items-center gap-6 py-24 text-center sm:py-32">
      <h1 className="font-display text-4xl font-semibold text-foreground sm:text-5xl">
        Page not found
      </h1>
      <p className="max-w-md text-sm text-muted-foreground sm:text-base">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved. Let&apos;s
        get you back to something beautiful.
      </p>
      <Link href="/" className={cn(buttonVariants())}>
        Return home
      </Link>
    </Container>
  )
}
