'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Container } from '@/components/brand/container'
import { buttonVariants } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/use-media-query'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'

/**
 * Client-supplied hero clip, served from the public Supabase Storage `media`
 * bucket. It's a 576×1024 *portrait* video: it suits a phone viewport but would
 * crop to a narrow center strip (and look soft) in the full-bleed desktop hero,
 * so it is shown on phones only. Desktop keeps the landscape still below until a
 * 16:9 landscape cut is supplied. `/hero-poster.jpg` is a frame extracted from
 * the clip — it is the instant-paint image, the `<video>` poster, and the
 * static fallback for viewers who prefer reduced motion.
 */
const HERO_VIDEO_MP4 =
  'https://xpzmwfxqiunubuagsfcy.supabase.co/storage/v1/object/public/media/hero/MSE%20LUX.mp4'
const HERO_POSTER = '/hero-poster.jpg'

/**
 * Full-bleed storefront hero: edge-to-edge media, a Playfair headline, short
 * subcopy, and a single CTA into the collections shop. On phones the media is an
 * autoplaying muted loop of the client's vertical clip; everywhere else (and for
 * reduced-motion viewers) it is a still image. The text block fades/slides in on
 * mount and skips the motion entirely when the shopper prefers reduced motion.
 */
export function Hero() {
  const prefersReducedMotion = usePrefersReducedMotion()
  // Phones only. `useMediaQuery` returns false during SSR and initial hydration,
  // so the landscape still renders first everywhere and phones swap to the video
  // after mount — no hydration mismatch, and desktop never loads the video.
  const isPhone = useMediaQuery('(max-width: 767px)')
  const showVideo = isPhone && !prefersReducedMotion

  return (
    <section className="relative h-[70vh] min-h-[520px] w-full overflow-hidden sm:h-[80vh] lg:h-[90vh]">
      {showVideo ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={HERO_VIDEO_MP4}
          poster={HERO_POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        />
      ) : isPhone ? (
        // Reduced-motion phones: the static poster frame, never the autoplay clip.
        <Image
          src={HERO_POSTER}
          alt="MSE Lux handmade jewelry, beads, and accessories"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      ) : (
        // Desktop / tablet: landscape still (placeholder until a 16:9 hero cut lands).
        <Image
          src="https://picsum.photos/seed/mselux-hero/1920/1200"
          alt="Model wearing layered MSE Lux gold necklaces and stacked bracelets"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      )}
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
              <Link href="/collections" className={cn(buttonVariants())}>
                Shop the collections
              </Link>
            </div>
          </motion.div>
        </Container>
      </div>
    </section>
  )
}
