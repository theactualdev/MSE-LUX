import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Header } from '@/components/layout/header'
import { siteConfig } from '@/lib/config'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
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
