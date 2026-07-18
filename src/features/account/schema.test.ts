import { describe, expect, it } from 'vitest'
import { forgotSchema, loginSchema, profileSchema, resetSchema, signupSchema } from '@/features/account/schema'

describe('account schemas', () => {
  it('loginSchema: valid email + 8-char password; rejects short password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'abcdefgh' }).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false)
  })
  it('signupSchema: requires matching confirmPassword', () => {
    const base = { name: 'Ada', email: 'a@b.com', password: 'abcdefgh' }
    expect(signupSchema.safeParse({ ...base, confirmPassword: 'abcdefgh' }).success).toBe(true)
    expect(signupSchema.safeParse({ ...base, confirmPassword: 'different' }).success).toBe(false)
  })
  it('forgot/reset/profile', () => {
    expect(forgotSchema.safeParse({ email: 'a@b.com' }).success).toBe(true)
    expect(resetSchema.safeParse({ password: 'abcdefgh', confirmPassword: 'nope' }).success).toBe(false)
    expect(profileSchema.safeParse({ name: 'Ada', email: 'a@b.com' }).success).toBe(true)
  })
})
