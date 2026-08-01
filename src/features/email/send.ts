import 'server-only'
import { db } from '@/lib/db'
import { sendEmail } from './client'
import { orderConfirmationEmail, orderShippedEmail, newsletterConfirmationEmail } from './templates'
import { absoluteUrl } from '@/lib/seo'
import type { OrderEmailData } from './templates'

/**
 * The two transactional-email entry points fulfilment code calls. Both are
 * best-effort by design (mirrors `sendEmail`'s own contract, one level up):
 * NEVER throw, and NEVER return anything a caller must branch on. Every
 * failure mode — order not found, `sendEmail` reporting `{ ok: false }`, an
 * unexpected `db` error — is caught here and only logged. That's deliberate:
 * a caller (`markOrderPaid`, `shipOrder`) has already committed the write
 * that makes the order paid/shipped by the time it calls one of these, and a
 * notification email failing must never unwind or mask that. Each takes
 * ONLY an `orderNumber` and loads/maps what it needs itself so the two call
 * sites stay a single `try { await sendOrder...(orderNumber) } catch {}`.
 */

interface OrderLineRowForEmail {
  productName: string
  variantLabel: string | null
  quantity: number
  lineTotalMinor: number
}

/** Structural mirror of the Prisma `Order` query shape (with `lines`) this module reads. */
interface OrderRowForEmail {
  orderNumber: string
  email: string
  currency: string
  subtotalMinor: number
  shippingMinor: number
  taxMinor: number
  totalMinor: number
  shipFullName: string
  shipLine1: string
  shipLine2: string | null
  shipCity: string
  shipState: string
  shipCountry: string
  trackingCarrier: string | null
  trackingNumber: string | null
  isGift: boolean
  giftRecipientName: string | null
  lines: OrderLineRowForEmail[]
}

/** Maps a stored order row to the template layer's `OrderEmailData`. Pure — no DB, no I/O. */
function toEmailData(order: OrderRowForEmail): OrderEmailData {
  return {
    orderNumber: order.orderNumber,
    customerName: order.shipFullName,
    currency: order.currency,
    lines: order.lines.map((line) => ({
      name: line.productName,
      variantLabel: line.variantLabel ?? undefined,
      quantity: line.quantity,
      lineTotalMinor: line.lineTotalMinor,
    })),
    subtotalMinor: order.subtotalMinor,
    shippingMinor: order.shippingMinor,
    taxMinor: order.taxMinor,
    totalMinor: order.totalMinor,
    shippingAddress: {
      line1: order.shipLine1,
      line2: order.shipLine2 ?? undefined,
      city: order.shipCity,
      state: order.shipState,
      country: order.shipCountry,
    },
    isGift: order.isGift,
    giftRecipientName: order.giftRecipientName ?? undefined,
  }
}

/** Sent once, right after `markOrderPaid` genuinely fulfils an order (see that function's call site). */
export async function sendOrderConfirmation(orderNumber: string): Promise<void> {
  try {
    const order = await db.order.findUnique({ where: { orderNumber }, include: { lines: true } })

    if (!order) {
      console.error('[sendOrderConfirmation] order not found', { orderNumber })
      return
    }

    const { subject, html } = orderConfirmationEmail(toEmailData(order))
    const result = await sendEmail({ to: order.email, subject, html })

    if (!result.ok) {
      console.error('[sendOrderConfirmation] sendEmail failed', { orderNumber, error: result.error })
    }
  } catch (error) {
    console.error('[sendOrderConfirmation] unexpected error', { orderNumber, error })
  }
}

/** Sent once, right after `shipOrder` records tracking info (see that function's call site). */
export async function sendOrderShipped(orderNumber: string): Promise<void> {
  try {
    const order = await db.order.findUnique({ where: { orderNumber }, include: { lines: true } })

    if (!order) {
      console.error('[sendOrderShipped] order not found', { orderNumber })
      return
    }

    // A "shipped" email with no tracking info is worse than none — the whole
    // point of this notification is the tracking number. Log and bail rather
    // than send a template that has nothing to show.
    if (!order.trackingCarrier || !order.trackingNumber) {
      console.error('[sendOrderShipped] missing tracking info', { orderNumber })
      return
    }

    const { subject, html } = orderShippedEmail({
      ...toEmailData(order),
      carrier: order.trackingCarrier,
      trackingNumber: order.trackingNumber,
    })
    const result = await sendEmail({ to: order.email, subject, html })

    if (!result.ok) {
      console.error('[sendOrderShipped] sendEmail failed', { orderNumber, error: result.error })
    }
  } catch (error) {
    console.error('[sendOrderShipped] unexpected error', { orderNumber, error })
  }
}

/**
 * Newsletter double-opt-in confirmation (Phase 10a). Same never-throws
 * contract as the order senders: its caller (`subscribe` in
 * newsletter/actions.ts) has already committed the Subscriber row, and a
 * failed send must never surface as a failed subscription — the person
 * simply resubmits. No DB read: the caller passes the row's email + token.
 */
export async function sendNewsletterConfirmation(input: { email: string; token: string }): Promise<void> {
  try {
    const { subject, html } = newsletterConfirmationEmail({
      confirmUrl: absoluteUrl(`/newsletter/confirm?token=${input.token}`),
      unsubscribeUrl: absoluteUrl(`/newsletter/unsubscribe?token=${input.token}`),
    })
    const result = await sendEmail({ to: input.email, subject, html })
    if (!result.ok) {
      console.error('[sendNewsletterConfirmation] sendEmail failed', { error: result.error })
    }
  } catch (error) {
    console.error('[sendNewsletterConfirmation] unexpected error', { error })
  }
}
