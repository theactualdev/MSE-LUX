import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A single, tasteful promotional block between the merchandising rows —
 * solid brand tokens only (no gradient, no imagery), just a brand claim,
 * a short line of copy, and one CTA.
 */
export function PromoBanner() {
  return (
    <section className="bg-foreground text-background">
      <Container className="flex flex-col items-center gap-4 py-16 text-center sm:py-20">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-background/70">
          Handmade in Lagos
        </p>
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">
          Complimentary gift wrapping on every order
        </h2>
        <p className="max-w-md text-sm text-background/80 sm:text-base">
          Every piece is packaged by hand and ready to gift, no matter the occasion.
        </p>
        <Link
          href="/collections"
          className={cn(buttonVariants(), 'mt-2 bg-background text-foreground hover:bg-background/90')}
        >
          Explore the edit
        </Link>
      </Container>
    </section>
  )
}
