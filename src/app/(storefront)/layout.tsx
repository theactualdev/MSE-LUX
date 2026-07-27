import type { Metadata } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import { AppShell } from '@/components/layout/app-shell'
import { siteConfig } from '@/lib/config'
import { SITE_URL } from '@/lib/seo'
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
  openGraph: {
    type: 'website',
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
    url: SITE_URL,
    // TODO(seo/pre-launch): /og-default.png is a placeholder reference — no
    // asset exists yet in public/. A 1200x630 on-palette ivory/gold wordmark
    // image must be produced and added before launch (Phase 9d runbook item).
    images: ['/og-default.png'],
  },
  twitter: {
    card: 'summary_large_image',
  },
}

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
