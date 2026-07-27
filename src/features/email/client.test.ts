import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `sendEmail` is a best-effort caller-facing wrapper — it must never throw,
 * so every branch is asserted by its RETURN VALUE, not a thrown error. The
 * `resend` module itself is mocked (per the project's REST-client-mock
 * idiom in `payments.test.ts`/`shipping.test.ts`); `RESEND_API_KEY` and
 * `EMAIL_FROM` are read from `process.env` *inside* `sendEmail` on every
 * call (never at module scope), so plain `vi.stubEnv`/`vi.unstubAllEnvs`
 * around each test is enough — no `vi.resetModules()` + dynamic re-import
 * dance (that's only needed for modules that read env at import time, like
 * `@/lib/env` in `seo.test.ts`).
 */

const sendMock = vi.fn()
const ResendMock = vi.fn(function Resend() {
  return { emails: { send: sendMock } }
})

vi.mock('resend', () => ({ Resend: ResendMock }))

const { sendEmail } = await import('@/features/email/client')

const API_KEY = 're_test_123'
const FROM = 'MSE Lux <no-reply@mselux.example>'

const INPUT = { to: 'buyer@example.com', subject: 'Order confirmed', html: '<p>Thanks!</p>' }

describe('sendEmail', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    consoleErrorSpy.mockRestore()
  })

  it('returns not-configured (and never constructs Resend) when RESEND_API_KEY is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', undefined)
    vi.stubEnv('EMAIL_FROM', FROM)

    const result = await sendEmail(INPUT)

    expect(result).toEqual({ ok: false, error: 'not-configured' })
    expect(ResendMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  it('returns not-configured (and never constructs Resend) when EMAIL_FROM is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', API_KEY)
    vi.stubEnv('EMAIL_FROM', undefined)

    const result = await sendEmail(INPUT)

    expect(result).toEqual({ ok: false, error: 'not-configured' })
    expect(ResendMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  it('constructs Resend with the key and sends from/to/subject/html exactly, returning the id', async () => {
    vi.stubEnv('RESEND_API_KEY', API_KEY)
    vi.stubEnv('EMAIL_FROM', FROM)
    sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null })

    const result = await sendEmail(INPUT)

    expect(ResendMock).toHaveBeenCalledWith(API_KEY)
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith({ from: FROM, to: INPUT.to, subject: INPUT.subject, html: INPUT.html })
    expect(result).toEqual({ ok: true, id: 'email_123' })
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('returns send-failed (logged) when Resend resolves with an error payload', async () => {
    vi.stubEnv('RESEND_API_KEY', API_KEY)
    vi.stubEnv('EMAIL_FROM', FROM)
    sendMock.mockResolvedValue({ data: null, error: { message: 'invalid from address', statusCode: 422, name: 'invalid_from_address' } })

    const result = await sendEmail(INPUT)

    expect(result).toEqual({ ok: false, error: 'send-failed' })
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  it('returns send-failed (logged, never rethrows) when emails.send throws', async () => {
    vi.stubEnv('RESEND_API_KEY', API_KEY)
    vi.stubEnv('EMAIL_FROM', FROM)
    sendMock.mockRejectedValue(new Error('network down'))

    const result = await sendEmail(INPUT)

    expect(result).toEqual({ ok: false, error: 'send-failed' })
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  it('returns send-failed (logged) within the 5s cap when emails.send never resolves', async () => {
    vi.useFakeTimers()
    try {
      vi.stubEnv('RESEND_API_KEY', API_KEY)
      vi.stubEnv('EMAIL_FROM', FROM)
      sendMock.mockImplementation(() => new Promise(() => {})) // never settles

      const pending = sendEmail(INPUT)

      await vi.advanceTimersByTimeAsync(5000)

      const result = await pending

      expect(result).toEqual({ ok: false, error: 'send-failed' })
      expect(consoleErrorSpy).toHaveBeenCalledWith('[sendEmail] timed out after 5000ms')
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears the timeout on the happy path so no timer is left pending', async () => {
    vi.useFakeTimers()
    try {
      vi.stubEnv('RESEND_API_KEY', API_KEY)
      vi.stubEnv('EMAIL_FROM', FROM)
      sendMock.mockResolvedValue({ data: { id: 'email_123' }, error: null })

      const result = await sendEmail(INPUT)

      expect(result).toEqual({ ok: true, id: 'email_123' })
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
