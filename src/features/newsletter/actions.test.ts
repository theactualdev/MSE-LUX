import { describe, it, expect, vi, beforeEach } from 'vitest'

const checkRateLimit = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit,
  RATE_LIMITED_MESSAGE: 'Too many attempts. Please wait a moment and try again.',
}))

const processSubscription = vi.hoisted(() => vi.fn())
const unsubscribeByToken = vi.hoisted(() => vi.fn())
vi.mock('@/features/newsletter/subscription', () => ({ processSubscription, unsubscribeByToken }))

const sendNewsletterConfirmation = vi.hoisted(() => vi.fn())
vi.mock('@/features/email/send', () => ({ sendNewsletterConfirmation }))

// `redirect` is a control-flow throw in real Next.js (its return type is
// `never`). Mocking it to throw a NEXT_REDIRECT-shaped sentinel — rather
// than just recording a call — is what catches a missing early-return and
// mirrors what the framework actually does; callers assert via `.rejects`.
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT', url })
  }),
)
vi.mock('next/navigation', () => ({ redirect }))

const { subscribe, confirmUnsubscribe } = await import('@/features/newsletter/actions')

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimit.mockResolvedValue(true)
  sendNewsletterConfirmation.mockResolvedValue(undefined)
})

describe('subscribe', () => {
  it('normalises the email before the engine sees it', async () => {
    processSubscription.mockResolvedValue({ send: false })
    await subscribe('  Ada@EXAMPLE.com  ')
    expect(processSubscription).toHaveBeenCalledWith('ada@example.com')
  })

  it('sends the confirmation AFTER the engine commits, when asked to', async () => {
    processSubscription.mockResolvedValue({ send: true, email: 'a@b.com', token: 'tok' })
    const result = await subscribe('a@b.com')
    expect(sendNewsletterConfirmation).toHaveBeenCalledWith({ email: 'a@b.com', token: 'tok' })
    expect(result.ok).toBe(true)
  })

  /** THE ENUMERATION GUARD: every entry state returns a byte-identical success. */
  it('returns the identical response whether or not a send happened', async () => {
    processSubscription.mockResolvedValueOnce({ send: true, email: 'a@b.com', token: 'tok' })
    const sent = await subscribe('a@b.com')
    processSubscription.mockResolvedValueOnce({ send: false })
    const noop = await subscribe('a@b.com')
    expect(noop).toEqual(sent)
  })

  it('rejects an invalid email without touching the engine', async () => {
    const result = await subscribe('not-an-email')
    expect(result.ok).toBe(false)
    expect(processSubscription).not.toHaveBeenCalled()
  })

  it('rejects a non-string input without throwing', async () => {
    const result = await subscribe({ hostile: true })
    expect(result.ok).toBe(false)
    expect(processSubscription).not.toHaveBeenCalled()
  })

  it('rate-limited requests neither write nor send', async () => {
    checkRateLimit.mockResolvedValue(false)
    const result = await subscribe('a@b.com')
    expect(result.ok).toBe(false)
    expect(processSubscription).not.toHaveBeenCalled()
    expect(sendNewsletterConfirmation).not.toHaveBeenCalled()
  })

  it('an engine failure returns a generic error, not a throw and not the success message', async () => {
    processSubscription.mockRejectedValue(new Error('db down'))
    const result = await subscribe('a@b.com')
    expect(result.ok).toBe(false)
    expect(sendNewsletterConfirmation).not.toHaveBeenCalled()
  })
})

describe('confirmUnsubscribe', () => {
  it('unsubscribes a valid token and redirects to ?done=1', async () => {
    unsubscribeByToken.mockResolvedValue('unsubscribed')
    const formData = new FormData()
    formData.set('token', 'tok')

    await expect(confirmUnsubscribe(formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(unsubscribeByToken).toHaveBeenCalledWith('tok')
    expect(redirect).toHaveBeenCalledWith('/newsletter/unsubscribe?done=1')
  })

  it('redirects WITHOUT done when the engine reports an invalid token', async () => {
    unsubscribeByToken.mockResolvedValue('invalid')
    const formData = new FormData()
    formData.set('token', 'tok')

    await expect(confirmUnsubscribe(formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(unsubscribeByToken).toHaveBeenCalledWith('tok')
    expect(redirect).toHaveBeenCalledWith('/newsletter/unsubscribe')
  })

  it('redirects WITHOUT done and never calls the engine for a missing token', async () => {
    const formData = new FormData()

    await expect(confirmUnsubscribe(formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(unsubscribeByToken).not.toHaveBeenCalled()
    expect(redirect).toHaveBeenCalledWith('/newsletter/unsubscribe')
  })

  it('redirects WITHOUT done and never calls the engine for a non-string token', async () => {
    const formData = new FormData()
    formData.set('token', new Blob(['not-a-string']))

    await expect(confirmUnsubscribe(formData)).rejects.toThrow('NEXT_REDIRECT')

    expect(unsubscribeByToken).not.toHaveBeenCalled()
    expect(redirect).toHaveBeenCalledWith('/newsletter/unsubscribe')
  })
})
