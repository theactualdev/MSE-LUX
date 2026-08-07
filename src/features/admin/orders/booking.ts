import 'server-only'

import { db } from '@/lib/db'
import { OrderStatus } from '@/generated/prisma/client'
import { validateAddress, fetchRates, createLabel, type ShipBubbleRate } from '@/features/checkout/lib/shipbubble'
import { shipOrder, type TransitionError } from '@/features/admin/orders/transitions'
import {
  SHIPBUBBLE_ORIGIN_ADDRESS_CODE,
  WEIGHT_BASE_GRAMS,
  WEIGHT_PER_ITEM_GRAMS,
  NOMINAL_DIMENSION,
} from '@/features/checkout/lib/shipping-config'

/**
 * Admin shipment booking — re-quotes a PROCESSING Nigerian order's snapshot
 * address against ShipBubble (`getBookingRates`) and books the admin's chosen
 * courier's label, then flips the order to SHIPPED via `shipOrder`
 * (`bookShipment`). Server-only and UNGATED on purpose: every caller reaches
 * these through `actions.ts`, which re-checks ADMIN itself (server actions
 * are public HTTP endpoints — the (admin) layout gate covers rendering only).
 * Same trust model as the sibling `transitions.ts`.
 *
 * Neither function throws: ShipBubble failures collapse to `shipbubble-error`
 * and `shipOrder`'s own `TransitionResult` errors are passed straight
 * through.
 */

export type BookingRatesError = 'not-found' | 'invalid-state' | 'not-nigeria' | 'shipbubble-error'

export type BookingRatesResult =
  | {
      ok: true
      requestToken: string
      rates: ShipBubbleRate[]
      paidShipping: { amountMinor: number; currency: string; label: string }
    }
  | { ok: false; error: BookingRatesError }

export type BookShipmentInput = { requestToken: string; courierId: string; serviceCode: string }

export type BookShipmentResult =
  | { ok: true }
  | { ok: false; error: 'invalid-input' | 'shipbubble-error' | TransitionError; shipbubbleOrderId?: string }

/**
 * DUPLICATED from `@/features/checkout/shipping.ts` — that module is
 * `'use server'` (a Server Actions file), which can only export async
 * functions, so its `isNigeria` can't be re-exported for this server-only
 * module to import. Tracked for extraction into a shared, directive-free
 * helper module alongside `shipping.ts`'s copy.
 */
function isNigeria(country: string): boolean {
  const normalized = country.trim().toLowerCase()
  return normalized === 'nigeria' || normalized === 'ng'
}

/**
 * DUPLICATED from `@/features/checkout/shipping.ts` for the same `'use
 * server'`-export-constraint reason as `isNigeria` above — also tracked for
 * extraction.
 */
function tomorrowIsoDate(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Re-quotes a PROCESSING Nigerian order's stored shipping-address snapshot
 * against ShipBubble, ready for the admin to pick a courier. Mirrors
 * `getShippingRates`'s package-build (weight/value model, nominal dimension,
 * tomorrow pickup) applied to the ORDER's snapshot fields rather than a live
 * cart, since booking happens well after checkout.
 */
export async function getBookingRates(orderNumber: string): Promise<BookingRatesResult> {
  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      status: true,
      email: true,
      subtotalMinor: true,
      shippingMinor: true,
      currency: true,
      shippingLabel: true,
      shipFullName: true,
      shipPhone: true,
      shipLine1: true,
      shipCity: true,
      shipState: true,
      shipCountry: true,
      lines: { select: { quantity: true, product: { select: { weightGrams: true } } } },
    },
  })

  if (!order) return { ok: false, error: 'not-found' }
  if (order.status !== OrderStatus.PROCESSING) return { ok: false, error: 'invalid-state' }
  if (!isNigeria(order.shipCountry)) return { ok: false, error: 'not-nigeria' }

  try {
    // A blank origin code means the store's ShipBubble pickup address hasn't
    // been configured yet — fail fast into `shipbubble-error` rather than
    // calling ShipBubble with an invalid sender code.
    if (!SHIPBUBBLE_ORIGIN_ADDRESS_CODE) throw new Error('SHIPBUBBLE_ORIGIN_ADDRESS_CODE is not configured')

    const addressLine = `${order.shipLine1}, ${order.shipCity}, ${order.shipState}, ${order.shipCountry}`

    const { addressCode: receiverAddressCode } = await validateAddress({
      name: order.shipFullName,
      email: order.email,
      phone: order.shipPhone,
      address: addressLine,
    })

    // Weight prefers each line's real product `weightGrams` (Phase 8) and
    // falls back to the flat per-item estimate for a null-weighed product —
    // same formula as `getShippingRates`. `line.product` is itself nullable
    // (`SetNull` relation: a deleted product leaves the order line intact but
    // orphaned), so a missing product also falls back to the flat estimate.
    const unitWeight = order.lines.reduce(
      (sum, line) => sum + (line.product?.weightGrams ?? WEIGHT_PER_ITEM_GRAMS) * line.quantity,
      WEIGHT_BASE_GRAMS,
    )

    const packageItems = [
      {
        name: 'MSE Lux order',
        description: 'Jewelry order',
        unitWeightGrams: unitWeight,
        // Minor units; `fetchRates` converts to naira at the boundary.
        unitAmountMinor: order.subtotalMinor,
        quantity: 1,
      },
    ]

    const { requestToken, rates } = await fetchRates({
      senderAddressCode: SHIPBUBBLE_ORIGIN_ADDRESS_CODE,
      receiverAddressCode,
      packageItems,
      packageDimension: NOMINAL_DIMENSION,
      pickupDate: tomorrowIsoDate(),
    })

    return {
      ok: true,
      requestToken,
      rates,
      paidShipping: { amountMinor: order.shippingMinor, currency: order.currency, label: order.shippingLabel },
    }
  } catch (error) {
    console.error('[getBookingRates] ShipBubble path failed', error)
    return { ok: false, error: 'shipbubble-error' }
  }
}

/**
 * Books the chosen courier's label off a prior `getBookingRates` quote, then
 * transitions the order to SHIPPED via `shipOrder`. If the label books but
 * the transition doesn't land (`shipOrder` returns a non-ok
 * `TransitionResult` — e.g. a racing `conflict`), the label already exists at
 * ShipBubble: its `shipbubbleOrderId` is threaded into the error result so
 * ops can see the reference and reconcile manually rather than losing it.
 */
export async function bookShipment(orderNumber: string, input: BookShipmentInput): Promise<BookShipmentResult> {
  const requestToken = input.requestToken.trim()
  const courierId = input.courierId.trim()
  const serviceCode = input.serviceCode.trim()
  if (!requestToken || !courierId || !serviceCode) return { ok: false, error: 'invalid-input' }

  let label: { shipbubbleOrderId: string; trackingNumber: string; trackingUrl?: string; courierName: string }
  try {
    label = await createLabel({ requestToken, courierId, serviceCode })
  } catch (error) {
    console.error('[bookShipment] createLabel failed', error)
    return { ok: false, error: 'shipbubble-error' }
  }

  const result = await shipOrder(orderNumber, {
    carrier: label.courierName,
    trackingNumber: label.trackingNumber,
    shipbubbleOrderId: label.shipbubbleOrderId,
  })

  if (!result.ok) return { ok: false, error: result.error, shipbubbleOrderId: label.shipbubbleOrderId }
  return { ok: true }
}
