import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminShell } from '@/features/admin/components/admin-shell'

const handleSignOut = vi.fn()
vi.mock('@/features/auth/sign-out', () => ({ handleSignOut: () => handleSignOut() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))

describe('AdminShell', () => {
  it('renders the nav with Dashboard active and the future sections disabled as coming soon', () => {
    render(<AdminShell email="admin@mse.lux">content</AdminShell>)

    const dashboard = screen.getByRole('link', { name: /dashboard/i })
    expect(dashboard).toHaveAttribute('href', '/admin')
    expect(dashboard).toHaveAttribute('aria-current', 'page')

    // Coming-soon items are NOT links — inert, visibly disabled.
    for (const label of ['Orders', 'Catalog', 'Customers']) {
      expect(screen.queryByRole('link', { name: new RegExp(label, 'i') })).toBeNull()
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getAllByText(/coming soon/i).length).toBe(3)
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
