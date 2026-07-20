import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The whole point of `data.ts` is that authorization lives in the query
 * scoping, not in RLS (Prisma connects through the pooler as a privileged
 * role and bypasses RLS entirely). So these tests assert on the *shape of the
 * `where` clause Prisma is called with*, not just on return values — a
 * function that returned the right data while forgetting `profileId` in its
 * filter would be a cross-tenant read, and only an argument assertion catches
 * that.
 */

const profile = {
  findUnique: vi.fn(),
  update: vi.fn(),
}

const address = {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
}

const tx = { profile, address }

const $transaction = vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx))

vi.mock('@/lib/db', () => ({
  db: {
    get profile() {
      return profile
    },
    get address() {
      return address
    },
    $transaction: (...args: [(client: typeof tx) => unknown]) => $transaction(...args),
  },
}))

const getCurrentUserId = vi.fn()

vi.mock('@/features/auth/claims', () => ({
  getCurrentUserId: () => getCurrentUserId(),
}))

const {
  getProfile,
  updateProfile,
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = await import('@/features/account/data')

const USER_ID = '11111111-1111-4111-8111-111111111111'

const ADDRESS_INPUT = {
  fullName: 'Ada Lovelace',
  phone: '0801 234 5678',
  line1: '4 Admiralty Way',
  line2: '',
  city: 'Lekki',
  state: 'Lagos',
  country: 'Nigeria',
  postalCode: '',
}

function dbAddress(overrides: Record<string, unknown> = {}) {
  return {
    id: 'addr-1',
    profileId: USER_ID,
    isDefault: true,
    ...ADDRESS_INPUT,
    line2: null,
    postalCode: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserId.mockResolvedValue(USER_ID)
})

describe('getProfile', () => {
  it('scopes the lookup to the session user id', async () => {
    profile.findUnique.mockResolvedValue({
      id: USER_ID,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
    })

    await expect(getProfile()).resolves.toEqual({
      id: USER_ID,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '',
    })
    expect(profile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } }),
    )
  })

  it('returns null without touching the database when unauthenticated', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(getProfile()).resolves.toBeNull()
    expect(profile.findUnique).not.toHaveBeenCalled()
  })

  it('returns null when the trigger-provisioned row is somehow missing', async () => {
    profile.findUnique.mockResolvedValue(null)

    await expect(getProfile()).resolves.toBeNull()
  })
})

describe('updateProfile', () => {
  it('writes only to the session user\'s row', async () => {
    profile.update.mockResolvedValue({
      id: USER_ID,
      name: 'Ada Byron',
      email: 'ada@example.com',
      phone: '0812',
    })

    await expect(
      updateProfile({ name: 'Ada Byron', email: 'ada@example.com', phone: '0812' }),
    ).resolves.toEqual({ ok: true })

    expect(profile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { name: 'Ada Byron', email: 'ada@example.com', phone: '0812' },
      }),
    )
  })

  it('normalises an empty phone to null rather than an empty string', async () => {
    profile.update.mockResolvedValue({})

    await updateProfile({ name: 'Ada', email: 'ada@example.com', phone: '' })

    expect(profile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: null }) }),
    )
  })

  it('refuses to write when unauthenticated', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(updateProfile({ name: 'A', email: 'a@b.com' })).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    })
    expect(profile.update).not.toHaveBeenCalled()
  })

  it('reports a duplicate email as a conflict instead of throwing', async () => {
    profile.update.mockRejectedValue({ code: 'P2002' })

    await expect(updateProfile({ name: 'A', email: 'taken@example.com' })).resolves.toEqual({
      ok: false,
      reason: 'email-taken',
    })
  })
})

describe('listAddresses', () => {
  it('scopes to the session user and puts the default first', async () => {
    address.findMany.mockResolvedValue([dbAddress()])

    await expect(listAddresses()).resolves.toEqual([
      { id: 'addr-1', isDefault: true, ...ADDRESS_INPUT },
    ])
    expect(address.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profileId: USER_ID },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
    )
  })

  it('returns an empty list without touching the database when unauthenticated', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(listAddresses()).resolves.toEqual([])
    expect(address.findMany).not.toHaveBeenCalled()
  })
})

describe('createAddress', () => {
  it('stamps the session user id on the new row', async () => {
    address.count.mockResolvedValue(1)
    address.create.mockResolvedValue(dbAddress({ id: 'addr-2', isDefault: false }))

    await expect(createAddress(ADDRESS_INPUT)).resolves.toEqual({ ok: true })

    expect(address.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ profileId: USER_ID, isDefault: false }),
      }),
    )
  })

  it('makes the very first address the default', async () => {
    address.count.mockResolvedValue(0)
    address.create.mockResolvedValue(dbAddress())

    await createAddress(ADDRESS_INPUT)

    expect(address.count).toHaveBeenCalledWith({ where: { profileId: USER_ID } })
    expect(address.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) }),
    )
  })

  it('runs the count and the insert in one transaction', async () => {
    address.count.mockResolvedValue(0)
    address.create.mockResolvedValue(dbAddress())

    await createAddress(ADDRESS_INPUT)

    expect($transaction).toHaveBeenCalled()
  })

  it('refuses to write when unauthenticated', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(createAddress(ADDRESS_INPUT)).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    })
    expect(address.create).not.toHaveBeenCalled()
  })
})

describe('updateAddress', () => {
  it('filters by BOTH the row id and the session user id', async () => {
    address.updateMany.mockResolvedValue({ count: 1 })

    await expect(updateAddress('addr-1', ADDRESS_INPUT)).resolves.toEqual({ ok: true })

    expect(address.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'addr-1', profileId: USER_ID } }),
    )
  })

  it('reports not-found when the row belongs to somebody else', async () => {
    address.updateMany.mockResolvedValue({ count: 0 })

    await expect(updateAddress('someone-elses-addr', ADDRESS_INPUT)).resolves.toEqual({
      ok: false,
      reason: 'not-found',
    })
  })

  it('never lets a patch move a row to another profile or flip isDefault', async () => {
    address.updateMany.mockResolvedValue({ count: 1 })

    await updateAddress('addr-1', {
      ...ADDRESS_INPUT,
      // Extra keys a hand-rolled POST could smuggle in.
      profileId: 'someone-else',
      isDefault: true,
      id: 'another-id',
    } as never)

    const data = address.updateMany.mock.calls[0][0].data
    expect(data).not.toHaveProperty('profileId')
    expect(data).not.toHaveProperty('isDefault')
    expect(data).not.toHaveProperty('id')
  })
})

describe('deleteAddress', () => {
  it('filters by BOTH the row id and the session user id', async () => {
    address.findFirst.mockResolvedValue({ id: 'addr-1', isDefault: false })
    address.deleteMany.mockResolvedValue({ count: 1 })

    await expect(deleteAddress('addr-1')).resolves.toEqual({ ok: true })

    expect(address.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'addr-1', profileId: USER_ID } }),
    )
    expect(address.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'addr-1', profileId: USER_ID } }),
    )
  })

  it('promotes the oldest remaining address when the default is deleted', async () => {
    address.findFirst
      .mockResolvedValueOnce({ id: 'addr-1', isDefault: true })
      .mockResolvedValueOnce({ id: 'addr-2', isDefault: false })
    address.deleteMany.mockResolvedValue({ count: 1 })
    address.updateMany.mockResolvedValue({ count: 1 })

    await deleteAddress('addr-1')

    expect(address.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'addr-2', profileId: USER_ID },
        data: { isDefault: true },
      }),
    )
  })

  it('does not promote anything when a non-default address is deleted', async () => {
    address.findFirst.mockResolvedValue({ id: 'addr-2', isDefault: false })
    address.deleteMany.mockResolvedValue({ count: 1 })

    await deleteAddress('addr-2')

    expect(address.updateMany).not.toHaveBeenCalled()
  })

  it('reports not-found for somebody else\'s row', async () => {
    address.findFirst.mockResolvedValue(null)

    await expect(deleteAddress('someone-elses-addr')).resolves.toEqual({
      ok: false,
      reason: 'not-found',
    })
    expect(address.deleteMany).not.toHaveBeenCalled()
  })
})

describe('setDefaultAddress', () => {
  it('clears every other default BEFORE setting the new one', async () => {
    address.findFirst.mockResolvedValue({ id: 'addr-2' })
    address.updateMany.mockResolvedValue({ count: 1 })
    address.update.mockResolvedValue(dbAddress({ id: 'addr-2' }))

    await expect(setDefaultAddress('addr-2')).resolves.toEqual({ ok: true })

    // The partial unique index `Address_one_default_per_profile` makes the
    // order load-bearing: setting the new default first would collide with
    // the outgoing one mid-statement.
    const clearOrder = address.updateMany.mock.invocationCallOrder[0]
    const setOrder = address.update.mock.invocationCallOrder[0]
    expect(clearOrder).toBeLessThan(setOrder)

    expect(address.updateMany).toHaveBeenCalledWith({
      where: { profileId: USER_ID, isDefault: true },
      data: { isDefault: false },
    })
    expect(address.update).toHaveBeenCalledWith({
      where: { id: 'addr-2' },
      data: { isDefault: true },
    })
  })

  it('runs the clear and the set inside a single transaction', async () => {
    address.findFirst.mockResolvedValue({ id: 'addr-2' })
    address.updateMany.mockResolvedValue({ count: 1 })
    address.update.mockResolvedValue(dbAddress())

    await setDefaultAddress('addr-2')

    expect($transaction).toHaveBeenCalledTimes(1)
  })

  it('verifies ownership before writing anything', async () => {
    address.findFirst.mockResolvedValue(null)

    await expect(setDefaultAddress('someone-elses-addr')).resolves.toEqual({
      ok: false,
      reason: 'not-found',
    })
    expect(address.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'someone-elses-addr', profileId: USER_ID } }),
    )
    expect(address.updateMany).not.toHaveBeenCalled()
    expect(address.update).not.toHaveBeenCalled()
  })

  it('refuses to write when unauthenticated', async () => {
    getCurrentUserId.mockResolvedValue(null)

    await expect(setDefaultAddress('addr-1')).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    })
    expect($transaction).not.toHaveBeenCalled()
  })
})
