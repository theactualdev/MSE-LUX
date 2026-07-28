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
 *
 * Why Race 1 is two tests, not one: a genuinely concurrent `Promise.all`
 * only exercises the ordering the DB's scheduler happens to pick that run —
 * on the ordering where `cancelOrder` commits first, dropping the
 * `status: 'PENDING'` clause from `markOrderPaid`'s guard (`fulfil-order.ts`,
 * the exact 8b regression this suite exists to catch) makes the buggy guard
 * behave identically to the fixed one, so a single green run is weak
 * evidence. "a late charge arriving after an admin cancel must not
 * resurrect the order" below is the deterministic guard-regression check:
 * it sequences `cancelOrder` to completion BEFORE `markOrderPaid`, so the
 * ordering is fixed and the guard is exercised on every run, not just the
 * lucky ones. The concurrent test right above it loops 5 iterations with a
 * fresh fixture each time — it exists to prove no deadlock/corruption under
 * real contention (both orderings are legitimate outcomes there), not to
 * catch the guard regression; that job now belongs to the deterministic
 * test.
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

    // Belt-and-braces (Phase 9c final fixes): 9b wired a best-effort
    // confirmation email into `markOrderPaid`'s winning-fulfilment branch
    // (see the note above). `dotenv/config` just loaded whatever `.env` this
    // opt-in run's environment has — if a real `RESEND_API_KEY` happens to be
    // set there (e.g. a dev `.env` shared with a real project), this suite
    // must not be the thing that sends a real email. Deleting it here makes
    // that structurally impossible regardless of what `.env` supplies:
    // `sendEmail` always sees "not configured" and `markOrderPaid` always
    // takes the same logged-no-op path the doc comment above describes.
    delete process.env.RESEND_API_KEY
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

  /**
   * Seeds a fresh PENDING order (qty `quantity`, product inventory
   * `initialInventory`) plus a matching `PaystackCharge` for Race 1 (both the
   * looped concurrent test and the deterministic sequenced test below). Every
   * caller passes a distinct `suffix` so each invocation gets independent,
   * uncontaminated rows — required for the loop, where each iteration must
   * start clean rather than build on the previous iteration's final state.
   */
  async function seedRace1Fixture(suffix: string, quantity: number, initialInventory: number) {
    const category = await createCategory(`race1-${suffix}`)
    const product = await createProduct(`race1-${suffix}`, category.id, initialInventory)
    const order = await createOrder({
      orderNumber: `${RUN_ID}-RACE1-${suffix}`,
      productId: product.id,
      quantity,
      status: 'PENDING',
    })

    const charge: PaystackCharge = {
      reference: `${RUN_ID}-RACE1-${suffix}-ref`,
      status: 'success',
      amountMinor: order.totalMinor,
      currency: order.currency,
      metadata: { orderNumber: order.orderNumber },
    }

    return { category, product, order, charge }
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
    'markOrderPaid vs cancelOrder on the same PENDING order, repeated: exactly one wins, stock decremented at most once, a late-charge loser flags refundOwed',
    async () => {
      // Contention check, not the guard-regression check (see the docblock
      // note above) — a real race's ordering is up to the DB scheduler, so 5
      // independent iterations (fresh fixture each time) give more confidence
      // that both orderings behave correctly than a single run would, without
      // pretending this loop deterministically exercises either branch.
      const quantity = 3
      const initialInventory = 10
      const iterations = 5

      for (let i = 0; i < iterations; i++) {
        const { product, order, charge } = await seedRace1Fixture(`concurrent-${i}`, quantity, initialInventory)

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
      }
    },
    // 5x the fixture-and-race work of the original single-iteration test —
    // scale the timeout accordingly rather than risk a slow CI box flaking.
    150_000,
  )

  it(
    'a late charge arriving after an admin cancel must not resurrect the order',
    async () => {
      // The deterministic guard-regression check (see the docblock note
      // above): no Promise.all — cancelOrder is awaited to completion FIRST,
      // so the ordering markOrderPaid's `status: 'PENDING'` guard clause
      // exists for is exercised on every single run, not just the runs where
      // the DB scheduler happens to let cancelOrder win. If that clause were
      // ever dropped from fulfil-order.ts, this test fails deterministically
      // on the very first assertion below — never intermittently.
      const quantity = 3
      const initialInventory = 10
      const { product, order, charge } = await seedRace1Fixture('sequenced', quantity, initialInventory)

      const cancelResult = await cancelOrder(order.orderNumber)
      expect(cancelResult).toEqual({ ok: true })

      const afterCancel = await db.order.findUniqueOrThrow({ where: { id: order.id } })
      expect(afterCancel.status).toBe('CANCELLED')

      const paidResult = await markOrderPaid(charge)

      const finalOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } })
      const finalProduct = await db.product.findUniqueOrThrow({ where: { id: product.id } })

      // With the guard intact, the late charge must be rejected, not
      // resurrect the cancelled order.
      expect(paidResult).toBe('mismatch')
      expect(finalOrder.status).toBe('CANCELLED')
      expect(finalOrder.paidAt).toBeNull()
      expect(finalOrder.refundOwed).toBe(true)
      expect(finalOrder.paystackReference).toBe(charge.reference)
      expect(finalProduct.inventory).toBe(initialInventory)
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
