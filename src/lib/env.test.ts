import { describe, it, expect } from 'vitest'
import { parseEnv } from '@/lib/env'

describe('parseEnv', () => {
  it('applies defaults when vars are missing', () => {
    const env = parseEnv({})
    expect(env.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000')
    expect(env.NEXT_PUBLIC_BRAND_NAME).toBe('MSE Lux')
  })
  it('throws on an invalid URL', () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SITE_URL: 'not-a-url' })).toThrow()
  })

  // Fix 4: `z.url()` alone accepts any WHATWG "special scheme", not just
  // http/https — `route.ts`'s SECURITY comment claims this value is always
  // an absolute http/https URL, so the schema has to actually enforce that
  // rather than merely "some URL".
  it('accepts http and https, and rejects other protocols', () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SITE_URL: 'http://example.com' })).not.toThrow()
    expect(() => parseEnv({ NEXT_PUBLIC_SITE_URL: 'https://example.com' })).not.toThrow()
    expect(() => parseEnv({ NEXT_PUBLIC_SITE_URL: 'ftp://example.com' })).toThrow()
    expect(() => parseEnv({ NEXT_PUBLIC_SITE_URL: 'javascript:alert(1)' })).toThrow()
  })
})
