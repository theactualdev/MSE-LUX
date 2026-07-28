import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import type { PaystackCharge } from '@/features/checkout/lib/paystack'
import { markOrderPaid } from '@/features/checkout/lib/fulfil-order'
import { cancelOrder } from '@/features/admin/orders/transitions'

/**
 * OPT-IN, real-database concurrency suite for the two fulfilment races the
 * 8b/9c review could only verify by reading the guarded `updateMany` code
 * (see `markOrderPaid` in `fulfil-order.ts` and `cancelOrder` in
 * `transitions.ts`). Unlike every other `*.test.ts` in this repo, this file
 * makes NO mocks and talks to the real `db` (`@/lib/db`) — two genuinely
 * concurrent calls are fired with `Promise.all` and the resulting row state
 * is asserted against, not a recorded call list.
 *
 * Gated exactly like the retired `catalog/server/parity.test.ts`
 * (`CATALOG_PARITY=1`, see `git show 373af6c`): off by default so `vitest run`
 * (and CI) never touches a database, with an `it.skip` placeholder in the
 * else branch so the file stays visible in a normal run instead of vanishing.
 *
 * Run (writes to whatever `DATABASE_URL` resolves to — dev only, NEVER point
 * this at production):
 *
 *   CONCURRENCY=1 npx vitest run src/features/admin/orders/concurrency.integration.test.ts
 *
 * PowerShell:
 *
 *   $env:CONCURRENCY='1'; npx vitest run src/features/admin/orders/concurrency.integration.test.ts
 *
 * Fixtures: every row this file creates (Category, Product, Order + its
 * OrderLine) is scoped under one `RUN_ID` prefix (`CONC-<timestamp>-<random>`)
 * generated fresh per test run, so it can never collide with or touch real
 * data. Rows are tracked as they're created and deleted in `afterEach`
 * (per-test, so a failed assertion still cleans up) with an `afterAll` sweep
 * by the `RUN_ID` prefix as a belt-and-braces backstop. Orders are guest
 * orders (`profileId: null`) — no Profile is ever created. Because the DB
 * columns are written directly via `db.*.create` (not through `placeOrder`),
 * this file owns keeping the fixture shape in sync with `prisma/schema.prisma`.
 *
 * Note for a future reader: 9b wired a best-effort confirmation email into
 * `markOrderPaid`'s winning-fulfilment branch. With no `RESEND_API_KEY` set
 * (the normal case for a local dev DB), `sendEmail` resolves to
 * `{ ok: false, error: 'not-configured' }` and `sendOrderConfirmation` logs
 * it via `console.error` — that log line is expected noise when this suite
 * actually runs, not a failure.
 */
const enabled = process.env.CONCURRENCY === '1'

describe.runIf(enabled)('order-transition races: real-DB concurrency', () => {
  // Vitest does not auto-load .env (unlike `tsx`). `@/lib/db` only reads
  // DATABASE_URL lazily on first property access, so loading dotenv here —
  // scoped to this gated describe block only, same idiom as the retired
  // catalog parity test — is enough to make it visible in time without
  // affecting the normal (gate-off) suite, which never reaches this beforeAll.
  beforeAll(async () => {
    await import('dotenv/config')
  })

  const RUN_ID = `CONC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const UNIT_PRICE_MINOR = 500_000 // NGN 5,000.00 — arbitrary, only needs to be internally consistent
  const SHIPPING_MINOR = 100_000

  const cleanupOrderIds: string[] = []
  const cleanupProductIds: string[] = []
  const cleanupCategoryIds: string[] = []

  async function createCategory(suffix: string) {
    const category = await db.category.create({
      data: { slug: `${RUN_ID}-cat-${suffix}`, name: `Concurrency fixture category ${suffix}` },
    })
    cleanupCategoryIds.push(category.id)
    return category
  }

  async function createProduct(suffix: string, categoryId: string, inventory: number) {
    const product = await db.product.create({
      data: {
        slug: `${RUN_ID}-product-${suffix}`,
        sku: `${RUN_ID}-SKU-${suffix}`,
        name: `Concurrency fixture product ${suffix}`,
        shortDescription: 'Throwaway fixture for concurrency.integration.test.ts',
        description: 'Throwaway fixture for concurrency.integration.test.ts',
        material: 'fixture',
        materialTags: [],
        badges: [],
        status: 'ACTIVE',
        priceNgnMinor: UNIT_PRICE_MINOR,
        priceUsdMinor: UNIT_PRICE_MINOR,
        inventory,
        categoryId,
      },
    })
    cleanupProductIds.push(product.id)
    return product
  }

  /** Seeds a guest order (no Profile) with one line against `productId`. */
  async function createOrder(opts: {
    orderNumber: string
    productId: string
    quantity: number
    status: 'PENDING' | 'PROCESSING'
    paidAt?: Date | null
  }) {
    const lineTotalMinor = UNIT_PRICE_MINOR * opts.quantity
    const subtotalMinor = lineTotalMinor
    const taxMinor = 0
    const totalMinor = subtotalMinor + SHIPPING_MINOR + taxMinor

    const order = await db.order.create({
      data: {
        orderNumber: opts.orderNumber,
        profileId: null,
        email: 'concurrency-fixture@example.com',
        status: opts.status,
        paidAt: opts.paidAt ?? null,
        shipFullName: 'Concurrency Fixture',
        shipPhone: '+2340000000000',
        shipLine1: '1 Fixture Way',
        shipCity: 'Lagos',
        shipState: 'Lagos',
        shipCountry: 'NG',
        shippingLabel: 'Standard',
        currency: 'NGN',
        subtotalMinor,
        shippingMinor: SHIPPING_MINOR,
        taxMinor,
        totalMinor,
        lines: {
          create: [
            {
              productName: `Concurrency fixture product ${opts.orderNumber}`,
              quantity: opts.quantity,
              unitPriceMinor: UNIT_PRICE_MINOR,
              lineTotalMinor,
              productId: opts.productId,
            },
          ],
        },
      },
      include: { lines: true },
    })
    cleanupOrderIds.push(order.id)
    return order
  }

  // Per-test cleanup (runs even when the test's own assertions throw) —
  // Order deletion cascades OrderLine (see schema's onDelete: Cascade), so
  // only Order/Product/Category need explicit deletes, strictly in that
  // order: Product has a required, non-cascading FK to Category.
  afterEach(async () => {
    for (const id of cleanupOrderIds.splice(0)) {
      await db.order.deleteMany({ where: { id } }).catch((error) => {
        console.error('[concurrency.integration.test] order cleanup failed', { id, error })
      })
    }
    for (const id of cleanupProductIds.splice(0)) {
      await db.product.deleteMany({ where: { id } }).catch((error) => {
        console.error('[concurrency.integration.test] product cleanup failed', { id, error })
      })
    }
    for (const id of cleanupCategoryIds.splice(0)) {
      await db.category.deleteMany({ where: { id } }).catch((error) => {
        console.error('[concurrency.integration.test] category cleanup failed', { id, error })
      })
    }
  })

  // Backstop sweep by RUN_ID prefix, in case a test crashed before its
  // afterEach ran (e.g. the process was killed mid-test) — this run's fixture
  // rows are the only ones matching this exact RUN_ID, so the sweep can never
  // touch another run's or the app's real data.
  afterAll(async () => {
    await db.order.deleteMany({ where: { orderNumber: { startsWith: RUN_ID } } }).catch(() => {})
    await db.product.deleteMany({ where: { slug: { startsWith: `${RUN_ID}-product-` } } }).catch(() => {})
    await db.category.deleteMany({ where: { slug: { startsWith: `${RUN_ID}-cat-` } } }).catch(() => {})
  })

  it(
    'markOrderPaid vs cancelOrder on the same PENDING order: exactly one wins, stock decremented at most once, a late-charge loser flags refundOwed',
    async () => {
      const quantity = 3
      const initialInventory = 10
      const category = await createCategory('a')
      const product = await createProduct('a', category.id, initialInventory)
      const order = await createOrder({
        orderNumber: `${RUN_ID}-A`,
        productId: product.id,
        quantity,
        status: 'PENDING',
      })

      const charge: PaystackCharge = {
        reference: `${RUN_ID}-A-ref`,
        status: 'success',
        amountMinor: order.totalMinor,
        currency: order.currency,
        metadata: { orderNumber: order.orderNumber },
      }

      const [paidResult, cancelResult] = await Promise.all([markOrderPaid(charge), cancelOrder(order.orderNumber)])

      const finalOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } })
      const finalProduct = await db.product.findUniqueOrThrow({ where: { id: product.id } })

      if (finalOrder.status === 'PROCESSING') {
        // markOrderPaid won the race: the order is fulfilled, stock is
        // decremented exactly once, and the loser sees a clean conflict —
        // never a resurrected/re-cancelled order.
        expect(paidResult).toBe('paid')
        expect(cancelResult).toEqual({ ok: false, error: 'conflict' })
        expect(finalOrder.paidAt).not.toBeNull()
        expect(finalOrder.refundOwed).toBe(false)
        expect(finalProduct.inventory).toBe(initialInventory - quantity)
      } else {
        // cancelOrder won the race: the order stays CANCELLED, the late
        // charge must NOT resurrect it — it flags refundOwed and records the
        // reference instead — and stock is untouched (a PENDING cancel never
        // restocks; nothing was decremented yet either).
        expect(finalOrder.status).toBe('CANCELLED')
        expect(cancelResult).toEqual({ ok: true })
        expect(paidResult).toBe('mismatch')
        expect(finalOrder.paidAt).toBeNull()
        expect(finalOrder.refundOwed).toBe(true)
        expect(finalOrder.paystackReference).toBe(charge.reference)
        expect(finalProduct.inventory).toBe(initialInventory)
      }
    },
    30_000,
  )

  it(
    'two concurrent cancelOrder calls on one PROCESSING order: exactly one restocks',
    async () => {
      const quantity = 2
      const initialInventory = 5
      const category = await createCategory('b')
      const product = await createProduct('b', category.id, initialInventory)
      const order = await createOrder({
        orderNumber: `${RUN_ID}-B`,
        productId: product.id,
        quantity,
        status: 'PROCESSING',
        paidAt: new Date(),
      })

      const [resultOne, resultTwo] = await Promise.all([cancelOrder(order.orderNumber), cancelOrder(order.orderNumber)])
      const results = [resultOne, resultTwo]

      const wins = results.filter((r) => r.ok)
      const conflicts = results.filter((r) => !r.ok && r.error === 'conflict')

      expect(wins).toHaveLength(1)
      expect(conflicts).toHaveLength(1)

      const finalOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } })
      const finalProduct = await db.product.findUniqueOrThrow({ where: { id: product.id } })

      expect(finalOrder.status).toBe('CANCELLED')
      expect(finalOrder.refundOwed).toBe(true)
      // Restocked exactly once — not twice, not zero times.
      expect(finalProduct.inventory).toBe(initialInventory + quantity)
    },
    30_000,
  )
})

describe.runIf(!enabled)('order-transition races (gated)', () => {
  it.skip('set CONCURRENCY=1 with a live DATABASE_URL to run the real-DB concurrency suite', () => {})
})
