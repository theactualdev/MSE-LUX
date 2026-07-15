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
})
