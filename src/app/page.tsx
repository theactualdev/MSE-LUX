import type { Metadata } from 'next'
import { Hero } from '@/features/catalog/components/home/hero'
import { FeaturedCategories } from '@/features/catalog/components/home/featured-categories'
import { BestSellers } from '@/features/catalog/components/home/best-sellers'
import { PromoBanner } from '@/features/catalog/components/home/promo-banner'
import { BrandStory } from '@/features/catalog/components/home/brand-story'
import { NewArrivals } from '@/features/catalog/components/home/new-arrivals'
import { FeaturedCollections } from '@/features/catalog/components/home/featured-collections'
import { InstagramGallery } from '@/features/catalog/components/home/instagram-gallery'
import { Testimonials } from '@/features/catalog/components/home/testimonials'

export const metadata: Metadata = {
  title: 'Handmade Jewelry, Beads & Accessories',
  description:
    'MSE Lux — handmade beads, jewelry, and accessories crafted in Lagos. Shop best sellers, new arrivals, and curated collections.',
}

export default function Home() {
  return (
    <>
      <Hero />
      <FeaturedCategories />
      <BestSellers />
      <PromoBanner />
      <BrandStory />
      <NewArrivals />
      <FeaturedCollections />
      <InstagramGallery />
      <Testimonials />
    </>
  )
}
