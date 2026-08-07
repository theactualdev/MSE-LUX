import { describe, it, expect } from 'vitest'
import { contactSchema, addressSchema } from '@/features/checkout/schema'

describe('checkout schemas', () => {
  it('accepts a valid email and rejects a bad one', () => {
    expect(contactSchema.safeParse({ email: 'a@b.com' }).success).toBe(true)
    expect(contactSchema.safeParse({ email: 'nope' }).success).toBe(false)
  })
  it('requires the core address fields', () => {
    const ok = { fullName: 'Ada Lovelace', phone: '08012345678', line1: '1 Marina', city: 'Lagos', state: 'Lagos', country: 'Nigeria' }
    expect(addressSchema.safeParse(ok).success).toBe(true)
    expect(addressSchema.safeParse({ ...ok, fullName: '' }).success).toBe(false)
  })

  it('caps every address field so an authenticated caller cannot store unbounded rows', () => {
    const ok = { fullName: 'Ada Lovelace', phone: '08012345678', line1: '1 Marina', city: 'Lagos', state: 'Lagos', country: 'Nigeria' }
    expect(addressSchema.safeParse(ok).success).toBe(true)

    expect(addressSchema.safeParse({ ...ok, fullName: 'A'.repeat(101) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, phone: '1'.repeat(33) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, line1: 'A'.repeat(201) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, line2: 'A'.repeat(201) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, city: 'A'.repeat(101) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, state: 'A'.repeat(101) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, country: 'A'.repeat(101) }).success).toBe(false)
    expect(addressSchema.safeParse({ ...ok, postalCode: '1'.repeat(21) }).success).toBe(false)
  })

  // Fix 5: this cap also gates guest checkout (Phase 2b), so it must never
  // reject a genuine formatted international number with an extension —
  // "+44 (0) 20 7946 0958" is exactly 20 characters, the old cap.
  it('accepts a formatted international phone number with an extension', () => {
    const ok = { fullName: 'Ada Lovelace', phone: '08012345678', line1: '1 Marina', city: 'Lagos', state: 'Lagos', country: 'Nigeria' }
    expect(addressSchema.safeParse({ ...ok, phone: '+44 (0) 20 7946 0958 x123' }).success).toBe(true)
  })
})

/**
 * The full-name rules exist because ShipBubble's address validation refuses a
 * single-word name (verified live: 422 "Please provide a full name"), and a
 * refused validation silently degrades every quote to the flat fallback —
 * which internationally undercharges the store. Rejecting at the form, with a
 * message, beats mispricing three steps later.
 */
describe('addressSchema.fullName — courier requirements', () => {
  const ok = { fullName: 'Ada Lovelace', phone: '08012345678', line1: '1 Marina', city: 'Lagos', state: 'Lagos', country: 'Nigeria' }

  it('rejects a single-word name, since the courier will', () => {
    expect(addressSchema.safeParse({ ...ok, fullName: 'Test' }).success).toBe(false)
  })

  it('rejects digits in the name', () => {
    expect(addressSchema.safeParse({ ...ok, fullName: 'Ada L0velace' }).success).toBe(false)
  })

  // Over-restricting names is how checkouts reject real customers — only the
  // two rules the courier enforces, nothing more.
  it('accepts hyphens, apostrophes and diacritics', () => {
    expect(addressSchema.safeParse({ ...ok, fullName: "Mary-Jane O'Brien" }).success).toBe(true)
    expect(addressSchema.safeParse({ ...ok, fullName: 'Adaobi Chukwuemeka-Ngozi' }).success).toBe(true)
    expect(addressSchema.safeParse({ ...ok, fullName: 'José Álvarez' }).success).toBe(true)
  })

  it('does not count stray punctuation as a second word', () => {
    expect(addressSchema.safeParse({ ...ok, fullName: 'Ada -' }).success).toBe(false)
  })
})
