import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Role } from '@/generated/prisma/client'

const requireRole = vi.fn()
vi.mock('@/features/auth/guards', () => ({ requireRole: (...args: [Role]) => requireRole(...args) }))
const getCurrentUserEmail = vi.fn()
vi.mock('@/features/auth/claims', () => ({ getCurrentUserEmail: () => getCurrentUserEmail() }))
vi.mock('@/features/admin/components/admin-shell', () => ({
  AdminShell: ({ email, children }: { email: string | null; children: React.ReactNode }) => (
    <div data-testid="admin-shell" data-email={email ?? ''}>{children}</div>
  ),
}))

const { default: AdminLayout } = await import('@/app/(admin)/admin/layout')

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserEmail.mockResolvedValue('admin@mse.lux')
})

describe('(admin)/admin layout', () => {
  it('enforces requireRole(ADMIN) — a rejection (notFound/redirect) propagates and nothing renders', async () => {
    requireRole.mockRejectedValue(new Error('NEXT_HTTP_ERROR_FALLBACK;404'))

    await expect(AdminLayout({ children: 'secret' })).rejects.toThrow()
    expect(requireRole).toHaveBeenCalledWith(Role.ADMIN)
    expect(getCurrentUserEmail).not.toHaveBeenCalled()
  })

  it('renders AdminShell with the admin email once the gate passes', async () => {
    requireRole.mockResolvedValue({ sub: 'admin-id' })

    const tree = await AdminLayout({ children: 'dashboard' })
    const { render, screen } = await import('@testing-library/react')
    render(tree)

    expect(screen.getByTestId('admin-shell')).toHaveAttribute('data-email', 'admin@mse.lux')
    expect(screen.getByTestId('admin-shell')).toHaveTextContent('dashboard')
  })
})
