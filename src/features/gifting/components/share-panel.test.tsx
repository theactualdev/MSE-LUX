import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SharePanel } from '@/features/gifting/components/share-panel'
import { enableShareAction, disableShareAction, regenerateShareAction } from '@/features/gifting/actions'
import type { ShareState } from '@/features/gifting/share'
import type { SavedAddress } from '@/features/account/data'

vi.mock('@/features/gifting/actions', () => ({
  enableShareAction: vi.fn(),
  disableShareAction: vi.fn(),
  regenerateShareAction: vi.fn(),
}))

const enableShareActionMock = vi.mocked(enableShareAction)
const disableShareActionMock = vi.mocked(disableShareAction)
const regenerateShareActionMock = vi.mocked(regenerateShareAction)

const ADDRESS_1: SavedAddress = {
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

const ADDRESS_2: SavedAddress = {
  ...ADDRESS_1,
  id: 'addr-2',
  isDefault: false,
  fullName: 'Bola Grace',
  line1: '4 Admiralty Way',
  city: 'Lekki',
  state: 'Lagos',
}

const NOT_SHARED: ShareState = { enabled: false, token: null, addressId: null }
const SHARED: ShareState = { enabled: true, token: 'tok-123abc', addressId: 'addr-1' }

const writeText = vi.fn()

describe('SharePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    writeText.mockResolvedValue(undefined)
    vi.stubGlobal('confirm', vi.fn())
  })

  describe('signed out', () => {
    it('renders a sign-in prompt and no share controls', () => {
      render(<SharePanel shareState={null} addresses={[]} />)

      expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /create share link/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /disable sharing/i })).not.toBeInTheDocument()
    })
  })

  describe('signed in, no saved addresses', () => {
    it('prompts to add an address and offers no enable control', () => {
      render(<SharePanel shareState={NOT_SHARED} addresses={[]} />)

      const link = screen.getByRole('link', { name: /add.*address/i })
      expect(link).toHaveAttribute('href', '/account/addresses')
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /create share link/i })).not.toBeInTheDocument()
    })
  })

  describe('signed in, not yet sharing', () => {
    it('renders an address select and a "Create share link" control', () => {
      render(<SharePanel shareState={NOT_SHARED} addresses={[ADDRESS_1, ADDRESS_2]} />)

      expect(screen.getByRole('combobox', { name: /delivery address/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create share link/i })).toBeInTheDocument()
    })

    it('creating a link calls enableShareAction with the selected (default-first) address', async () => {
      enableShareActionMock.mockResolvedValue({ ok: true, token: 'new-tok' })
      const user = userEvent.setup({ delay: null })
      render(<SharePanel shareState={NOT_SHARED} addresses={[ADDRESS_1, ADDRESS_2]} />)

      await user.click(screen.getByRole('button', { name: /create share link/i }))

      await vi.waitFor(() => {
        expect(enableShareActionMock).toHaveBeenCalledWith('addr-1')
      })
    })

    it('an address whose nominated id no longer resolves also falls back to this state', () => {
      // `giftAddressId` is `onDelete: SetNull` — `enabled: true` can outlive
      // the address it pointed at, or point at one no longer in `addresses`.
      const dangling: ShareState = { enabled: true, token: 'tok', addressId: 'addr-deleted' }
      render(<SharePanel shareState={dangling} addresses={[ADDRESS_1]} />)

      expect(screen.getByRole('button', { name: /create share link/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /disable sharing/i })).not.toBeInTheDocument()
    })

    it('surfaces a rejected enable instead of pretending it applied', async () => {
      enableShareActionMock.mockResolvedValue({ ok: false, error: 'Choose a delivery address first.' })
      const user = userEvent.setup({ delay: null })
      render(<SharePanel shareState={NOT_SHARED} addresses={[ADDRESS_1]} />)

      await user.click(screen.getByRole('button', { name: /create share link/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/choose a delivery address/i)
    })
  })

  describe('already sharing', () => {
    it('renders the share link, the locality (never the street), Disable, and Regenerate', () => {
      render(<SharePanel shareState={SHARED} addresses={[ADDRESS_1, ADDRESS_2]} />)

      expect(screen.getByRole('textbox', { name: /share link/i })).toHaveValue(
        'http://localhost:3000/wishlist/shared/tok-123abc',
      )
      expect(screen.getByText(/lagos, lagos/i)).toBeInTheDocument()
      expect(screen.queryByText(/12 marina road/i)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /disable sharing/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /regenerate link/i })).toBeInTheDocument()
      // No enable control once already sharing.
      expect(screen.queryByRole('button', { name: /create share link/i })).not.toBeInTheDocument()
    })

    it('mounts the copy-feedback status region empty, then populates it (not the reverse)', async () => {
      const user = userEvent.setup({ delay: null })
      // `userEvent.setup()` installs its own `navigator.clipboard` stub, so
      // the spy has to be attached after that call, or it gets shadowed.
      Object.defineProperty(navigator.clipboard, 'writeText', { value: writeText, configurable: true })
      render(<SharePanel shareState={SHARED} addresses={[ADDRESS_1]} />)

      const status = screen.getByRole('status')
      expect(status).toHaveTextContent('')

      await user.click(screen.getByRole('button', { name: /copy link/i }))

      expect(writeText).toHaveBeenCalledWith('http://localhost:3000/wishlist/shared/tok-123abc')
      expect(await screen.findByRole('status')).toHaveTextContent(/copied/i)
    })

    it('disabling calls disableShareAction', async () => {
      disableShareActionMock.mockResolvedValue({ ok: true })
      const user = userEvent.setup({ delay: null })
      render(<SharePanel shareState={SHARED} addresses={[ADDRESS_1]} />)

      await user.click(screen.getByRole('button', { name: /disable sharing/i }))

      await vi.waitFor(() => {
        expect(disableShareActionMock).toHaveBeenCalled()
      })
    })

    it('regenerate is gated behind a confirmation and does nothing when cancelled', async () => {
      vi.mocked(window.confirm).mockReturnValue(false)
      const user = userEvent.setup({ delay: null })
      render(<SharePanel shareState={SHARED} addresses={[ADDRESS_1]} />)

      await user.click(screen.getByRole('button', { name: /regenerate link/i }))

      expect(window.confirm).toHaveBeenCalled()
      expect(regenerateShareActionMock).not.toHaveBeenCalled()
    })

    it('regenerate proceeds once confirmed', async () => {
      vi.mocked(window.confirm).mockReturnValue(true)
      regenerateShareActionMock.mockResolvedValue({ ok: true, token: 'tok-new' })
      const user = userEvent.setup({ delay: null })
      render(<SharePanel shareState={SHARED} addresses={[ADDRESS_1]} />)

      await user.click(screen.getByRole('button', { name: /regenerate link/i }))

      await vi.waitFor(() => {
        expect(regenerateShareActionMock).toHaveBeenCalled()
      })
    })
  })
})
