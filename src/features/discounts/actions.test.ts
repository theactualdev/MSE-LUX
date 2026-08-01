import { describe, it, expect, vi, beforeEach } from 'vitest'

const checkRateLimit = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit,
  RATE_LIMITED_MESSAGE: 'Too many attempts. Please wait a moment and try again.',
}))

const resolveUsableCode = vi.hoisted(() => vi.fn())
vi.mock('@/features/discounts/discount', () => ({ resolveUsableCode }))

const { validateDiscountCode } = await import('@/features/discounts/actions')

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimit.mockResolvedValue(true)
})

describe('validateDiscountCode', () => {
  it('returns the code and percentage for a usable code', async () => {
    resolveUsableCode.mockResolvedValue({ id: 'd1', code: 'LAUNCH20', percentOff: 20 })
    await expect(validateDiscountCode('launch20')).resolves.toEqual({ ok: true, code: 'LAUNCH20', percentOff: 20 })
  })

  /**
   * THE ENUMERATION GUARD: unknown, inactive, expired and exhausted all reach
   * the engine's single null, so this action can only ever produce one
   * rejection. Pinning object equality (not just `ok === false`) is what stops
   * a future edit adding a distinguishing field.
   */
  it('returns one identical rejection whatever the reason', async () => {
    resolveUsableCode.mockResolvedValue(null)
    const first = await validateDiscountCode('EXPIRED')
    const second = await validateDiscountCode('NEVER-EXISTED')
    expect(first).toEqual(second)
    expect(first.ok).toBe(false)
  })

  it('rejects a non-string input without touching the engine', async () => {
    await expect(validateDiscountCode({ hostile: true })).resolves.toMatchObject({ ok: false })
    expect(resolveUsableCode).not.toHaveBeenCalled()
  })

  it('rejects an over-long input without touching the engine', async () => {
    await expect(validateDiscountCode('X'.repeat(200))).resolves.toMatchObject({ ok: false })
    expect(resolveUsableCode).not.toHaveBeenCalled()
  })

  it('rate-limited requests never reach the engine', async () => {
    checkRateLimit.mockResolvedValue(false)
    const result = await validateDiscountCode('LAUNCH20')
    expect(result.ok).toBe(false)
    expect(resolveUsableCode).not.toHaveBeenCalled()
  })

  it('an engine failure returns a rejection rather than throwing', async () => {
    resolveUsableCode.mockRejectedValue(new Error('db down'))
    await expect(validateDiscountCode('LAUNCH20')).resolves.toMatchObject({ ok: false })
  })
})
