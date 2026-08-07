import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A single, tasteful promotional block between the merchandising rows —
 * solid brand tokens only (no gradient, no imagery), just a brand claim,
 * a short line of copy, and one CTA.
 *
 * This block used to promise "complimentary gift wrapping on every order",
 * which was a real commitment with nothing behind it: no order surfaces a
 * wrapping request to the studio, so honouring it depended on someone
 * remembering. The claim was removed rather than built, on the owner's call.
 *
 * What replaced it is deliberately a statement about how the work is already
 * done — small batches, hand-finished, no two alike — which is the same thing
 * the FAQ tells customers about natural variation. A claim that is true by
 * construction cannot fall out of sync with fulfilment. If a promotional
 * promise ever needs a process behind it, build the process first.
 */
export function PromoBanner() {
  return (
    <section className="bg-foreground text-background">
      <Container className="flex flex-col items-center gap-4 py-16 text-center sm:py-20">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-background/70">
          Handmade in Lagos
        </p>
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">
          Made one piece at a time
        </h2>
        <p className="max-w-md text-sm text-background/80 sm:text-base">
          Every piece is worked by hand in small batches, so no two are ever exactly alike.
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
