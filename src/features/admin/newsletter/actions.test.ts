import { describe, it, expect, vi, beforeEach } from 'vitest'

const roleSatisfies = vi.hoisted(() => vi.fn())
vi.mock('@/features/auth/claims', () => ({
  getCurrentRole: vi.fn().mockResolvedValue('CUSTOMER'),
  roleSatisfies: (...args: [unknown, unknown]) => roleSatisfies(...args),
}))

const subscriber = vi.hoisted(() => ({ findMany: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { subscriber } }))

const { exportConfirmedCsv } = await import('@/features/admin/newsletter/actions')

beforeEach(() => {
  vi.clearAllMocks()
  roleSatisfies.mockReturnValue(true)
})

describe('exportConfirmedCsv', () => {
  it('refuses a non-admin without touching the database', async () => {
    roleSatisfies.mockReturnValue(false)
    const result = await exportConfirmedCsv()
    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(subscriber.findMany).not.toHaveBeenCalled()
  })

  it('exports CONFIRMED rows only, as quoted CSV with CRLF line endings', async () => {
    subscriber.findMany.mockResolvedValue([
      { email: 'plain@example.com', confirmedAt: new Date('2026-07-31T10:00:00.000Z') },
      { email: 'has,comma@example.com', confirmedAt: new Date('2026-07-31T11:00:00.000Z') },
      { email: 'has"quote@example.com', confirmedAt: null },
    ])

    const result = await exportConfirmedCsv()
    if (!result.ok) throw new Error('expected ok')

    expect(subscriber.findMany.mock.calls[0][0].where).toEqual({ status: 'CONFIRMED' })
    const lines = result.csv.split('\r\n')
    expect(lines[0]).toBe('"email","confirmedAt"')
    expect(lines[1]).toBe('"plain@example.com","2026-07-31T10:00:00.000Z"')
    // A comma inside a field must not create a new column…
    expect(lines[2]).toBe('"has,comma@example.com","2026-07-31T11:00:00.000Z"')
    // …and an embedded quote is doubled per RFC 4180.
    expect(lines[3]).toBe('"has""quote@example.com",""')
    expect(result.filename).toMatch(/^subscribers-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})
