import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddressBook } from '@/features/account/components/address-book'
import { useAuthStore } from '@/features/account/store'
import { buildMockUser } from '@/features/account/lib/mock-user'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/account/addresses',
  useSearchParams: () => new URLSearchParams(),
}))

describe('AddressBook', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: buildMockUser('ada@example.com', 'Ada Lovelace') })
  })

  it('lists the signed-in user\'s saved address with a Default badge', () => {
    render(<AddressBook />)

    expect(screen.getByText(/12 Marina Road/)).toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()
  })

  it('adding an address via the form calls addAddress and it appears in the list', async () => {
    const user = userEvent.setup({ delay: null })
    render(<AddressBook />)

    await user.click(screen.getByRole('button', { name: /add address/i }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/full name/i), 'Bola Grace')
    await user.type(within(dialog).getByLabelText(/phone number/i), '0801 234 5678')
    await user.type(within(dialog).getByLabelText(/address line 1/i), '4 Admiralty Way')
    await user.type(within(dialog).getByLabelText(/^city$/i), 'Lekki')
    await user.type(within(dialog).getByLabelText(/^state$/i), 'Lagos')
    await user.click(within(dialog).getByRole('button', { name: /add address/i }))

    await vi.waitFor(() => {
      expect(useAuthStore.getState().user?.addresses).toHaveLength(2)
    })
    expect(await screen.findByText(/4 Admiralty Way/)).toBeInTheDocument()
    // Typing across six fields is keystroke-heavy; allow headroom under full-suite load.
  }, 20_000)

  it('delete removes an address from the list', async () => {
    const user = userEvent.setup({ delay: null })
    render(<AddressBook />)

    await user.click(screen.getByRole('button', { name: /delete/i }))

    await vi.waitFor(() => {
      expect(useAuthStore.getState().user?.addresses).toHaveLength(0)
    })
    expect(screen.queryByText(/12 Marina Road/)).not.toBeInTheDocument()
  })

  it('set default moves the Default badge to the newly-default address', async () => {
    const user = userEvent.setup({ delay: null })
    // Seed a second, non-default address directly via the store.
    useAuthStore.getState().addAddress({
      fullName: 'Bola Grace',
      phone: '0801 234 5678',
      line1: '4 Admiralty Way',
      city: 'Lekki',
      state: 'Lagos',
      country: 'Nigeria',
    })
    render(<AddressBook />)

    await user.click(screen.getByRole('button', { name: /set default/i }))

    await vi.waitFor(() => {
      const state = useAuthStore.getState().user
      expect(state?.addresses.find((a) => a.line1 === '4 Admiralty Way')?.isDefault).toBe(true)
    })

    const badges = screen.getAllByText('Default')
    expect(badges).toHaveLength(1)
    expect(badges[0].closest('li')).toHaveTextContent('4 Admiralty Way')
  })

  it('shows a strong empty state when there are no saved addresses', () => {
    useAuthStore.setState((s) => (s.user ? { user: { ...s.user, addresses: [] } } : s))
    render(<AddressBook />)

    expect(screen.getByText(/no saved addresses/i)).toBeInTheDocument()
  })
})
