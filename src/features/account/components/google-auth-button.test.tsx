import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GoogleAuthButton } from '@/features/account/components/google-auth-button'
import { signInWithGoogle } from '@/features/auth/actions'

vi.mock('@/features/auth/actions', () => ({
  signInWithGoogle: vi.fn(),
}))

const signInWithGoogleMock = vi.mocked(signInWithGoogle)
const GENERIC_ERROR = 'Something went wrong. Please try again.'

describe('GoogleAuthButton', () => {
  const originalLocation = window.location

  beforeEach(() => {
    signInWithGoogleMock.mockReset()
    // Real jsdom navigation on a `location.href` assignment logs a "not
    // implemented" error and doesn't let us observe the target — swap in a
    // plain writable stub for the duration of each test instead.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: 'http://localhost:3000/login' },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('renders a "Continue with Google" button', () => {
    render(<GoogleAuthButton onError={vi.fn()} />)
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
  })

  it('navigates to the provider URL returned by signInWithGoogle on success', async () => {
    signInWithGoogleMock.mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/auth' })
    const onError = vi.fn()
    const user = userEvent.setup()
    render(<GoogleAuthButton onError={onError} />)

    await user.click(screen.getByRole('button', { name: /continue with google/i }))

    await vi.waitFor(() => {
      expect(window.location.href).toBe('https://accounts.google.com/o/oauth2/auth')
    })
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls onError and does not navigate when signInWithGoogle resolves with an error', async () => {
    signInWithGoogleMock.mockResolvedValue({ error: GENERIC_ERROR })
    const onError = vi.fn()
    const user = userEvent.setup()
    render(<GoogleAuthButton onError={onError} />)

    await user.click(screen.getByRole('button', { name: /continue with google/i }))

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(GENERIC_ERROR)
    })
    expect(window.location.href).toBe('http://localhost:3000/login')
  })

  it('calls onError and does not navigate when signInWithGoogle resolves with neither a url nor an error', async () => {
    signInWithGoogleMock.mockResolvedValue({})
    const onError = vi.fn()
    const user = userEvent.setup()
    render(<GoogleAuthButton onError={onError} />)

    await user.click(screen.getByRole('button', { name: /continue with google/i }))

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(GENERIC_ERROR)
    })
    expect(window.location.href).toBe('http://localhost:3000/login')
  })

  it('calls onError with a generic message when signInWithGoogle rejects (transport failure)', async () => {
    signInWithGoogleMock.mockRejectedValue(new Error('Failed to fetch'))
    const onError = vi.fn()
    const user = userEvent.setup()
    render(<GoogleAuthButton onError={onError} />)

    await user.click(screen.getByRole('button', { name: /continue with google/i }))

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(GENERIC_ERROR)
    })
  })

  it('disables the button while the request is pending, and keeps it disabled through a successful navigation', async () => {
    let resolveSignIn!: (value: { url?: string; error?: string }) => void
    signInWithGoogleMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve
      }),
    )
    const user = userEvent.setup()
    render(<GoogleAuthButton onError={vi.fn()} />)
    const button = screen.getByRole('button', { name: /continue with google/i })

    await user.click(button)

    expect(button).toBeDisabled()

    resolveSignIn({ url: 'https://accounts.google.com/o/oauth2/auth' })
    await vi.waitFor(() => {
      expect(window.location.href).toBe('https://accounts.google.com/o/oauth2/auth')
    })
    // Deliberately still disabled: the browser is navigating away, so
    // there's no reason to flash the button back to an enabled state.
    expect(button).toBeDisabled()
  })

  it('re-enables the button after an error, so the visitor can retry', async () => {
    signInWithGoogleMock.mockResolvedValue({ error: GENERIC_ERROR })
    const user = userEvent.setup()
    render(<GoogleAuthButton onError={vi.fn()} />)
    const button = screen.getByRole('button', { name: /continue with google/i })

    await user.click(button)

    await vi.waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })
})
