import { describe, it, expect, vi, beforeEach } from 'vitest'

const getProfile = vi.fn()
const updateProfile = vi.fn()
const listAddresses = vi.fn()
const createAddress = vi.fn()
const updateAddress = vi.fn()
const deleteAddress = vi.fn()
const setDefaultAddress = vi.fn()

vi.mock('@/features/account/data', () => ({
  getProfile: (...a: unknown[]) => getProfile(...a),
  updateProfile: (...a: unknown[]) => updateProfile(...a),
  listAddresses: (...a: unknown[]) => listAddresses(...a),
  createAddress: (...a: unknown[]) => createAddress(...a),
  updateAddress: (...a: unknown[]) => updateAddress(...a),
  deleteAddress: (...a: unknown[]) => deleteAddress(...a),
  setDefaultAddress: (...a: unknown[]) => setDefaultAddress(...a),
  MAX_ADDRESSES_PER_PROFILE: 20,
}))

const revalidatePath = vi.fn()

vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}))

const {
  saveProfile,
  addAddress,
  editAddress,
  removeAddress,
  makeAddressDefault,
} = await import('@/features/account/actions')

const VALID_ADDRESS = {
  fullName: 'Ada Lovelace',
  phone: '0801 234 5678',
  line1: '4 Admiralty Way',
  line2: '',
  city: 'Lekki',
  state: 'Lagos',
  country: 'Nigeria',
  postalCode: '',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('saveProfile', () => {
  it('saves a valid patch and revalidates the account pages', async () => {
    updateProfile.mockResolvedValue({ ok: true })

    await expect(saveProfile({ name: 'Ada Byron', phone: '0812' })).resolves.toEqual({})

    expect(updateProfile).toHaveBeenCalledWith({
      name: 'Ada Byron',
      phone: '0812',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/account')
  })

  it('re-validates server-side and rejects a payload the client form would have blocked', async () => {
    // A `'use server'` export is a public HTTP endpoint — RHF's resolver only
    // ever ran in the browser, so this is the real validation boundary.
    await expect(saveProfile({ name: '' } as never)).resolves.toEqual({
      error: 'Please check your details and try again.',
    })
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('rejects a name past the schema maximum', async () => {
    await expect(saveProfile({ name: 'a'.repeat(101) })).resolves.toEqual({
      error: 'Please check your details and try again.',
    })
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('never forwards an email even if the caller smuggles one in — Profile.email is read-only from this action', async () => {
    updateProfile.mockResolvedValue({ ok: true })

    await saveProfile({ name: 'Ada', email: 'attacker@example.com', phone: '0812' } as never)

    expect(updateProfile).toHaveBeenCalledWith({ name: 'Ada', phone: '0812' })
  })

  it('returns fixed generic copy for a data-layer failure', async () => {
    updateProfile.mockResolvedValue({ ok: false, reason: 'not-found' })

    await expect(saveProfile({ name: 'Ada' })).resolves.toEqual({
      error: 'Something went wrong. Please try again.',
    })
  })

  it('returns fixed generic copy for an unauthenticated caller', async () => {
    updateProfile.mockResolvedValue({ ok: false, reason: 'unauthenticated' })

    await expect(saveProfile({ name: 'Ada' })).resolves.toEqual({
      error: 'Something went wrong. Please try again.',
    })
  })
})

describe('addAddress', () => {
  it('creates a valid address and revalidates', async () => {
    createAddress.mockResolvedValue({ ok: true })

    await expect(addAddress(VALID_ADDRESS)).resolves.toEqual({})
    expect(createAddress).toHaveBeenCalledWith(VALID_ADDRESS)
    expect(revalidatePath).toHaveBeenCalledWith('/account/addresses')
  })

  it('rejects an invalid address server-side', async () => {
    await expect(addAddress({ ...VALID_ADDRESS, line1: '' })).resolves.toEqual({
      error: 'Please check the address details and try again.',
    })
    expect(createAddress).not.toHaveBeenCalled()
  })

  it('never forwards extra keys the client did not have a field for', async () => {
    createAddress.mockResolvedValue({ ok: true })

    await addAddress({ ...VALID_ADDRESS, profileId: 'someone-else', isDefault: true } as never)

    expect(createAddress).toHaveBeenCalledWith(VALID_ADDRESS)
  })

  it('surfaces the address cap as its own message', async () => {
    createAddress.mockResolvedValue({ ok: false, reason: 'limit-reached' })

    await expect(addAddress(VALID_ADDRESS)).resolves.toEqual({
      error: expect.stringMatching(/limit/i),
    })
  })

  it('surfaces a concurrent-insert conflict as the generic message rather than throwing', async () => {
    createAddress.mockResolvedValue({ ok: false, reason: 'conflict' })

    await expect(addAddress(VALID_ADDRESS)).resolves.toEqual({
      error: 'Something went wrong. Please try again.',
    })
  })
})

describe('editAddress', () => {
  it('passes the id through and revalidates on success', async () => {
    updateAddress.mockResolvedValue({ ok: true })

    await expect(editAddress('addr-1', VALID_ADDRESS)).resolves.toEqual({})
    expect(updateAddress).toHaveBeenCalledWith('addr-1', VALID_ADDRESS)
  })

  it('rejects an empty id without calling the data layer', async () => {
    await expect(editAddress('', VALID_ADDRESS)).resolves.toEqual({
      error: 'Please check the address details and try again.',
    })
    expect(updateAddress).not.toHaveBeenCalled()
  })

  it('reports another user\'s row with the same copy as a missing one', async () => {
    // Deliberately indistinguishable: telling a caller "that exists but is
    // not yours" is an ownership oracle over guessable ids.
    updateAddress.mockResolvedValue({ ok: false, reason: 'not-found' })

    await expect(editAddress('someone-elses', VALID_ADDRESS)).resolves.toEqual({
      error: 'That address is no longer available.',
    })
  })
})

describe('removeAddress', () => {
  it('deletes and revalidates', async () => {
    deleteAddress.mockResolvedValue({ ok: true })

    await expect(removeAddress('addr-1')).resolves.toEqual({})
    expect(deleteAddress).toHaveBeenCalledWith('addr-1')
    expect(revalidatePath).toHaveBeenCalledWith('/account/addresses')
  })

  it('rejects a non-string id', async () => {
    await expect(removeAddress(42 as never)).resolves.toEqual({
      error: 'That address is no longer available.',
    })
    expect(deleteAddress).not.toHaveBeenCalled()
  })
})

describe('makeAddressDefault', () => {
  it('sets the default and revalidates', async () => {
    setDefaultAddress.mockResolvedValue({ ok: true })

    await expect(makeAddressDefault('addr-2')).resolves.toEqual({})
    expect(setDefaultAddress).toHaveBeenCalledWith('addr-2')
    expect(revalidatePath).toHaveBeenCalledWith('/account/addresses')
  })

  it('rejects an empty id', async () => {
    await expect(makeAddressDefault('')).resolves.toEqual({
      error: 'That address is no longer available.',
    })
    expect(setDefaultAddress).not.toHaveBeenCalled()
  })
})
