import { describe, expect, it } from 'vitest'
import { addAddress, buildMockUser, removeAddress, setDefault, updateAddress } from '@/features/account/lib/mock-user'
import type { Address } from '@/features/checkout/schema'

const addr = (fullName: string): Address => ({
  fullName, phone: '080', line1: '1 St', city: 'Lagos', state: 'Lagos', country: 'Nigeria',
})

describe('buildMockUser', () => {
  it('derives a name from the email local part when none given, and seeds ≥1 default address', () => {
    const u = buildMockUser('ada.buyer@example.com')
    expect(u.email).toBe('ada.buyer@example.com')
    expect(u.name.length).toBeGreaterThan(0)
    expect(u.addresses.length).toBeGreaterThanOrEqual(1)
    expect(u.addresses.filter((a) => a.isDefault)).toHaveLength(1)
  })
  it('uses the provided name', () => {
    expect(buildMockUser('a@b.com', 'Ada B').name).toBe('Ada B')
  })
})

describe('address helpers', () => {
  it('addAddress: first is default, later are not; assigns the id', () => {
    let list = addAddress([], addr('A'), 'id1')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'id1', isDefault: true, fullName: 'A' })
    list = addAddress(list, addr('B'), 'id2')
    expect(list[1].isDefault).toBe(false)
  })
  it('setDefault keeps exactly one default', () => {
    let list = addAddress(addAddress([], addr('A'), 'id1'), addr('B'), 'id2')
    list = setDefault(list, 'id2')
    expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual(['id2'])
  })
  it('updateAddress patches fields; removeAddress drops and repairs the default', () => {
    let list = addAddress(addAddress([], addr('A'), 'id1'), addr('B'), 'id2')
    list = updateAddress(list, 'id2', { city: 'Abuja' })
    expect(list.find((a) => a.id === 'id2')?.city).toBe('Abuja')
    list = removeAddress(list, 'id1') // removed the default
    expect(list).toHaveLength(1)
    expect(list.filter((a) => a.isDefault)).toHaveLength(1) // default repaired to remaining
  })
})
