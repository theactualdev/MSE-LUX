import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { WishlistView } from '@/features/wishlist/components/wishlist-view'
import { getCurrentUserId } from '@/features/auth/claims'
import { getShareState } from '@/features/gifting/share'
import { listAddresses } from '@/features/account/data'

export const metadata: Metadata = {
  title: 'Wishlist',
  description: 'Review the pieces you have saved to your wishlist.',
  robots: { index: false },
}

/**
 * Deliberately not `requireUser()`-gated — unlike `/account/*`, a guest can
 * use this page (their wishlist just lives in `localStorage`). `shareState`
 * is only meaningful for a signed-in owner, so it's read straight from the
 * session rather than gating the whole route: `null` when signed out (the
 * `SharePanel` "sign in to share" state), the real state otherwise.
 * `listAddresses()` already returns `[]` when unauthenticated, so it's safe
 * to call unconditionally rather than branching on `userId` twice.
 */
export default async function WishlistPage() {
  const userId = await getCurrentUserId()
  const [shareState, addresses] = await Promise.all([
    userId ? getShareState(userId) : Promise.resolve(null),
    listAddresses(),
  ])

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading title="Wishlist" as="h1" />
      <WishlistView shareState={shareState} addresses={addresses} />
    </Container>
  )
}
