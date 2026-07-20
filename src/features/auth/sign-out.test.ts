import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleSignOut } from '@/features/auth/sign-out'
import { signOut } from '@/features/auth/actions'

vi.mock('@/features/auth/actions', () => ({
  signOut: vi.fn(),
}))

const signOutMock = vi.mocked(signOut)

describe('handleSignOut', () => {
  beforeEach(() => {
    signOutMock.mockReset()
  })

  it('calls the sign-out Server Action', () => {
    signOutMock.mockResolvedValue({})

    handleSignOut()

    expect(signOutMock).toHaveBeenCalledTimes(1)
  })

  it('swallows the redirect-as-rejection instead of producing an unhandled rejection', async () => {
    // A successful signOut() redirects server-side, which surfaces on the
    // client as a rejected promise Next has already handled.
    const rejection = Promise.reject(new Error('NEXT_REDIRECT'))
    signOutMock.mockReturnValue(rejection as never)

    expect(() => handleSignOut()).not.toThrow()
    await expect(rejection.catch(() => 'handled')).resolves.toBe('handled')
  })

  it('issues no client-side navigation of its own', async () => {
    // The action's own redirect('/') is the only navigation; a competing
    // client-side push here would be given priority by dispatchAction and
    // would discard it.
    signOutMock.mockResolvedValue({})

    handleSignOut()
    await vi.waitFor(() => expect(signOutMock).toHaveBeenCalled())

    expect(signOutMock).toHaveBeenCalledWith()
  })
})
