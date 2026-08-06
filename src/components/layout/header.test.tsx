import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Header } from '@/components/layout/header'
import { siteConfig } from '@/lib/config'
import type { NavItem } from '@/types/nav'

// Nav is a prop now, not a module constant: `AppShell` reads categories from
// the database and passes them down. Passing an explicit fixture here keeps
// this test about the header's chrome rather than about catalog data.
const NAV: NavItem[] = [
  { label: 'Jewelry', href: '/jewelry', children: [{ label: 'Necklaces', href: '/jewelry/necklaces' }] },
  { label: 'Collections', href: '/collections' },
  { label: 'About', href: '/about' },
]

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// `AccountMenu` (rendered by `Header`) reads the browser session via
// `useSession`, which constructs the real Supabase browser client — and that
// deliberately throws when `NEXT_PUBLIC_SUPABASE_*` is unset, as it is under
// test. Stubbed here rather than by loosening `createClient`: a missing env
// var should stay a loud failure in the app itself, and this test is about
// the header's chrome, not about auth.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getClaims: async () => ({ data: null, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}))

describe('Header', () => {
  it('renders the brand name and top-level nav labels', () => {
    render(<Header nav={NAV} />)
    expect(screen.getByText(siteConfig.name)).toBeInTheDocument()
    for (const item of NAV) {
      expect(screen.getAllByText(item.label).length).toBeGreaterThan(0)
    }
  })
})
