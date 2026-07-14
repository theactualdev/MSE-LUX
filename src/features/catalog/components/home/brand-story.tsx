'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Container } from '@/components/brand/container'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'
import { brandStory } from '@/features/catalog/data/home'

/**
 * Editorial brand-story block: a tall atelier photograph beside a Playfair
 * heading and a short narrative, closing with a link into the full `/about`
 * page. Copy fades/slides in on mount, skipping the motion for shoppers who
 * prefer reduced motion.
 */
export function BrandStory() {
  const prefersReducedMotion = usePrefersReducedMotion()

  return (
    <Container className="py-12 sm:py-16 lg:py-24">
      <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl sm:aspect-[3/4]">
          <Image
            src={brandStory.image}
            alt={brandStory.imageAlt}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        </div>

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-6"
        >
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {brandStory.eyebrow}
          </p>
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            {brandStory.heading}
          </h2>
          <div className="flex flex-col gap-4 text-sm text-muted-foreground sm:text-base">
            {brandStory.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
          </div>
          <Link
            href="/about"
            className="w-fit text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Read our story
          </Link>
        </motion.div>
      </div>
    </Container>
  )
}
