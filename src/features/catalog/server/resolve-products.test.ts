import { beforeEach, expect, it, vi } from 'vitest'

// The whole point of this module post-fix: resolve a handful of ids with a
// targeted `WHERE id IN (…)` query, NOT by reading the full catalog. So the
// test mocks `db.product.findMany` and asserts what it's called with.
vi.mock('@/lib/db', () => ({ db: { product: { findMany: vi.fn() } } }))
// Keep the mapper real for its other exports, but stub `toDomainProduct` to a
// trivial passthrough so this test is about resolution (query/order/dedup/drop),
// not the row→domain mapping (which mapper.test.ts already covers).
vi.mock('./mapper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./mapper')>()
  return { ...actual, toDomainProduct: vi.fn((row: { id: string; slug: string }) => ({ id: row.id, slug: row.slug })) }
})

import { resolveProductsByIds } from './resolve-products'
import { db } from '@/lib/db'

const findMany = vi.mocked(db.product.findMany)

beforeEach(() => {
  vi.clearAllMocks()
})

it('returns [] and issues NO query for empty input', async () => {
  expect(await resolveProductsByIds([])).toEqual([])
  expect(findMany).not.toHaveBeenCalled()
})

it('queries only the requested, deduped ids and ACTIVE only (never the full catalog)', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- passthrough mapper only reads id/slug
  findMany.mockResolvedValue([{ id: 'PROD-001', slug: 'a' }] as any)

  await resolveProductsByIds(['PROD-003', 'PROD-001', 'PROD-003'])

  expect(findMany).toHaveBeenCalledTimes(1)
  const arg = findMany.mock.calls[0][0] as { where: { id: { in: string[] }; status: string } }
  expect(arg.where.status).toBe('ACTIVE')
  expect(arg.where.id.in).toHaveLength(2)
  expect(new Set(arg.where.id.in)).toEqual(new Set(['PROD-001', 'PROD-003']))
})

it('returns products in the REQUESTED id order, dropping unknowns — regardless of DB row order', async () => {
  // DB returns rows in a different order than requested; the SUT must reorder.
  findMany.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- passthrough mapper only reads id/slug
    [{ id: 'PROD-001', slug: 'a' }, { id: 'PROD-003', slug: 'c' }] as any,
  )

  const out = await resolveProductsByIds(['PROD-003', 'PROD-001', 'NOPE'])

  expect(out.map((p) => p.id)).toEqual(['PROD-003', 'PROD-001'])
})
