import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `checkRateLimit` mirrors `sendEmail`'s (`src/features/email/client.ts`)
 * shape: secrets (`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`) are
 * read from `process.env` *inside* the function on every call, never at
 * module scope, so plain `vi.stubEnv`/`vi.unstubAllEnvs` around each test is
 * enough — no `vi.resetModules()` + dynamic re-import dance (that's only
 * needed for modules that read env at import time, like `@/lib/env`).
 *
 * `@upstash/ratelimit`, `@upstash/redis`, and `next/headers` are all mocked
 * (per the project's REST-client-mock idiom in `payments.test.ts`).
 *
 * THE DEFINING PROPERTY under test throughout: fail OPEN. Every failure mode
 * — missing env, a throwing limiter — must resolve `true` (proceed), never
 * throw, and must log via `console.error`. The "limiter throws -> true" case
 * is the single most important test here: it's the property that keeps
 * checkout alive during an Upstash incident.
 */

const limitMock = vi.fn()
const RatelimitMock = vi.fn(function Ratelimit(config: { prefix: string }) {
  void config
  return { limit: limitMock }
})
const slidingWindowMock = vi.fn((limit: number, window: string) => ({ algorithm: 'sliding-window', limit, window }))
;(RatelimitMock as unknown as { slidingWindow: typeof slidingWindowMock }).slidingWindow = slidingWindowMock

vi.mock('@upstash/ratelimit', () => ({ Ratelimit: RatelimitMock }))

const RedisMock = vi.fn(function Redis() {
  return {}
})
vi.mock('@upstash/redis', () => ({ Redis: RedisMock }))

const headersMock = vi.fn()
vi.mock('next/headers', () => ({ headers: (...args: unknown[]) => headersMock(...args) }))

const { checkRateLimit, RATE_LIMITS } = await import('@/lib/rate-limit')

const URL = 'https://example.upstash.io'
const TOKEN = 'test-token'

function headerStore(entries: Record<string, string>) {
  const h = new Headers()
  for (const [key, value] of Object.entries(entries)) h.set(key, value)
  return h
}

describe('checkRateLimit', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    headersMock.mockResolvedValue(headerStore({}))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    consoleErrorSpy.mockRestore()
  })

  it('returns true (fails open) and logs once, without constructing Redis, when UPSTASH_REDIS_REST_URL is missing', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', undefined)
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', TOKEN)

    const result = await checkRateLimit('payment', 'ip-1')

    expect(result).toBe(true)
    expect(RedisMock).not.toHaveBeenCalled()
    expect(RatelimitMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  it('returns true (fails open) and logs once, without constructing Redis, when UPSTASH_REDIS_REST_TOKEN is missing', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', URL)
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', undefined)

    const result = await checkRateLimit('payment', 'ip-1')

    expect(result).toBe(true)
    expect(RedisMock).not.toHaveBeenCalled()
    expect(RatelimitMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  it('returns true when configured and the limiter reports success', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', URL)
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', TOKEN)
    limitMock.mockResolvedValue({ success: true })

    const result = await checkRateLimit('payment', 'ip-1')

    expect(result).toBe(true)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('returns false when configured and the limiter reports blocked', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', URL)
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', TOKEN)
    limitMock.mockResolvedValue({ success: false })

    const result = await checkRateLimit('payment', 'ip-1')

    expect(result).toBe(false)
  })

  // Pinned: the property that keeps checkout alive during an Upstash incident.
  it('returns true (fails open) and logs when the limiter throws', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', URL)
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', TOKEN)
    limitMock.mockRejectedValue(new Error('upstash unreachable'))

    const result = await checkRateLimit('payment', 'ip-1')

    expect(result).toBe(true)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  // A malformed response RESOLVES rather than throws, so it can't be caught
  // by the try/catch — `success` must be explicitly type-checked, otherwise
  // destructuring `undefined` silently reads as falsy ("block"), the exact
  // inverse of fail-open.
  it('returns true (fails open) and logs when the limiter resolves with an empty object', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', URL)
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', TOKEN)
    limitMock.mockResolvedValue({})

    const result = await checkRateLimit('payment', 'ip-1')

    expect(result).toBe(true)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  it('returns true (fails open) and logs when the limiter resolves with success: undefined', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', URL)
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', TOKEN)
    limitMock.mockResolvedValue({ success: undefined })

    const result = await checkRateLimit('payment', 'ip-1')

    expect(result).toBe(true)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  describe('identifier resolution', () => {
    beforeEach(() => {
      vi.stubEnv('UPSTASH_REDIS_REST_URL', URL)
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', TOKEN)
      limitMock.mockResolvedValue({ success: true })
    })

    it('uses the first entry of x-forwarded-for, trimmed, when no explicit identifier is given', async () => {
      headersMock.mockResolvedValue(headerStore({ 'x-forwarded-for': ' 203.0.113.5 , 70.41.3.18' }))

      await checkRateLimit('search')

      expect(limitMock).toHaveBeenCalledWith('203.0.113.5')
    })

    it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
      headersMock.mockResolvedValue(headerStore({ 'x-real-ip': '198.51.100.7' }))

      await checkRateLimit('search')

      expect(limitMock).toHaveBeenCalledWith('198.51.100.7')
    })

    it("falls back to the literal 'unknown' shared bucket when neither header is present", async () => {
      headersMock.mockResolvedValue(headerStore({}))

      await checkRateLimit('search')

      expect(limitMock).toHaveBeenCalledWith('unknown')
    })

    it('prefers x-forwarded-for over x-real-ip when both are present', async () => {
      headersMock.mockResolvedValue(headerStore({ 'x-forwarded-for': '203.0.113.5', 'x-real-ip': '198.51.100.7' }))

      await checkRateLimit('search')

      expect(limitMock).toHaveBeenCalledWith('203.0.113.5')
    })

    it('an explicit identifier argument overrides header resolution entirely', async () => {
      await checkRateLimit('search', 'user-42')

      expect(limitMock).toHaveBeenCalledWith('user-42')
      expect(headersMock).not.toHaveBeenCalled()
    })
  })

  describe('per-kind namespacing', () => {
    beforeEach(() => {
      vi.stubEnv('UPSTASH_REDIS_REST_URL', URL)
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', TOKEN)
      limitMock.mockResolvedValue({ success: true })
    })

    it.each(Object.keys(RATE_LIMITS) as (keyof typeof RATE_LIMITS)[])(
      'namespaces the Redis key with prefix mse:%s and the configured window',
      async (kind) => {
        const { limit, windowSeconds } = RATE_LIMITS[kind]

        await checkRateLimit(kind, 'ip-1')

        expect(RatelimitMock).toHaveBeenCalledWith(
          expect.objectContaining({ prefix: `mse:${kind}` }),
        )
        expect(slidingWindowMock).toHaveBeenCalledWith(limit, `${windowSeconds} s`)
      },
    )

    it('does not collide windows between two different kinds', async () => {
      await checkRateLimit('payment', 'ip-1')
      await checkRateLimit('search', 'ip-1')

      const prefixes = RatelimitMock.mock.calls.map((call) => (call[0] as { prefix: string }).prefix)
      expect(prefixes).toEqual(['mse:payment', 'mse:search'])
    })
  })
})

describe('RATE_LIMITS', () => {
  it('pins the named window values', () => {
    expect(RATE_LIMITS).toEqual({
      payment: { limit: 10, windowSeconds: 60 },
      checkout: { limit: 20, windowSeconds: 60 },
      search: { limit: 60, windowSeconds: 60 },
      auth: { limit: 10, windowSeconds: 300 },
    })
  })
})
