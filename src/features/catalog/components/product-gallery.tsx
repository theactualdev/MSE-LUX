'use client'

import { useRef, useState, type PointerEvent } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/catalog'

type GalleryImage = Product['images'][number]

interface ProductGalleryProps {
  images: GalleryImage[]
  className?: string
}

/** Scale applied to the active image under the pointer during zoom. */
const ZOOM_SCALE = 2

/**
 * PDP image viewer: a CSS scroll-snap track (swipeable on touch, arrow-button
 * navigable on keyboard) with a thumbnail rail, plus pointer-move zoom on the
 * active image. Zoom is CSS-only (a transform + transform-origin driven by
 * pointer position) and is skipped entirely for touch pointers and when the
 * shopper prefers reduced motion.
 */
export function ProductGallery({ images, className }: ProductGalleryProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [activeIndex, setActiveIndex] = useState(0)
  const [zoomOrigin, setZoomOrigin] = useState<{ x: number; y: number } | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const count = images.length

  if (count === 0) return null

  const goTo = (index: number) => {
    const clamped = Math.max(0, Math.min(count - 1, index))
    setActiveIndex(clamped)
    setZoomOrigin(null)
    trackRef.current?.children[clamped]?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || prefersReducedMotion) return
    const rect = event.currentTarget.getBoundingClientRect()
    setZoomOrigin({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    })
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-muted">
        <div
          ref={trackRef}
          role="region"
          aria-roledescription="carousel"
          aria-label="Product images"
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((image, index) => (
            <div
              key={`${image.src}-${index}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}`}
              className="relative h-full w-full shrink-0 snap-center"
              onPointerMove={index === activeIndex ? handlePointerMove : undefined}
              onPointerLeave={index === activeIndex ? () => setZoomOrigin(null) : undefined}
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                priority={index === 0}
                sizes="(min-width: 1024px) 50vw, 100vw"
                className={cn(
                  'object-cover',
                  index === activeIndex &&
                    !prefersReducedMotion &&
                    (zoomOrigin ? 'transition-none' : 'transition-transform duration-300 ease-out'),
                )}
                style={
                  index === activeIndex && zoomOrigin
                    ? { transform: `scale(${ZOOM_SCALE})`, transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%` }
                    : undefined
                }
              />
            </div>
          ))}
        </div>

        {count > 1 ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon-xl"
              aria-label="Previous image"
              disabled={activeIndex === 0}
              onClick={() => goTo(activeIndex - 1)}
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2 bg-background shadow-sm"
            >
              <ChevronLeft aria-hidden="true" className="size-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-xl"
              aria-label="Next image"
              disabled={activeIndex === count - 1}
              onClick={() => goTo(activeIndex + 1)}
              className="absolute right-3 top-1/2 z-10 -translate-y-1/2 bg-background shadow-sm"
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </Button>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div role="tablist" aria-label="Select product image" className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={`${image.src}-thumb-${index}`}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={`View image ${index + 1} of ${count}`}
              onClick={() => goTo(index)}
              className={cn(
                'relative size-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:size-20',
                index === activeIndex && 'ring-2 ring-ring',
              )}
            >
              <Image src={image.src} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
