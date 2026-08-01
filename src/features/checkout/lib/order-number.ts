/**
 * The order-number namespace, shared by EVERY path that creates an `Order`
 * row — `placeOrder` (`checkout/data.ts`) and `createGiftOrder`
 * (`gifting/gift-order.ts`). Extracted here rather than duplicated because
 * `Order.orderNumber` is `@unique` across the whole table: two generators
 * that drifted in format or width would still collide in the same space, and
 * the retry budget that absorbs those collisions has to be the same number on
 * both sides or one path silently gets fewer attempts than its own docs claim.
 *
 * No directive: these are pure, dependency-free helpers, so both a
 * `'use server'` module (which may only EXPORT async functions — it can still
 * import sync ones) and a `server-only` module can use them.
 */

/** How many times to retry order placement on an `orderNumber` collision before giving up. Collisions on a random 6-digit space are rare; this only guards the tail. */
export const MAX_ORDER_NUMBER_ATTEMPTS = 5

/**
 * `MSE-` + a random 6-digit number (`000000`-`999999`).
 *
 * A collision against the `orderNumber` unique constraint is retried with a
 * FRESH number in a FRESH `db.$transaction` — never inside the same
 * transaction the failed `create` ran in. Postgres aborts the entire
 * transaction on any failed statement: every later statement on that same
 * connection then fails with `25P02` ("current transaction is aborted"), not
 * the original `P2002` — so a retry-inside-the-transaction would never see
 * the error code it's looking for and would crash on the very collision it
 * exists to handle. Both callers therefore wrap the WHOLE `db.$transaction`
 * call in their retry loop, not just the one `create`.
 */
export function generateOrderNumber(): string {
  const digits = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0')
  return `MSE-${digits}`
}
