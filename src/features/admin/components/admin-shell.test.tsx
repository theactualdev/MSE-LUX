import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { usePathname } from 'next/navigation'
import { AdminShell } from '@/features/admin/components/admin-shell'

const handleSignOut = vi.fn()
vi.mock('@/features/auth/sign-out', () => ({ handleSignOut: () => handleSignOut() }))
vi.mock('next/navigation', () => ({ usePathname: vi.fn() }))

describe('AdminShell', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/admin')
  })

  it('renders Dashboard active and Orders/Catalog as live (inactive) links, with Customers still coming soon', () => {
    render(<AdminShell email="admin@mse.lux">content</AdminShell>)

    const dashboard = screen.getByRole('link', { name: /dashboard/i })
    expect(dashboard).toHaveAttribute('href', '/admin')
    expect(dashboard).toHaveAttribute('aria-current', 'page')

    const orders = screen.getByRole('link', { name: /orders/i })
    expect(orders).toHaveAttribute('href', '/admin/orders')
    expect(orders).not.toHaveAttribute('aria-current')

    const catalog = screen.getByRole('link', { name: /catalog/i })
    expect(catalog).toHaveAttribute('href', '/admin/catalog')
    expect(catalog).not.toHaveAttribute('aria-current')

    // Customers is still NOT a link — inert, visibly disabled.
    expect(screen.queryByRole('link', { name: /customers/i })).toBeNull()
    expect(screen.getByText('Customers')).toBeInTheDocument()
    expect(screen.getAllByText(/coming soon/i).length).toBe(1)
  })

  it('marks Orders (and not Dashboard) active when the pathname is exactly /admin/orders', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/orders')
    render(<AdminShell email="admin@mse.lux">content</AdminShell>)

    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: /orders/i })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps Orders active on a nested order detail route via prefix match', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/orders/MSE-1')
    render(<AdminShell email="admin@mse.lux">content</AdminShell>)

    expect(screen.getByRole('link', { name: /orders/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('aria-current')
  })

  it('keeps Catalog active on a nested product-edit route via prefix match', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/catalog/abc-123')
    render(<AdminShell email="admin@mse.lux">content</AdminShell>)

    expect(screen.getByRole('link', { name: /catalog/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('aria-current')
  })

  it('shows the signed-in admin email and signs out on click', async () => {
    const user = userEvent.setup()
    render(<AdminShell email="admin@mse.lux">content</AdminShell>)

    expect(screen.getByText('admin@mse.lux')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(handleSignOut).toHaveBeenCalledTimes(1)
  })

  it('renders children in the main region and tolerates a null email', () => {
    render(<AdminShell email={null}>the-page-body</AdminShell>)
    expect(screen.getByRole('main')).toHaveTextContent('the-page-body')
  })
})
