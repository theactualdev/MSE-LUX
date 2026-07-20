import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddressBook } from '@/features/account/components/address-book'
import {
  addAddress,
  editAddress,
  makeAddressDefault,
  removeAddress,
} from '@/features/account/actions'
import type { SavedAddress } from '@/features/account/data'

vi.mock('@/features/account/actions', () => ({
  addAddress: vi.fn(),
  editAddress: vi.fn(),
  makeAddressDefault: vi.fn(),
  removeAddress: vi.fn(),
}))

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
  return {
    ...actual,
    useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
    usePathname: () => '/account/addresses',
    useSearchParams: () => new URLSearchParams(),
  }
})

const addAddressMock = vi.mocked(addAddress)
const editAddressMock = vi.mocked(editAddress)
const makeAddressDefaultMock = vi.mocked(makeAddressDefault)
const removeAddressMock = vi.mocked(removeAddress)

const DEFAULT_ADDRESS: SavedAddress = {
  id: 'addr-1',
  isDefault: true,
  fullName: 'Ada Lovelace',
  phone: '0800 000 0000',
  line1: '12 Marina Road',
  line2: '',
  city: 'Lagos',
  state: 'Lagos',
  country: 'Nigeria',
  postalCode: '',
}

const SECOND_ADDRESS: SavedAddress = {
  ...DEFAULT_ADDRESS,
  id: 'addr-2',
  isDefault: false,
  fullName: 'Bola Grace',
  line1: '4 Admiralty Way',
  city: 'Lekki',
}

describe('AddressBook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addAddressMock.mockResolvedValue({})
    editAddressMock.mockResolvedValue({})
    makeAddressDefaultMock.mockResolvedValue({})
    removeAddressMock.mockResolvedValue({})
  })

  it("lists the signed-in user's saved address with a Default badge", () => {
    render(<AddressBook addresses={[DEFAULT_ADDRESS]} />)

    expect(screen.getByText(/12 Marina Road/)).toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()
  })

  it('adding an address via the form calls the create action', async () => {
    const user = userEvent.setup({ delay: null })
    render(<AddressBook addresses={[DEFAULT_ADDRESS]} />)

    await user.click(screen.getByRole('button', { name: /add address/i }))

    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/full name/i), 'Bola Grace')
    await user.type(within(dialog).getByLabelText(/phone number/i), '0801 234 5678')
    await user.type(within(dialog).getByLabelText(/address line 1/i), '4 Admiralty Way')
    await user.type(within(dialog).getByLabelText(/^city$/i), 'Lekki')
    await user.type(within(dialog).getByLabelText(/^state$/i), 'Lagos')
    await user.click(within(dialog).getByRole('button', { name: /add address/i }))

    await vi.waitFor(() => {
      expect(addAddressMock).toHaveBeenCalledWith(
        expect.objectContaining({ line1: '4 Admiralty Way', city: 'Lekki' }),
      )
    })
    // Typing across six fields is keystroke-heavy; allow headroom under full-suite load.
  }, 20_000)

  it('editing an address passes that row\'s id to the edit action', async () => {
    const user = userEvent.setup({ delay: null })
    render(<AddressBook addresses={[DEFAULT_ADDRESS]} />)

    await user.click(screen.getByRole('button', { name: /edit/i }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /save/i }))

    await vi.waitFor(() => {
      expect(editAddressMock).toHaveBeenCalledWith('addr-1', expect.objectContaining({
        line1: '12 Marina Road',
      }))
    })
  }, 20_000)

  it('delete calls the remove action with that row\'s id', async () => {
    const user = userEvent.setup({ delay: null })
    render(<AddressBook addresses={[DEFAULT_ADDRESS]} />)

    await user.click(screen.getByRole('button', { name: /delete/i }))

    await vi.waitFor(() => {
      expect(removeAddressMock).toHaveBeenCalledWith('addr-1')
    })
  })

  it('set default is only offered on non-default rows and calls the action', async () => {
    const user = userEvent.setup({ delay: null })
    render(<AddressBook addresses={[DEFAULT_ADDRESS, SECOND_ADDRESS]} />)

    const setDefaultButtons = screen.getAllByRole('button', { name: /set default/i })
    expect(setDefaultButtons).toHaveLength(1)

    await user.click(setDefaultButtons[0])

    await vi.waitFor(() => {
      expect(makeAddressDefaultMock).toHaveBeenCalledWith('addr-2')
    })
  })

  it('renders exactly one Default badge, on the row the server marked default', () => {
    render(<AddressBook addresses={[DEFAULT_ADDRESS, SECOND_ADDRESS]} />)

    const badges = screen.getAllByText('Default')
    expect(badges).toHaveLength(1)
    expect(badges[0].closest('li')).toHaveTextContent('12 Marina Road')
  })

  it('surfaces a rejected mutation instead of pretending it applied', async () => {
    // The mock store always "succeeded"; a server-side rejection (someone
    // else's row, concurrent delete) had no way to reach the user before.
    removeAddressMock.mockResolvedValue({ error: 'That address is no longer available.' })
    const user = userEvent.setup({ delay: null })
    render(<AddressBook addresses={[DEFAULT_ADDRESS]} />)

    await user.click(screen.getByRole('button', { name: /delete/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer available/i)
  })

  it('disables "Add address" while another mutation is pending', async () => {
    // Regression coverage: the header button used to stay enabled during a
    // pending row mutation, so a user could fire a `createAddress` while a
    // `setDefaultAddress`/delete/edit was still in flight — exactly the
    // scenario that used to surface an unhandled P2002 from the data layer.
    let resolveRemove: (value: { error?: string }) => void = () => {}
    removeAddressMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRemove = resolve
        }),
    )
    const user = userEvent.setup({ delay: null })
    render(<AddressBook addresses={[DEFAULT_ADDRESS]} />)

    await user.click(screen.getByRole('button', { name: /delete/i }))

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /add address/i })).toBeDisabled()
    })

    resolveRemove({})
  })

  it('shows a strong empty state when there are no saved addresses', () => {
    render(<AddressBook addresses={[]} />)

    expect(screen.getByText(/no saved addresses/i)).toBeInTheDocument()
  })
})
