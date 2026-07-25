// Pure, DB-free mapping from a stored Prisma `Order` row (with its `lines` included) to the
// domain `Order` shape the UI already renders (`src/features/checkout/lib/place-order.ts`),
// plus the persisted `status`. Both order placement (writes the row) and per-user order reads
// (query it back) go through `mapOrderRow` so the UI never sees the Prisma row shape directly.
//
// The row type below is a deliberately narrow, local structural mirror of the generated Prisma
// payload shape (see `src/features/catalog/server/mapper.ts` for the same convention) rather
// than the generated `GetPayload` type itself — a structural subset that a Prisma query's
// `include` result satisfies.

import type { OrderStatus } from '@/generated/prisma/enums'
import type { Currency } from '@/types/money'
import type { Order, OrderLine } from '@/features/checkout/lib/place-order'

export interface OrderLineRowForMapping {
  productName: string
  variantLabel: string | null
  image: string | null
  imageAlt: string | null
  quantity: number
  unitPriceMinor: number
  lineTotalMinor: number
}

/** Structural mirror of the Prisma `Order` query shape, including its `lines` relation. */
export interface OrderRowForMapping {
  orderNumber: string
  email: string
  status: OrderStatus
  placedAt: Date
  shipFullName: string
  shipPhone: string
  shipLine1: string
  shipLine2: string | null
  shipCity: string
  shipState: string
  shipCountry: string
  shipPostalCode: string | null
  shippingLabel: string
  // We only ever store 'NGN'/'USD' here, but the column is a plain String.
  currency: string
  subtotalMinor: number
  shippingMinor: number
  taxMinor: number
  totalMinor: number
  lines: OrderLineRowForMapping[]
  trackingCarrier?: string | null
  trackingNumber?: string | null
}

export type OrderView = Order & { status: OrderStatus; trackingCarrier?: string; trackingNumber?: string }

function toOrderLine(row: OrderLineRowForMapping, currency: Currency): OrderLine {
  return {
    name: row.productName,
    variantLabel: row.variantLabel ?? undefined,
    image: { src: row.image ?? '', alt: row.imageAlt ?? '' },
    quantity: row.quantity,
    unitPrice: { amountMinor: row.unitPriceMinor, currency },
    lineTotal: { amountMinor: row.lineTotalMinor, currency },
  }
}

/**
 * Maps a Prisma order row (with `lines` included) to the domain `OrderView`. Pure — no DB, no
 * auth. The shipping address is reassembled from the `ship*` snapshot columns and every money
 * value is read in the order's own `currency` (never re-derived or FX-converted).
 */
export function mapOrderRow(row: OrderRowForMapping): OrderView {
  const currency = row.currency as Currency

  return {
    orderNumber: row.orderNumber,
    email: row.email,
    address: {
      fullName: row.shipFullName,
      phone: row.shipPhone,
      line1: row.shipLine1,
      line2: row.shipLine2 ?? undefined,
      city: row.shipCity,
      state: row.shipState,
      country: row.shipCountry,
      postalCode: row.shipPostalCode ?? undefined,
    },
    shippingLabel: row.shippingLabel,
    lines: row.lines.map((line) => toOrderLine(line, currency)),
    summary: {
      subtotal: { amountMinor: row.subtotalMinor, currency },
      shipping: { amountMinor: row.shippingMinor, currency },
      tax: { amountMinor: row.taxMinor, currency },
      total: { amountMinor: row.totalMinor, currency },
    },
    placedAt: row.placedAt.toISOString(),
    status: row.status,
    trackingCarrier: row.trackingCarrier ?? undefined,
    trackingNumber: row.trackingNumber ?? undefined,
  }
}
