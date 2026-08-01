import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCurrentUserId = vi.hoisted(() => vi.fn())
vi.mock('@/features/auth/claims', () => ({ getCurrentUserId }))

const engine = vi.hoisted(() => ({
  enableShare: vi.fn(),
  disableShare: vi.fn(),
  regenerateShareToken: vi.fn(),
  getShareState: vi.fn(),
}))
vi.mock('@/features/gifting/share', () => engine)

const accountData = vi.hoisted(() => ({ listAddresses: vi.fn() }))
vi.mock('@/features/account/data', () => accountData)

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}))

const { enableShareAction, disableShareAction, regenerateShareAction, getSharePanelDataAction } = await import(
  '@/features/gifting/actions'
)

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

describe('getSharePanelDataAction', () => {
  it('returns null for a signed-out caller without touching the engine or address store', async () => {
    getCurrentUserId.mockResolvedValue(null)
    const result = await getSharePanelDataAction()
    expect(result).toBeNull()
    expect(engine.getShareState).not.toHaveBeenCalled()
    expect(accountData.listAddresses).not.toHaveBeenCalled()
  })

  it('combines the share state and addresses for the current session', async () => {
    engine.getShareState.mockResolvedValue({ enabled: true, token: 'tok', addressId: 'a1' })
    accountData.listAddresses.mockResolvedValue([
      {
        id: 'a1',
        isDefault: true,
        fullName: 'Ada Lovelace',
        phone: '0800 000 0000',
        line1: '12 Marina Road',
        line2: '',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        postalCode: '',
      },
    ])

    const result = await getSharePanelDataAction()

    expect(engine.getShareState).toHaveBeenCalledWith('u1')
    expect(result).toEqual({
      shareState: { enabled: true, token: 'tok', addressId: 'a1' },
      addresses: [{ id: 'a1', fullName: 'Ada Lovelace', city: 'Lagos', state: 'Lagos' }],
    })
  })

  it('never lets a street address field reach the returned shape', async () => {
    engine.getShareState.mockResolvedValue({ enabled: false, token: null, addressId: null })
    accountData.listAddresses.mockResolvedValue([
      {
        id: 'a1',
        isDefault: true,
        fullName: 'Ada Lovelace',
        phone: '0800 000 0000',
        line1: '12 Marina Road',
        line2: 'Suite 4',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        postalCode: '100001',
      },
    ])

    const result = await getSharePanelDataAction()

    expect(result?.addresses[0]).toEqual({ id: 'a1', fullName: 'Ada Lovelace', city: 'Lagos', state: 'Lagos' })
    expect(Object.keys(result?.addresses[0] ?? {})).not.toContain('line1')
  })
})
