import { describe, it, expect } from 'vitest'
import { contactSchema, addressSchema } from '@/features/checkout/schema'

describe('checkout schemas', () => {
  it('accepts a valid email and rejects a bad one', () => {
    expect(contactSchema.safeParse({ email: 'a@b.com' }).success).toBe(true)
    expect(contactSchema.safeParse({ email: 'nope' }).success).toBe(false)
  })
  it('requires the core address fields', () => {
    const ok = { fullName: 'Ada', phone: '08012345678', line1: '1 Marina', city: 'Lagos', state: 'Lagos', country: 'Nigeria' }
    expect(addressSchema.safeParse(ok).success).toBe(true)
    expect(addressSchema.safeParse({ ...ok, fullName: '' }).success).toBe(false)
  })

  it('caps every address field so an authenticated caller cannot store unbounded rows', () => {
    const ok = { fullName: 'Ada', phone: '08012345678', line1: '1 Marina', city: 'Lagos', state: 'Lagos', country: 'Nigeria' }
    expect(addressSchema.safeParse(ok).success).toBe(true)

    expect(addressSchema.safeParse({ ...ok, fullName: 'A'.repeat(101) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, phone: '1'.repeat(21) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, line1: 'A'.repeat(201) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, line2: 'A'.repeat(201) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, city: 'A'.repeat(101) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, state: 'A'.repeat(101) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, country: 'A'.repeat(101) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, postalCode: '1'.repeat(21) }).success).toBe(false)
  })
})
