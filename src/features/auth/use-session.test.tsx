import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useSession } from '@/features/auth/use-session'

type AuthChangeHandler = (event: string, session: unknown) => void

const getClaims = vi.fn()
const unsubscribe = vi.fn()
/** Handlers the hook registered, so a test can drive an auth event through them. */
const handlers: AuthChangeHandler[] = []
const onAuthStateChange = vi.fn((handler: AuthChangeHandler) => {
  handlers.push(handler)
  return { data: { subscription: { unsubscribe } } }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getClaims: () => getClaims(),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => onAuthStateChange(cb),
    },
  }),
}))

let pathname = '/account'

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

function Probe() {
  const { signedIn, loading } = useSession()
  return <span data-testid="state">{loading ? 'loading' : signedIn ? 'in' : 'out'}</span>
}

beforeEach(() => {
  vi.clearAllMocks()
  handlers.length = 0
  pathname = '/account'
})

describe('useSession', () => {
  it('starts in a loading state so callers can render an inert placeholder', () => {
    getClaims.mockReturnValue(new Promise(() => {}))
    render(<Probe />)

    expect(screen.getByTestId('state')).toHaveTextContent('loading')
  })

  it('reports signed in when the cookie carries verifiable claims', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null })
    render(<Probe />)

    expect(await screen.findByText('in')).toBeInTheDocument()
  })

  it('reports signed out when there are no claims', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })
    render(<Probe />)

    expect(await screen.findByText('out')).toBeInTheDocument()
  })

  it('treats a rejected verification as signed out rather than staying loading forever', async () => {
    getClaims.mockRejectedValue(new Error('bad token'))
    render(<Probe />)

    expect(await screen.findByText('out')).toBeInTheDocument()
  })

  it('updates when the browser client emits an auth change', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })
    render(<Probe />)
    expect(await screen.findByText('out')).toBeInTheDocument()

    handlers[0]('SIGNED_IN', { access_token: 'x' })

    expect(await screen.findByText('in')).toBeInTheDocument()
  })

  it('re-reads the cookie on navigation, which is how a Server-Action sign-in is picked up', async () => {
    // signIn() sets the cookie from Node, so onAuthStateChange never fires in
    // the browser — only the post-login navigation reveals the new session.
    getClaims.mockResolvedValue({ data: null, error: null })
    const { rerender } = render(<Probe />)
    expect(await screen.findByText('out')).toBeInTheDocument()

    getClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null })
    pathname = '/account/orders'
    rerender(<Probe />)

    expect(await screen.findByText('in')).toBeInTheDocument()
    expect(getClaims).toHaveBeenCalledTimes(2)
  })

  it('unsubscribes on unmount', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })
    const { unmount } = render(<Probe />)
    await screen.findByText('out')

    unmount()

    expect(unsubscribe).toHaveBeenCalled()
  })
})
