import { beforeAll, describe, expect, it } from 'vitest'

// Order-sensitive deep-equality between the DB-backed server layer and the authored
// mock catalog. Requires a live DATABASE_URL and the id-aligned seed (Task 2).
// Run:  CATALOG_PARITY=1 npx vitest run src/features/catalog/server/parity.test.ts
// (PowerShell: $env:CATALOG_PARITY='1'; npx vitest run src/features/catalog/server/parity.test.ts)
const enabled = process.env.CATALOG_PARITY === '1'

describe.runIf(enabled)('catalog parity: server layer vs authored mock', () => {
  // Vitest does not auto-load .env (unlike `tsx`, which is why verify-catalog-ids.ts sees
  // DATABASE_URL for free). `@/lib/db` only reads DATABASE_URL lazily, on first property access
  // inside the `it` callbacks below (via the dynamic `import('./selectors')`), so loading dotenv
  // here — scoped to this gated describe block only — is enough to make it visible in time
  // without affecting the normal (gate-off) suite, which never reaches this beforeAll.
  beforeAll(async () => {
    await import('dotenv/config')
  })

  it('products: deep-equal and order-sensitive (ids, prices, tags, option order, variants)', async () => {
    const server = await import('./selectors')
    const mock = await import('@/features/catalog/lib/selectors')
    expect(await server.getAllProducts()).toEqual(mock.getAllProducts())
  })

  it('categories and collections match', async () => {
    const server = await import('./selectors')
    const mock = await import('@/features/catalog/lib/selectors')
    expect(await server.getAllCategories()).toEqual(mock.getAllCategories())
    expect(await server.getAllCollections()).toEqual(mock.getAllCollections())
  })

  it('derived selectors agree', async () => {
    const server = await import('./selectors')
    const mock = await import('@/features/catalog/lib/selectors')

    expect(await server.getBestSellers()).toEqual(mock.getBestSellers())
    expect(await server.getNewArrivals()).toEqual(mock.getNewArrivals())
    expect(await server.getProductsByCategory('jewelry')).toEqual(mock.getProductsByCategory('jewelry'))

    const mockCollections = mock.getAllCollections()
    for (const collection of mockCollections) {
      expect(await server.getProductsInCollection(collection.slug)).toEqual(
        mock.getProductsInCollection(collection.slug),
      )
    }

    const mockProducts = mock.getAllProducts()
    const serverProducts = await server.getAllProducts()
    expect(await server.getRelatedProducts(serverProducts[0], 4)).toEqual(
      mock.getRelatedProducts(mockProducts[0], 4),
    )
  })
})

describe.runIf(!enabled)('catalog parity (gated)', () => {
  it.skip('set CATALOG_PARITY=1 with a live DATABASE_URL to run the parity check', () => {})
})
