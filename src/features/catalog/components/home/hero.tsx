'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Container } from '@/components/brand/container'
import { Button } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'

/**
 * Full-bleed storefront hero: edge-to-edge photography, a Playfair headline,
 * short subcopy, and a single CTA into the collections shop. The text block
 * fades/slides in on mount and skips the motion entirely when the shopper
 * prefers reduced motion.
 */
export function Hero() {
  const prefersReducedMotion = usePrefersReducedMotion()

  return (
    <section className="relative h-[70vh] min-h-[520px] w-full overflow-hidden sm:h-[80vh] lg:h-[90vh]">
      <Image
        src="https://picsum.photos/seed/mselux-hero/1920/1200"
        alt="Model wearing layered MSE Lux gold necklaces and stacked bracelets"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-foreground/35" aria-hidden="true" />

      <div className="relative flex h-full items-end">
        <Container className="pb-12 sm:pb-16 lg:pb-20">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="flex max-w-xl flex-col gap-4 text-background"
          >
            <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              Handcrafted pieces, worn every day
            </h1>
            <p className="text-base text-background/85 sm:text-lg">
              Beads, jewelry, and accessories made by hand in Lagos — for the moments that matter,
              and the ones in between.
            </p>
            <div className="pt-2">
              <Button render={<Link href="/collections">Shop the collections</Link>} />
            </div>
          </motion.div>
        </Container>
      </div>
    </section>
  )
}
