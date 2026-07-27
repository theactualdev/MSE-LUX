import type { Metadata } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import { AppShell } from '@/components/layout/app-shell'
import { JsonLd } from '@/components/seo/json-ld'
import { siteConfig } from '@/lib/config'
import { organizationJsonLd, SITE_URL } from '@/lib/seo'
import '../globals.css'

const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })

// `alternates.canonical` deliberately lives on individual pages, not here —
// a layout-level canonical would apply to every route beneath it (including
// dynamic product/category pages) and mis-canonicalise the whole storefront.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: siteConfig.name, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
  // `url` is deliberately absent: Next resolves a page's openGraph against
  // this parent object, so a layout-level `url` would make EVERY page claim
  // the homepage as its og:url — social platforms key unfurls and engagement
  // off that, so shares of /about would be attributed to /. Pages that care
  // set their own openGraph.url (the PDP and listings do).
  //
  // `images` is likewise absent until the asset exists: referencing a missing
  // /og-default.png would hand scrapers a 404 that Facebook/LinkedIn cache
  // per-URL, so a pre-launch share would keep showing a broken image well
  // after the real file lands. TODO(seo/pre-launch): produce a 1200x630
  // on-palette ivory/gold wordmark at public/og-default.png and add it here
  // (Phase 9d runbook item).
  openGraph: {
    type: 'website',
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
  },
  twitter: {
    card: 'summary_large_image',
  },
}

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body>
        {/* Sitewide Organization JSON-LD, emitted once here rather than per-page. */}
        <JsonLd data={organizationJsonLd()} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
