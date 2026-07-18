import type { Metadata } from 'next'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { WishlistView } from '@/features/wishlist/components/wishlist-view'

export const metadata: Metadata = {
  title: 'Wishlist',
  description: 'Review the pieces you have saved to your wishlist.',
}

export default function WishlistPage() {
  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <SectionHeading title="Wishlist" as="h1" />
      <WishlistView />
    </Container>
  )
}
