import type { Metadata } from 'next'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { resolveShare } from '@/features/gifting/share'
import { resolveProductsByIds } from '@/features/catalog/server/resolve-products'
import { GiftSelection } from '@/features/gifting/components/gift-selection'
import { checkRateLimit } from '@/lib/rate-limit'

export const metadata: Metadata = {
  title: 'A gift for you',
  robots: { index: false, follow: false },
}

/**
 * Public, token-capability landing page a gift buyer opens from a shared
 * link. `resolveShare` collapses "token never existed", "sharing disabled",
 * and "nominated address deleted" into the SAME null — this page renders one
 * neutral not-found state for all three, the same copy pattern as the
 * newsletter confirm/unsubscribe pages, so a visitor can never learn which
 * case they hit.
 *
 * Buyer-facing recipient identity is first name + city/state ONLY —
 * `share.address` (the recipient's full street address) is never read here
 * and never reaches a client component; it stays server-only end to end.
 *
 * Prices render in the BUYER's own display currency (they're the one
 * paying), not the recipient's locality: `PriceDisplay`, rendered inside
 * `GiftSelection`, reads that from `CurrencyProvider`'s client context/geo
 * cookie — the exact same mechanism every other storefront price uses (see
 * `ProductCard`) — so there is no separate currency resolution to do on this
 * page.
 *
 * Rate-limited (`wishlistShare` — see that bucket's doc in `lib/rate-limit.ts`,
 * "Public share-page reads and gift-checkout actions"): each render here does
 * a Wishlist+items join plus a `resolveProductsByIds` over the full product
 * relation graph, exactly the DB round-trips the bucket exists to bound. On a
 * limit hit this renders the SAME neutral not-found state as an unresolvable
 * token, deliberately — a distinguishable "rate limited" state would itself
 * tell a prober the token is real, undoing `resolveShare`'s own null-collapse.
 */
export default async function SharedWishlistPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const allowed = await checkRateLimit('wishlistShare')
  const share = allowed ? await resolveShare(token) : null

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

  const products = await resolveProductsByIds(share.productIds)

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading
        as="h1"
        title={`A gift for ${share.recipientFirstName}`}
        subtitle={`Delivering to ${share.city}, ${share.state}`}
      />
      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Heart aria-hidden="true" className="size-10 text-muted-foreground" />
          <h2 className="font-display text-xl font-medium text-foreground">Nothing saved here yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {share.recipientFirstName} hasn&rsquo;t added anything to this wishlist yet — check back later.
          </p>
        </div>
      ) : (
        <GiftSelection token={token} products={products} />
      )}
    </Container>
  )
}
