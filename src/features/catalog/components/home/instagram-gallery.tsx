import Image from 'next/image'
import { Container } from '@/components/brand/container'
import { SectionHeading } from '@/components/brand/section-heading'
import { siteConfig } from '@/lib/config'
import { instagramPosts } from '@/features/catalog/data/home'

/** Derives a readable "@handle" from the configured Instagram profile URL. */
function instagramHandle(url: string): string {
  const slug = url.replace(/\/+$/, '').split('/').pop() ?? ''
  return `@${slug}`
}

/**
 * Responsive tile grid of recent Instagram imagery. Every tile links out to
 * the storefront's Instagram profile in a new tab.
 */
export function InstagramGallery() {
  const handle = instagramHandle(siteConfig.social.instagram)

  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title="Follow Along" subtitle="Shop the look and see the atelier in action." />
        <a
          href={siteConfig.social.instagram}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          {handle}
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        {instagramPosts.map((post) => (
          <a
            key={post.src}
            href={post.href ?? siteConfig.social.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative aspect-square w-full overflow-hidden rounded-xl"
          >
            <Image
              src={post.src}
              alt={post.alt}
              fill
              sizes="(min-width: 1024px) 16vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          </a>
        ))}
      </div>
    </Container>
  )
}
