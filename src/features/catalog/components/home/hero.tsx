'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Container } from '@/components/brand/container'
import { buttonVariants } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/use-media-query'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'

/**
 * Client-supplied hero clips, served from the public Supabase Storage `media`
 * bucket. Two cuts, because one aspect ratio cannot serve both viewports: the
 * portrait clip fills a phone but would crop to a narrow centre strip on
 * desktop, and the landscape cut is the reverse. Each poster is a frame pulled
 * from its own clip, so it is simultaneously the instant paint, the `<video>`
 * poster, and the still shown to viewers who prefer reduced motion.
 *
 * ⚠️ QUALITY DEBT — the landscape cut is a WhatsApp export and is **576×320**.
 * That is a 3.3x upscale on a 1920px display and it looks soft full-bleed. It
 * also carries "MSE LUX / Redefining Luxury" burned into the pixels, which
 * duplicates the `<h1>` below in a form no screen reader or translation can
 * reach, and its sides are blurred/black padding from a phone-shot source.
 * Re-export from the original at 1920x1080 with no text overlay and swap the
 * URL — everything else here is already correct. See docs/LAUNCH.md §9.
 */
const HERO_VIDEO_PORTRAIT =
  'https://xpzmwfxqiunubuagsfcy.supabase.co/storage/v1/object/public/media/hero/MSE%20LUX.mp4'
const HERO_VIDEO_LANDSCAPE =
  'https://xpzmwfxqiunubuagsfcy.supabase.co/storage/v1/object/public/media/hero/WhatsApp%20Video%202026-07-30%20at%2000.38.07.mp4'
const HERO_POSTER_PORTRAIT = '/hero-poster.jpg'
const HERO_POSTER_LANDSCAPE = '/hero-poster-landscape.jpg'

/**
 * Hydration detector, in the same `useSyncExternalStore` shape as
 * `useMediaQuery`. The store never changes, so `subscribe` is a no-op: the
 * value flips purely because React uses the server snapshot while hydrating
 * and the client snapshot afterwards. Preferred over `useState` +
 * `useEffect(() => setMounted(true))`, which the `react-hooks/set-state-in-effect`
 * lint rule rejects.
 */
const subscribeNoop = () => () => {}

/**
 * Full-bleed storefront hero: edge-to-edge media, a Playfair headline, short
 * subcopy, and a single CTA into the collections shop. Each viewport gets the
 * clip cut for its shape — portrait on phones, landscape above them — and
 * reduced-motion viewers get that clip's poster frame as a still instead. The
 * text block fades/slides in on mount and skips the motion entirely when the
 * shopper prefers reduced motion.
 */
export function Hero() {
  const prefersReducedMotion = usePrefersReducedMotion()
  const isPhone = useMediaQuery('(max-width: 767px)')

  // Both hooks report `false` during SSR and the first client render, so until
  // this flips we do not yet know which cut belongs on screen. Rendering a
  // <video> during that window is not free: measured against the real page, a
  // phone began fetching the *landscape* clip before the media query resolved
  // and only then swapped to the portrait one. Holding the poster still until
  // hydration costs nothing visually — it is the frame the video opens on —
  // and means exactly one clip is ever requested.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false)

  const videoSrc = isPhone ? HERO_VIDEO_PORTRAIT : HERO_VIDEO_LANDSCAPE
  const poster = isPhone ? HERO_POSTER_PORTRAIT : HERO_POSTER_LANDSCAPE

  return (
    <section className="relative h-[70vh] min-h-[520px] w-full overflow-hidden sm:h-[80vh] lg:h-[90vh]">
      {!mounted || prefersReducedMotion ? (
        <Image
          src={poster}
          alt="MSE Lux handmade jewelry, beads, and accessories"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      ) : (
        <video
          // `key` forces a remount when the source changes: React patches the
          // `src` attribute in place otherwise, and a <video> that has already
          // begun loading ignores a changed src until `.load()` is called — so
          // crossing the breakpoint would leave the previous cut playing.
          key={videoSrc}
          className="absolute inset-0 h-full w-full object-cover"
          src={videoSrc}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          // The poster is the LCP paint and lands in ~20KB; the clip can stream
          // in behind it. `auto` would have the video race the fonts and the
          // above-the-fold images for bandwidth on a Lagos mobile connection.
          preload="metadata"
          aria-hidden="true"
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
