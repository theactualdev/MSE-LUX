import { describe, it, expect } from 'vitest'
import { callbackErrorMessage } from '@/features/auth/callback-errors'

describe('callbackErrorMessage', () => {
  it('resolves "auth" to a generic, non-enumerating message', () => {
    expect(callbackErrorMessage('auth')).toBe("We couldn't sign you in. Please try again.")
  })

  it('resolves "recovery" to an actionable, non-enumerating message', () => {
    const message = callbackErrorMessage('recovery')
    expect(message).toBe('This password reset link is no longer valid. Request a new one and try again.')
  })

  it('the two messages are distinct', () => {
    expect(callbackErrorMessage('auth')).not.toBe(callbackErrorMessage('recovery'))
  })

  it.each([
    ['undefined (no error param at all)', undefined],
    ['an unrecognized value', 'something-else'],
    ['an empty string', ''],
  ])('returns undefined for %s', (_label, value) => {
    expect(callbackErrorMessage(value)).toBeUndefined()
  })

  it('takes the first value when Next hands back an array (repeated ?error= param)', () => {
    expect(callbackErrorMessage(['recovery', 'auth'])).toBe(
      'This password reset link is no longer valid. Request a new one and try again.',
    )
  })

  it('returns undefined for an array whose first value is unrecognized', () => {
    expect(callbackErrorMessage(['bogus', 'auth'])).toBeUndefined()
  })
})
