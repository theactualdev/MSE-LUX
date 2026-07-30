import { describe, it, expect, vi, beforeEach } from 'vitest'

const subscriber = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db: { subscriber } }))

const { processSubscription, confirmByToken, unsubscribeByToken } = await import(
  '@/features/newsletter/subscription'
)

beforeEach(() => vi.clearAllMocks())

describe('processSubscription', () => {
  it('creates a PENDING row with a fresh 64-hex token for a new email and asks for a send', async () => {
    subscriber.findUnique.mockResolvedValue(null)
    subscriber.create.mockImplementation(async ({ data }: { data: { email: string; token: string } }) => data)

    const outcome = await processSubscription('ada@example.com')

    expect(subscriber.create).toHaveBeenCalledTimes(1)
    const created = subscriber.create.mock.calls[0][0].data
    expect(created.email).toBe('ada@example.com')
    expect(created.token).toMatch(/^[0-9a-f]{64}$/)
    expect(outcome).toEqual({ send: true, email: 'ada@example.com', token: created.token })
  })

  it('resends (same token, no write) for an existing PENDING row', async () => {
    subscriber.findUnique.mockResolvedValue({ email: 'a@b.com', token: 'tok', status: 'PENDING' })
    const outcome = await processSubscription('a@b.com')
    expect(subscriber.create).not.toHaveBeenCalled()
    expect(subscriber.update).not.toHaveBeenCalled()
    expect(outcome).toEqual({ send: true, email: 'a@b.com', token: 'tok' })
  })

  it('does nothing for a CONFIRMED row', async () => {
    subscriber.findUnique.mockResolvedValue({ email: 'a@b.com', token: 'tok', status: 'CONFIRMED' })
    const outcome = await processSubscription('a@b.com')
    expect(subscriber.create).not.toHaveBeenCalled()
    expect(subscriber.update).not.toHaveBeenCalled()
    expect(outcome).toEqual({ send: false })
  })

  it('resets an UNSUBSCRIBED row to PENDING (clearing unsubscribedAt) and resends', async () => {
    subscriber.findUnique.mockResolvedValue({ id: 's1', email: 'a@b.com', token: 'tok', status: 'UNSUBSCRIBED' })
    subscriber.update.mockResolvedValue({})
    const outcome = await processSubscription('a@b.com')
    expect(subscriber.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'PENDING', unsubscribedAt: null },
    })
    expect(outcome).toEqual({ send: true, email: 'a@b.com', token: 'tok' })
  })
})

describe('confirmByToken', () => {
  it('confirms a PENDING row, stamping confirmedAt', async () => {
    subscriber.findUnique.mockResolvedValue({ id: 's1', status: 'PENDING' })
    subscriber.update.mockResolvedValue({})
    await expect(confirmByToken('tok')).resolves.toBe('confirmed')
    const data = subscriber.update.mock.calls[0][0].data
    expect(data.status).toBe('CONFIRMED')
    expect(data.confirmedAt).toBeInstanceOf(Date)
  })

  it('is idempotent: an already-CONFIRMED row returns confirmed with NO write', async () => {
    subscriber.findUnique.mockResolvedValue({ id: 's1', status: 'CONFIRMED' })
    await expect(confirmByToken('tok')).resolves.toBe('confirmed')
    expect(subscriber.update).not.toHaveBeenCalled()
  })

  it('re-confirms an UNSUBSCRIBED row (an old link clicked deliberately)', async () => {
    subscriber.findUnique.mockResolvedValue({ id: 's1', status: 'UNSUBSCRIBED' })
    subscriber.update.mockResolvedValue({})
    await expect(confirmByToken('tok')).resolves.toBe('confirmed')
    expect(subscriber.update.mock.calls[0][0].data.unsubscribedAt).toBeNull()
  })

  it('returns invalid for an unknown token, revealing nothing', async () => {
    subscriber.findUnique.mockResolvedValue(null)
    await expect(confirmByToken('nope')).resolves.toBe('invalid')
  })
})

describe('unsubscribeByToken', () => {
  it('unsubscribes, stamping unsubscribedAt', async () => {
    subscriber.findUnique.mockResolvedValue({ id: 's1', status: 'CONFIRMED' })
    subscriber.update.mockResolvedValue({})
    await expect(unsubscribeByToken('tok')).resolves.toBe('unsubscribed')
    const data = subscriber.update.mock.calls[0][0].data
    expect(data.status).toBe('UNSUBSCRIBED')
    expect(data.unsubscribedAt).toBeInstanceOf(Date)
  })

  it('is idempotent: already UNSUBSCRIBED returns unsubscribed with NO write', async () => {
    subscriber.findUnique.mockResolvedValue({ id: 's1', status: 'UNSUBSCRIBED' })
    await expect(unsubscribeByToken('tok')).resolves.toBe('unsubscribed')
    expect(subscriber.update).not.toHaveBeenCalled()
  })

  it('returns invalid for an unknown token', async () => {
    subscriber.findUnique.mockResolvedValue(null)
    await expect(unsubscribeByToken('nope')).resolves.toBe('invalid')
  })
})
