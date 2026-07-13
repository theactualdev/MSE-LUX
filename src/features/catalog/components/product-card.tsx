'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Heart } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PriceDisplay } from '@/features/catalog/components/price-display'
import { useWishlistStore } from '@/features/wishlist/store'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/catalog'

interface ProductCardProps {
  product: Product
  className?: string
}

/** Framer Motion variants for the hero image zoom; inherited from the card's hover state. */
const imageVariants = {
  rest: { scale: 1 },
  hover: { scale: 1.06 },
}

/**
 * Premium, photography-forward product card: edge-to-edge hero image, name,
 * price, and badges, all linking to the PDP — plus a wishlist toggle that
 * lives outside the link (a sibling, not nested inside it) so it stays its
 * own accessible, independently-clickable control instead of an invalid
 * button-inside-anchor.
 */
export function ProductCard({ product, className }: ProductCardProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const isWishlisted = useWishlistStore((s) => s.has(product.id))
  const toggleWishlist = useWishlistStore((s) => s.toggle)

  const hero = product.images[0]
  const wishlistLabel = `${isWishlisted ? 'Remove' : 'Add'} ${product.name} ${isWishlisted ? 'from' : 'to'} wishlist`

  return (
    <motion.article
      initial="rest"
      whileHover={prefersReducedMotion ? undefined : 'hover'}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-border transition-shadow duration-300 hover:shadow-lg',
        className,
      )}
    >
      <Link href={`/products/${product.slug}`} className="flex flex-1 flex-col rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
          <motion.div
            variants={imageVariants}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            {hero ? (
              <Image
                src={hero.src}
                alt={hero.alt}
                fill
                sizes="(min-width: 1280px) 23vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
                className="object-cover"
              />
            ) : null}
          </motion.div>

          {product.badges.length > 0 ? (
            <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
              {product.badges.includes('new') ? (
                <Badge className="bg-background/90 uppercase tracking-wide text-foreground backdrop-blur">New</Badge>
              ) : null}
              {product.badges.includes('best-seller') ? (
                <Badge className="uppercase tracking-wide">Bestseller</Badge>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <h3 className="font-display text-base font-medium leading-snug text-foreground">{product.name}</h3>
          <PriceDisplay product={product} />
        </div>
      </Link>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          toggleWishlist(product.id)
        }}
        aria-pressed={isWishlisted}
        aria-label={wishlistLabel}
        className="absolute right-3 top-3 z-20 inline-flex size-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Heart aria-hidden="true" className={cn('size-4.5 transition-colors', isWishlisted && 'fill-accent text-accent')} />
      </button>
    </motion.article>
  )
}
