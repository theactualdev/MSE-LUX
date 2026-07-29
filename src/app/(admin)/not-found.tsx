import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-3xl font-semibold text-foreground">Page not found</h1>
      <p className="text-sm text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist.</p>
      {/* The only way out of a dead end — and this is also what a signed-in
          non-admin gets from `requireRole`'s notFound(), so it must read as
          the obvious next step rather than as body text. */}
      <Link href="/" className={cn(buttonVariants())}>
        Back to the store
      </Link>
    </main>
  )
}
