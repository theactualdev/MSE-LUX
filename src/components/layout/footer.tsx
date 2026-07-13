import Link from 'next/link'
import { Container } from '@/components/brand/container'
import { Logo } from '@/components/brand/logo'
import { NewsletterForm } from '@/components/layout/newsletter-form'
import { Separator } from '@/components/ui/separator'
import { siteConfig } from '@/lib/config'

const LEGAL_LINKS = [
  { label: 'Shipping & Returns', href: '/policies/shipping-returns' },
  { label: 'Privacy Policy', href: '/policies/privacy' },
  { label: 'Terms of Service', href: '/policies/terms' },
]

/** Site footer: nav columns, legal links, newsletter signup, and social. */
export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <Container className="flex flex-col gap-10 py-12 sm:py-16">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {siteConfig.nav.map((item) =>
            item.children && item.children.length > 0 ? (
              <div key={item.href} className="flex flex-col gap-3">
                <span className="font-display text-sm font-medium text-foreground">{item.label}</span>
                <ul className="flex flex-col gap-2">
                  {item.children.map((child) => (
                    <li key={child.href}>
                      <Link href={child.href} className="text-sm text-muted-foreground hover:text-foreground">
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div key={item.href} className="flex flex-col gap-3">
                <Link
                  href={item.href}
                  className="font-display text-sm font-medium text-foreground hover:text-muted-foreground"
                >
                  {item.label}
                </Link>
              </div>
            ),
          )}

          <div className="col-span-2 flex flex-col gap-3 sm:col-span-1">
            <span className="font-display text-sm font-medium text-foreground">Policies</span>
            <ul className="flex flex-col gap-2">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">{siteConfig.description}</p>
            <a
              href={siteConfig.social.instagram}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <InstagramGlyph className="size-4" />
              Instagram
            </a>
          </div>

          <NewsletterForm />
        </div>

        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
        </p>
      </Container>
    </footer>
  )
}

/** Minimal inline glyph — lucide-react ships no brand/social icon set. */
function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}
