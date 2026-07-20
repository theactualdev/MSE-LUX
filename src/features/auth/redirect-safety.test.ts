import { describe, it, expect } from 'vitest'
import { isSafeRedirectPath } from '@/features/auth/redirect-safety'

describe('isSafeRedirectPath', () => {
  describe('accepts genuine same-origin relative paths', () => {
    it.each([
      ['/account', '/account'],
      ['/reset-password', '/reset-password'],
      ['root path', '/'],
      ['path with a query string', '/account?tab=orders'],
      ['path with an @ character (not a userinfo/host separator here)', '/@evil.com'],
      ['path containing a literal, still-encoded percent sequence', '/..%2Fevil.com'],
    ])('%s', (_label, value) => {
      expect(isSafeRedirectPath(value)).toBe(true)
    })
  })

  describe('rejects absent/empty input', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
    ])('%s', (_label, value) => {
      expect(isSafeRedirectPath(value)).toBe(false)
    })
  })

  describe('rejects open-redirect attack shapes', () => {
    it.each([
      ['protocol-relative //', '//evil.com'],
      ['protocol-relative with a path after the host', '//evil.com/phish'],
      ['backslash immediately after the leading slash', '/\\evil.com'],
      ['double backslash (no leading single slash at all)', '\\\\evil.com'],
      ['slash then backslash then more path', '/\\/evil.com'],
      ['backslash then slash then slash', '\\/\\/evil.com'],
      ['backslash buried later in an otherwise-normal path', '/account/\\evil.com'],
      ['absolute http URL', 'http://evil.com'],
      ['absolute https URL with a path', 'https://evil.com/phish'],
      ['scheme-relative absolute URL with credentials', 'https://user:pass@evil.com'],
      ['javascript: scheme', 'javascript:alert(1)'],
      ['data: scheme', 'data:text/html,<script>alert(1)</script>'],
      ['no leading slash at all', 'evil.com'],
      ['tab before a protocol-relative host (control-char smuggling)', '/\t/evil.com'],
      ['newline before a protocol-relative host', '/\n/evil.com'],
      ['carriage return before a protocol-relative host', '/\r/evil.com'],
      ['leading tab then //', '\t//evil.com'],
      ['bare tab', '/\t'],
    ])('%s: %j', (_label, value) => {
      expect(isSafeRedirectPath(value)).toBe(false)
    })
  })
})
