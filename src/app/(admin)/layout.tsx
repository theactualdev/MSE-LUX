import type { Metadata } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import { siteConfig } from '@/lib/config'
import '../globals.css'

const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })

export const metadata: Metadata = {
  title: { default: `Admin · ${siteConfig.name}`, template: `%s · Admin · ${siteConfig.name}` },
  // Never index the admin area, whatever a crawler manages to see of it.
  robots: { index: false, follow: false },
}

/**
 * Root layout for the (admin) route group — document shell ONLY. The
 * requireRole gate deliberately lives one level down (admin/layout.tsx):
 * a not-found boundary can only catch throws from BELOW it, so a notFound()
 * thrown here in the root layout would escape (admin)/not-found.tsx and land
 * on Next's unstyled default 404. Keeping this layout logic-free is what
 * makes the branded 404 reachable.
 *
 * SECURITY INVARIANT: because this root layout is ungated, every admin route
 * MUST live under `admin/` (below admin/layout.tsx's requireRole gate). A
 * sibling segment added here — e.g. (admin)/reports/page.tsx — would ship
 * UNGATED at a bare URL like /reports. Never add routes at this level.
 */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  )
}
