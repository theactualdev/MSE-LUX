import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Role } from '@/generated/prisma/client'

const getCurrentRole = vi.fn()
const roleSatisfies = vi.fn()
vi.mock('@/features/auth/claims', () => ({
  getCurrentRole: (...args: []) => getCurrentRole(...args),
  roleSatisfies: (...args: [unknown, unknown]) => roleSatisfies(...args),
}))

const discountCode = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db: { discountCode } }))

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...args: [string]) => revalidatePath(...args),
}))

const { createDiscountAction, updateDiscountAction, setDiscountActiveAction } = await import(
  '@/features/admin/discounts/actions'
)

const VALID_CREATE_INPUT = { code: 'launch20', percentOff: 20, maxUses: 100, expiresAt: null }
const VALID_UPDATE_INPUT = { id: 'd1', code: 'launch20', percentOff: 20, maxUses: 100, expiresAt: null }

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentRole.mockResolvedValue(Role.ADMIN)
  roleSatisfies.mockReturnValue(true)
})

describe('createDiscountAction', () => {
  it('refuses a non-ADMIN caller without touching the database', async () => {
    roleSatisfies.mockReturnValue(false)

    const result = await createDiscountAction(VALID_CREATE_INPUT)

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(discountCode.create).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects percentOff above 100', async () => {
    const result = await createDiscountAction({ ...VALID_CREATE_INPUT, percentOff: 150 })
    expect(result.ok).toBe(false)
    expect(discountCode.create).not.toHaveBeenCalled()
  })

  it('rejects percentOff below 1', async () => {
    const result = await createDiscountAction({ ...VALID_CREATE_INPUT, percentOff: 0 })
    expect(result.ok).toBe(false)
    expect(discountCode.create).not.toHaveBeenCalled()
  })

  it('stores the code normalised to uppercase, trimmed', async () => {
    discountCode.create.mockResolvedValue({})

    await createDiscountAction({ ...VALID_CREATE_INPUT, code: '  launch20  ' })

    expect(discountCode.create).toHaveBeenCalledWith({
      data: { code: 'LAUNCH20', percentOff: 20, maxUses: 100, expiresAt: null },
    })
  })

  it('returns a friendly error on a duplicate code instead of throwing the raw P2002', async () => {
    discountCode.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'P2002' }))

    const result = await createDiscountAction(VALID_CREATE_INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/already exists/i)
  })

  it('revalidates /admin/discounts on success', async () => {
    discountCode.create.mockResolvedValue({})

    const result = await createDiscountAction(VALID_CREATE_INPUT)

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/discounts')
  })

  it('never revalidates on failure', async () => {
    discountCode.create.mockRejectedValue(new Error('boom'))
    await createDiscountAction(VALID_CREATE_INPUT)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('accepts a positive maxUses and a null maxUses', async () => {
    discountCode.create.mockResolvedValue({})
    const result = await createDiscountAction({ ...VALID_CREATE_INPUT, maxUses: null })
    expect(result).toEqual({ ok: true })
  })

  it('rejects a maxUses of 0', async () => {
    const result = await createDiscountAction({ ...VALID_CREATE_INPUT, maxUses: 0 })
    expect(result.ok).toBe(false)
    expect(discountCode.create).not.toHaveBeenCalled()
  })
})

describe('updateDiscountAction', () => {
  it('refuses a non-ADMIN caller without touching the database', async () => {
    roleSatisfies.mockReturnValue(false)

    const result = await updateDiscountAction(VALID_UPDATE_INPUT)

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(discountCode.findUnique).not.toHaveBeenCalled()
    expect(discountCode.update).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects percentOff outside 1..100', async () => {
    const result = await updateDiscountAction({ ...VALID_UPDATE_INPUT, percentOff: 101 })
    expect(result.ok).toBe(false)
    expect(discountCode.findUnique).not.toHaveBeenCalled()
    expect(discountCode.update).not.toHaveBeenCalled()
  })

  it('returns not-found when the id does not match any row', async () => {
    discountCode.findUnique.mockResolvedValue(null)

    const result = await updateDiscountAction(VALID_UPDATE_INPUT)

    expect(result.ok).toBe(false)
    expect(discountCode.update).not.toHaveBeenCalled()
  })

  it('rejects a maxUses below the current timesUsed with a friendly explanation', async () => {
    discountCode.findUnique.mockResolvedValue({ timesUsed: 42 })

    const result = await updateDiscountAction({ ...VALID_UPDATE_INPUT, maxUses: 10 })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/42/)
    expect(discountCode.update).not.toHaveBeenCalled()
  })

  it('allows a maxUses equal to the current timesUsed', async () => {
    discountCode.findUnique.mockResolvedValue({ timesUsed: 42 })
    discountCode.update.mockResolvedValue({})

    const result = await updateDiscountAction({ ...VALID_UPDATE_INPUT, maxUses: 42 })

    expect(result).toEqual({ ok: true })
    expect(discountCode.update).toHaveBeenCalledTimes(1)
  })

  it('allows a null maxUses regardless of timesUsed', async () => {
    discountCode.findUnique.mockResolvedValue({ timesUsed: 999 })
    discountCode.update.mockResolvedValue({})

    const result = await updateDiscountAction({ ...VALID_UPDATE_INPUT, maxUses: null })

    expect(result).toEqual({ ok: true })
  })

  it('stores the code normalised to uppercase, trimmed', async () => {
    discountCode.findUnique.mockResolvedValue({ timesUsed: 0 })
    discountCode.update.mockResolvedValue({})

    await updateDiscountAction({ ...VALID_UPDATE_INPUT, code: '  launch20  ' })

    expect(discountCode.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { code: 'LAUNCH20', percentOff: 20, maxUses: 100, expiresAt: null },
    })
  })

  it('returns a friendly error on a duplicate code instead of throwing the raw P2002', async () => {
    discountCode.findUnique.mockResolvedValue({ timesUsed: 0 })
    discountCode.update.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'P2002' }))

    const result = await updateDiscountAction(VALID_UPDATE_INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/already exists/i)
  })

  it('revalidates /admin/discounts on success', async () => {
    discountCode.findUnique.mockResolvedValue({ timesUsed: 0 })
    discountCode.update.mockResolvedValue({})

    await updateDiscountAction(VALID_UPDATE_INPUT)

    expect(revalidatePath).toHaveBeenCalledWith('/admin/discounts')
  })
})

describe('setDiscountActiveAction', () => {
  it('refuses a non-ADMIN caller without touching the database', async () => {
    roleSatisfies.mockReturnValue(false)

    const result = await setDiscountActiveAction('d1', false)

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(discountCode.updateMany).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('disables an existing code', async () => {
    discountCode.updateMany.mockResolvedValue({ count: 1 })

    const result = await setDiscountActiveAction('d1', false)

    expect(result).toEqual({ ok: true })
    expect(discountCode.updateMany).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { active: false } })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/discounts')
  })

  it('re-enables an existing code', async () => {
    discountCode.updateMany.mockResolvedValue({ count: 1 })

    const result = await setDiscountActiveAction('d1', true)

    expect(result).toEqual({ ok: true })
    expect(discountCode.updateMany).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { active: true } })
  })

  it('returns not-found when no row matches, without revalidating', async () => {
    discountCode.updateMany.mockResolvedValue({ count: 0 })

    const result = await setDiscountActiveAction('missing', false)

    expect(result.ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects a non-string id and a non-boolean active without touching the database', async () => {
    const result = await setDiscountActiveAction(123, 'nope')
    expect(result.ok).toBe(false)
    expect(discountCode.updateMany).not.toHaveBeenCalled()
  })
})

describe('role-check ordering', () => {
  it('role check happens before any database call (updateDiscountAction)', async () => {
    roleSatisfies.mockReturnValue(false)
    await updateDiscountAction(VALID_UPDATE_INPUT)
    expect(roleSatisfies).toHaveBeenCalled()
    expect(discountCode.findUnique).not.toHaveBeenCalled()
  })
})
