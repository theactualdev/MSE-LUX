import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SharePanel } from '@/features/gifting/components/share-panel'
import {
  enableShareAction,
  disableShareAction,
  regenerateShareAction,
  getSharePanelDataAction,
} from '@/features/gifting/actions'
import { useSession } from '@/features/auth/use-session'
import type { ShareState } from '@/features/gifting/share'
import type { SharePanelAddress } from '@/features/gifting/actions'

vi.mock('@/features/gifting/actions', () => ({
  enableShareAction: vi.fn(),
  disableShareAction: vi.fn(),
  regenerateShareAction: vi.fn(),
  getSharePanelDataAction: vi.fn(),
}))

vi.mock('@/features/auth/use-session', () => ({ useSession: vi.fn() }))

const enableShareActionMock = vi.mocked(enableShareAction)
const disableShareActionMock = vi.mocked(disableShareAction)
const regenerateShareActionMock = vi.mocked(regenerateShareAction)
const getSharePanelDataActionMock = vi.mocked(getSharePanelDataAction)
const useSessionMock = vi.mocked(useSession)

const ADDRESS_1: SharePanelAddress = {
  id: 'addr-1',
  fullName: 'Ada Lovelace',
  city: 'Lagos',
  state: 'Lagos',
}

const ADDRESS_2: SharePanelAddress = {
  id: 'addr-2',
  fullName: 'Bola Grace',
  city: 'Lekki',
  state: 'Lagos',
}

const NOT_SHARED: ShareState = { enabled: false, token: null, addressId: null }
const SHARED: ShareState = { enabled: true, token: 'tok-123abc', addressId: 'addr-1' }

const SIGNED_IN_SESSION = { signedIn: true, role: 'CUSTOMER', loading: false } as const
const SIGNED_OUT_SESSION = { signedIn: false, role: 'CUSTOMER', loading: false } as const

const writeText = vi.fn()

function renderSignedIn(data: { shareState: ShareState; addresses: SharePanelAddress[] } | null) {
  useSessionMock.mockReturnValue(SIGNED_IN_SESSION)
  getSharePanelDataActionMock.mockResolvedValue(data)
  return render(<SharePanel />)
}

describe('SharePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    writeText.mockResolvedValue(undefined)
    vi.stubGlobal('confirm', vi.fn())
  })

  describe('signed out', () => {
    it('renders a sign-in prompt and no share controls, without calling the data action', async () => {
      useSessionMock.mockReturnValue(SIGNED_OUT_SESSION)
      render(<SharePanel />)

      expect(await screen.findByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /create share link/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /disable sharing/i })).not.toBeInTheDocument()
      expect(getSharePanelDataActionMock).not.toHaveBeenCalled()
    })
  })

  describe('loading', () => {
    it('renders a quiet frame with no share controls and no sign-in prompt while auth is settling', () => {
      useSessionMock.mockReturnValue({ signedIn: false, role: 'CUSTOMER', loading: true })
      render(<SharePanel />)

      expect(screen.getByText('Share this wishlist')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      expect(getSharePanelDataActionMock).not.toHaveBeenCalled()
    })

    it('renders the same quiet frame while signed in and the fetch is still pending', () => {
      useSessionMock.mockReturnValue(SIGNED_IN_SESSION)
      getSharePanelDataActionMock.mockReturnValue(new Promise(() => {}))
      render(<SharePanel />)

      expect(screen.getByText('Share this wishlist')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    })
  })

  describe('signed in, no saved addresses', () => {
    it('prompts to add an address and offers no enable control', async () => {
      renderSignedIn({ shareState: NOT_SHARED, addresses: [] })

      const link = await screen.findByRole('link', { name: /add.*address/i })
      expect(link).toHaveAttribute('href', '/account/addresses')
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /create share link/i })).not.toBeInTheDocument()
    })
  })

  describe('signed in, not yet sharing', () => {
    it('renders an address select and a "Create share link" control', async () => {
      renderSignedIn({ shareState: NOT_SHARED, addresses: [ADDRESS_1, ADDRESS_2] })

      expect(await screen.findByRole('combobox', { name: /delivery address/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create share link/i })).toBeInTheDocument()
    })

    it('creating a link calls enableShareAction with the selected (default-first) address', async () => {
      enableShareActionMock.mockResolvedValue({ ok: true, token: 'new-tok' })
      const user = userEvent.setup({ delay: null })
      renderSignedIn({ shareState: NOT_SHARED, addresses: [ADDRESS_1, ADDRESS_2] })

      await user.click(await screen.findByRole('button', { name: /create share link/i }))

      await vi.waitFor(() => {
        expect(enableShareActionMock).toHaveBeenCalledWith('addr-1')
      })
    })

    it('an address whose nominated id no longer resolves also falls back to this state', async () => {
      // `giftAddressId` is `onDelete: SetNull` — `enabled: true` can outlive
      // the address it pointed at, or point at one no longer in `addresses`.
      const dangling: ShareState = { enabled: true, token: 'tok', addressId: 'addr-deleted' }
      renderSignedIn({ shareState: dangling, addresses: [ADDRESS_1] })

      expect(await screen.findByRole('button', { name: /create share link/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /disable sharing/i })).not.toBeInTheDocument()
    })

    it('surfaces a rejected enable instead of pretending it applied', async () => {
      enableShareActionMock.mockResolvedValue({ ok: false, error: 'Choose a delivery address first.' })
      const user = userEvent.setup({ delay: null })
      renderSignedIn({ shareState: NOT_SHARED, addresses: [ADDRESS_1] })

      await user.click(await screen.findByRole('button', { name: /create share link/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/choose a delivery address/i)
    })
  })

  describe('already sharing', () => {
    it('renders the share link, the locality (never the street), Disable, and Regenerate', async () => {
      renderSignedIn({ shareState: SHARED, addresses: [ADDRESS_1, ADDRESS_2] })

      expect(await screen.findByRole('textbox', { name: /share link/i })).toHaveValue(
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
      renderSignedIn({ shareState: SHARED, addresses: [ADDRESS_1] })

      const status = await screen.findByRole('status')
      expect(status).toHaveTextContent('')

      await user.click(screen.getByRole('button', { name: /copy link/i }))

      expect(writeText).toHaveBeenCalledWith('http://localhost:3000/wishlist/shared/tok-123abc')
      expect(await screen.findByRole('status')).toHaveTextContent(/copied/i)
    })

    it('disabling calls disableShareAction', async () => {
      disableShareActionMock.mockResolvedValue({ ok: true })
      const user = userEvent.setup({ delay: null })
      renderSignedIn({ shareState: SHARED, addresses: [ADDRESS_1] })

      await user.click(await screen.findByRole('button', { name: /disable sharing/i }))

      await vi.waitFor(() => {
        expect(disableShareActionMock).toHaveBeenCalled()
      })
    })

    it('regenerate is gated behind a confirmation and does nothing when cancelled', async () => {
      vi.mocked(window.confirm).mockReturnValue(false)
      const user = userEvent.setup({ delay: null })
      renderSignedIn({ shareState: SHARED, addresses: [ADDRESS_1] })

      await user.click(await screen.findByRole('button', { name: /regenerate link/i }))

      expect(window.confirm).toHaveBeenCalled()
      expect(regenerateShareActionMock).not.toHaveBeenCalled()
    })

    it('regenerate proceeds once confirmed', async () => {
      vi.mocked(window.confirm).mockReturnValue(true)
      regenerateShareActionMock.mockResolvedValue({ ok: true, token: 'tok-new' })
      const user = userEvent.setup({ delay: null })
      renderSignedIn({ shareState: SHARED, addresses: [ADDRESS_1] })

      await user.click(await screen.findByRole('button', { name: /regenerate link/i }))

      await vi.waitFor(() => {
        expect(regenerateShareActionMock).toHaveBeenCalled()
      })
    })
  })
})
