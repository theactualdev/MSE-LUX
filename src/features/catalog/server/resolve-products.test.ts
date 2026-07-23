import { expect, it, vi } from 'vitest'
vi.mock('./load-catalog', () => ({ loadCatalog: vi.fn() }))
import { resolveProductsByIds } from './resolve-products'
import { loadCatalog } from './load-catalog'
import type { Product } from '@/types/catalog'

const loadCatalogMock = vi.mocked(loadCatalog)

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake product only needs the two fields the SUT reads
const P = (id: string, slug: string) => ({ id, slug, /* minimal shape ok for the test */ }) as any as Product

it('returns products in the requested id order, dropping unknowns', async () => {
  loadCatalogMock.mockResolvedValue({
    products: [P('PROD-001', 'a'), P('PROD-002', 'b'), P('PROD-003', 'c')],
    categories: [],
    collections: [],
  })
  const out = await resolveProductsByIds(['PROD-003', 'PROD-001', 'NOPE'])
  expect(out.map((p) => p.id)).toEqual(['PROD-003', 'PROD-001'])
})

it('returns [] for an empty input', async () => {
  loadCatalogMock.mockResolvedValue({ products: [], categories: [], collections: [] })
  expect(await resolveProductsByIds([])).toEqual([])
})
