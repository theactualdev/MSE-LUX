import type { Metadata } from 'next'
import Link from 'next/link'
import { Undo2 } from 'lucide-react'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { resolveShare } from '@/features/gifting/share'
import { GiftCheckout } from '@/features/gifting/components/gift-checkout'
import { parseSelections } from '@/features/gifting/lib/parse-selections'

export const metadata: Metadata = {
  title: 'Gift checkout',
  robots: { index: false, follow: false },
}

/**
 * Public, token-capability gift checkout — the last step of the shared-
 * wishlist flow started at `/wishlist/shared/[token]`. `noindex` (via
 * `metadata.robots`), same as that page: a capability URL has no business in
 * a search index.
 *
 * `resolveShare` collapses "token never existed", "sharing disabled", and
 * "nominated address deleted" into the SAME null, exactly as the share page
 * treats it — this page renders the identical neutral not-found state for
 * all three, so a visitor can never distinguish which case they hit.
 *
 * Only `recipientFirstName` and `city` — never `share.address`, the
 * recipient's full street address — are read from the resolved share and
 * passed to the client component below. That is deliberate and load-bearing:
 * `resolveShare` is `server-only` specifically so the address it returns can
 * never reach a client bundle, and this page is the boundary that must not
 * undo that by forwarding the wrong field.
 */
export default async function GiftCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ selections?: string | string[] }>
}) {
  const { token } = await params
  const { selections: rawSelections } = await searchParams

  const share = await resolveShare(token)

  if (!share) {
    return (
      <Container className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-16 text-center">
        <h1 className="font-display text-3xl font-semibold text-foreground">This link isn&apos;t valid</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          This wishlist is no longer available to view. Ask whoever sent you the link for a fresh one.
        </p>
        <Link href="/" className={cn(buttonVariants())}>
          Back to the store
        </Link>
      </Container>
    )
  }

  const selections = parseSelections(rawSelections)

  if (!selections) {
    return (
      <Container className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-16 text-center">
        <Undo2 aria-hidden="true" className="size-10 text-muted-foreground" />
        <h1 className="font-display text-3xl font-semibold text-foreground">Let&apos;s start again</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          We couldn&apos;t read what you picked out for {share.recipientFirstName}. Head back to the wishlist and
          choose again.
        </p>
        <Link href={`/wishlist/shared/${token}`} className={cn(buttonVariants())}>
          Back to the wishlist
        </Link>
      </Container>
    )
  }

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading as="h1" title={`A gift for ${share.recipientFirstName}`} subtitle={`Delivering to ${share.city}`} />
      <GiftCheckout
        token={token}
        selections={selections}
        recipientFirstName={share.recipientFirstName}
        city={share.city}
      />
    </Container>
  )
}
