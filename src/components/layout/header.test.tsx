import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Header } from '@/components/layout/header'
import { siteConfig } from '@/lib/config'

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
    render(<Header />)
    expect(screen.getByText(siteConfig.name)).toBeInTheDocument()
    for (const item of siteConfig.nav) {
      expect(screen.getAllByText(item.label).length).toBeGreaterThan(0)
    }
  })
})
