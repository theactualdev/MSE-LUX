import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCurrentUserId = vi.hoisted(() => vi.fn())
vi.mock('@/features/auth/claims', () => ({ getCurrentUserId }))

const engine = vi.hoisted(() => ({ enableShare: vi.fn(), disableShare: vi.fn(), regenerateShareToken: vi.fn() }))
vi.mock('@/features/gifting/share', () => engine)

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}))

const { enableShareAction, disableShareAction, regenerateShareAction } = await import('@/features/gifting/actions')

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserId.mockResolvedValue('u1')
})

describe('enableShareAction', () => {
  it('refuses a signed-out caller without touching the engine', async () => {
    getCurrentUserId.mockResolvedValue(null)
    const result = await enableShareAction('a1')
    expect(result.ok).toBe(false)
    expect(engine.enableShare).not.toHaveBeenCalled()
  })

  it('rejects a non-string addressId without touching the engine', async () => {
    const result = await enableShareAction({ hostile: true })
    expect(result.ok).toBe(false)
    expect(engine.enableShare).not.toHaveBeenCalled()
  })

  it('passes the caller id and address through on success', async () => {
    engine.enableShare.mockResolvedValue({ ok: true, token: 'tok' })
    const result = await enableShareAction('a1')
    expect(engine.enableShare).toHaveBeenCalledWith('u1', 'a1')
    expect(result).toEqual({ ok: true, token: 'tok' })
  })
})

describe('disableShareAction / regenerateShareAction', () => {
  it('both refuse a signed-out caller', async () => {
    getCurrentUserId.mockResolvedValue(null)
    expect((await disableShareAction()).ok).toBe(false)
    expect((await regenerateShareAction()).ok).toBe(false)
    expect(engine.disableShare).not.toHaveBeenCalled()
    expect(engine.regenerateShareToken).not.toHaveBeenCalled()
  })
})
