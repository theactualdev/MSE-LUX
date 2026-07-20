import { describe, expect, it } from 'vitest'
import {
  forgotSchema,
  loginSchema,
  loginServerSchema,
  profileSchema,
  resetSchema,
  signupSchema,
  signupServerSchema,
} from '@/features/account/schema'

describe('account schemas', () => {
  it('loginSchema: valid email + 8-char password; rejects short password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'abcdefgh' }).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false)
  })
  it('loginServerSchema: only requires a non-empty password, unlike the client min(8)', () => {
    expect(loginServerSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(true)
    expect(loginServerSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false)
  })
  it('signupSchema: requires matching confirmPassword', () => {
    const base = { name: 'Ada', email: 'a@b.com', password: 'abcdefgh' }
    expect(signupSchema.safeParse({ ...base, confirmPassword: 'abcdefgh' }).success).toBe(true)
    expect(signupSchema.safeParse({ ...base, confirmPassword: 'different' }).success).toBe(false)
  })
  it('signupSchema: rejects a name over 100 characters', () => {
    const base = { email: 'a@b.com', password: 'abcdefgh', confirmPassword: 'abcdefgh' }
    expect(signupSchema.safeParse({ ...base, name: 'A'.repeat(100) }).success).toBe(true)
    expect(signupSchema.safeParse({ ...base, name: 'A'.repeat(101) }).success).toBe(false)
  })
  it('signupServerSchema: validates name/email/password without confirmPassword', () => {
    expect(
      signupServerSchema.safeParse({ name: 'Ada', email: 'a@b.com', password: 'abcdefgh' }).success,
    ).toBe(true)
    expect(signupServerSchema.safeParse({ name: 'A'.repeat(101), email: 'a@b.com', password: 'abcdefgh' }).success).toBe(
      false,
    )
  })
  it('forgot/reset/profile', () => {
    expect(forgotSchema.safeParse({ email: 'a@b.com' }).success).toBe(true)
    expect(resetSchema.safeParse({ password: 'abcdefgh', confirmPassword: 'nope' }).success).toBe(false)
    expect(profileSchema.safeParse({ name: 'Ada', email: 'a@b.com' }).success).toBe(true)
  })
  it('profileSchema: rejects a name over 100 characters, matching signup', () => {
    const base = { email: 'a@b.com' }
    expect(profileSchema.safeParse({ ...base, name: 'A'.repeat(100) }).success).toBe(true)
    expect(profileSchema.safeParse({ ...base, name: 'A'.repeat(101) }).success).toBe(false)
  })
})
