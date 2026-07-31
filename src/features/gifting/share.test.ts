import { describe, it, expect, vi, beforeEach } from 'vitest'

const wishlist = vi.hoisted(() => ({ findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), upsert: vi.fn() }))
const address = vi.hoisted(() => ({ findFirst: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { wishlist, address } }))

const { resolveShare, enableShare, disableShare, regenerateShareToken } = await import('@/features/gifting/share')

beforeEach(() => vi.clearAllMocks())

const ROW = {
  id: 'w1',
  shareEnabled: true,
  shareToken: 'tok',
  giftAddress: {
    fullName: 'Adaeze Okonkwo', phone: '+2348000000000',
    line1: '14 Adeola Odeku Street', line2: null,
    city: 'Victoria Island', state: 'Lagos', country: 'Nigeria', postalCode: '101241',
  },
  items: [{ productId: 'p1' }, { productId: 'p2' }],
}

describe('resolveShare', () => {
  it('returns the recipient first name, locality and full address for a live share', async () => {
    wishlist.findUnique.mockResolvedValue(ROW)
    const share = await resolveShare('tok')
    expect(share).toMatchObject({
      wishlistId: 'w1',
      recipientFirstName: 'Adaeze',
      city: 'Victoria Island',
      state: 'Lagos',
      productIds: ['p1', 'p2'],
    })
    expect(share?.address.line1).toBe('14 Adeola Odeku Street')
  })

  it('returns null for an unknown token', async () => {
    wishlist.findUnique.mockResolvedValue(null)
    await expect(resolveShare('nope')).resolves.toBeNull()
  })

  it('returns null when sharing is disabled — a disabled share is indistinguishable from a missing one', async () => {
    wishlist.findUnique.mockResolvedValue({ ...ROW, shareEnabled: false })
    await expect(resolveShare('tok')).resolves.toBeNull()
  })

  it('returns null when the nominated address was deleted (SetNull)', async () => {
    wishlist.findUnique.mockResolvedValue({ ...ROW, giftAddress: null })
    await expect(resolveShare('tok')).resolves.toBeNull()
  })

  it('returns null for an empty token without querying', async () => {
    await expect(resolveShare('')).resolves.toBeNull()
    expect(wishlist.findUnique).not.toHaveBeenCalled()
  })
})

describe('enableShare', () => {
  it('refuses an address that does not belong to the caller', async () => {
    address.findFirst.mockResolvedValue(null)
    await expect(enableShare('u1', 'someone-elses-address')).resolves.toEqual({ ok: false, error: 'no-address' })
    expect(wishlist.update).not.toHaveBeenCalled()
  })

  it('mints a 64-hex token on first share and pins the address', async () => {
    address.findFirst.mockResolvedValue({ id: 'a1' })
    wishlist.findUnique.mockResolvedValue({ id: 'w1', shareToken: null })
    wishlist.update.mockResolvedValue({})
    const result = await enableShare('u1', 'a1')
    if (!result.ok) throw new Error('expected ok')
    expect(result.token).toMatch(/^[0-9a-f]{64}$/)
    expect(wishlist.update.mock.calls[0][0].data).toMatchObject({
      shareEnabled: true, giftAddressId: 'a1', shareToken: result.token,
    })
  })

  it('REUSES an existing token when re-enabling — links already sent must keep working', async () => {
    address.findFirst.mockResolvedValue({ id: 'a1' })
    wishlist.findUnique.mockResolvedValue({ id: 'w1', shareToken: 'existing' })
    wishlist.update.mockResolvedValue({})
    const result = await enableShare('u1', 'a1')
    expect(result).toEqual({ ok: true, token: 'existing' })
    expect(wishlist.update.mock.calls[0][0].data.shareToken).toBeUndefined()
  })
})

describe('disableShare', () => {
  it('clears the flag but PRESERVES the token', async () => {
    wishlist.update.mockResolvedValue({})
    await disableShare('u1')
    const data = wishlist.update.mock.calls[0][0].data
    expect(data).toEqual({ shareEnabled: false })
  })
})

describe('regenerateShareToken', () => {
  it('mints a NEW token, invalidating every link previously sent', async () => {
    wishlist.findUnique.mockResolvedValue({ id: 'w1', shareToken: 'old', giftAddressId: 'a1' })
    wishlist.update.mockResolvedValue({})
    const result = await regenerateShareToken('u1')
    if (!result.ok) throw new Error('expected ok')
    expect(result.token).toMatch(/^[0-9a-f]{64}$/)
    expect(result.token).not.toBe('old')
  })

  it('refuses when the caller has never shared', async () => {
    wishlist.findUnique.mockResolvedValue(null)
    await expect(regenerateShareToken('u1')).resolves.toEqual({ ok: false, error: 'not-shared' })
  })
})
