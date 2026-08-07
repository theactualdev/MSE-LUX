import type { Metadata } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import { siteConfig } from '@/lib/config'
import '../globals.css'

const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })

export const metadata: Metadata = {
  title: `${siteConfig.name} — Private`,
  description: 'This store is currently private.',
  // The gate is the one page an unauthenticated crawler CAN reach — it must
  // never enter an index, and nothing behind it is crawlable anyway (the
  // proxy 307s every other route here).
  robots: { index: false, follow: false },
}

/**
 * Root layout for the (gate) route group — the THIRD root layout, beside
 * (storefront) and (admin), and a document shell only, for the same reason as
 * (admin)'s: it must not import the storefront chrome. `AppShell` reads the
 * category taxonomy from the database into the header — rendering it here
 * would leak catalog structure to unauthenticated visitors, which is exactly
 * what the gate exists to prevent.
 *
 * SECURITY INVARIANT (same shape as the (admin) one): everything in this
 * group is DELIBERATELY PUBLIC — the proxy exempts `/gate` by name. Never add
 * another route to this group; a sibling segment here would ship both
 * ungated by the proxy exemption's neighbour and outside the storefront
 * shell. The gate page is the only tenant.
 */
export default function GateRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  )
}
