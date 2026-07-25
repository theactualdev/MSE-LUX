import 'server-only'
import { SHIPBUBBLE_CATEGORY_ID } from '@/features/checkout/lib/shipping-config'

/**
 * Thin, server-only REST wrapper around ShipBubble's shipping API — address
 * validation + live courier rate fetching. Mirrors the `paystack.ts` idiom
 * (Phase 6): a module-level base URL, `Authorization: Bearer <key>` read
 * per-call (not at import time), plain `fetch`, and a plain `Error` thrown on
 * failure so callers (`shipping.ts`'s `getShippingRates`, Task 3) can catch
 * and fall back to a flat rate. No `db`, no auth — pure REST.
 */

const SHIPBUBBLE_BASE_URL = 'https://api.shipbubble.com/v1'

export interface ShipBubbleRate {
  courierId: string
  serviceCode: string
  label: string
  amountMinor: number
  currency: string
  deliveryEta?: string
}

export interface PackageItem {
  name: string
  description?: string
  unit_weight: number
  unit_amount: number
  quantity: number
}

function requireApiKey(): string {
  const key = process.env.SHIPBUBBLE_API_KEY
  if (!key) throw new Error('SHIPBUBBLE_API_KEY is not set')
  return key
}

/**
 * `POST /shipping/address/validate`. `address` is a single free-text string
 * (ShipBubble does its own parsing/geocoding). Returns the validated
 * `address_code` as a string — ShipBubble may return it as a number or a
 * string depending on endpoint/version, so we normalize with `String(...)`.
 * Throws a plain `Error` on a non-2xx response or `status: false`.
 */
export async function validateAddress(input: {
  name: string
  email: string
  phone: string
  address: string
}): Promise<{ addressCode: string }> {
  const apiKey = requireApiKey()

  const res = await fetch(`${SHIPBUBBLE_BASE_URL}/shipping/address/validate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address,
    }),
  })

  const body = (await res.json()) as {
    status?: boolean
    message?: string
    data?: { address_code?: number | string }
  }

  if (!res.ok || body.status !== true || body.data?.address_code === undefined || body.data?.address_code === null) {
    throw new Error(`ShipBubble address validate failed: ${body.message ?? res.status}`)
  }

  return { addressCode: String(body.data.address_code) }
}

/**
 * `POST /shipping/fetch_rates`. Maps ShipBubble's (real) misspelled
 * `reciever_address_code` field name in the OUTGOING request body only — the
 * public `fetchRates` input uses the correctly-spelled `receiverAddressCode`.
 *
 * `category_id` is required by ShipBubble on every rate fetch; we send the
 * tunable `SHIPBUBBLE_CATEGORY_ID` config constant (see `shipping-config.ts`)
 * rather than taking it as a per-call input, since Phase 7 has one package
 * category story (a flat weight/dimension model, no per-product categories).
 *
 * ASSUMPTION (flag for QA / Task 3): `courier.total` is treated as already
 * being in minor units (kobo/cents), matching this codebase's money model —
 * i.e. `amountMinor = courier.total` with no scaling. ShipBubble's public
 * docs describe NGN amounts; if `total` turns out to be a major-unit number
 * (e.g. `2500` meaning ₦2,500.00 rather than ₦25.00), this mapping is off by
 * 100x and must be corrected here (and only here) once confirmed against a
 * real ShipBubble test-mode response.
 *
 * `deliveryEta` is read from `delivery_eta` if present, else
 * `delivery_eta_time`, else left `undefined`.
 *
 * Also returns the raw `data.request_token` ShipBubble issues alongside the
 * quote — callers that go on to book a shipment (`createLabel`, Task 3) pass
 * it straight through to bind the booking to this quote. A `status: true`
 * response with no `request_token` is treated as a failure (booking off it
 * would be impossible), and throws.
 *
 * Throws a plain `Error` on a non-2xx response, `status: false`, or a missing
 * `request_token`.
 */
export async function fetchRates(input: {
  senderAddressCode: string
  receiverAddressCode: string
  packageItems: PackageItem[]
  packageDimension: { length: number; width: number; height: number }
  pickupDate: string
}): Promise<{ requestToken: string; rates: ShipBubbleRate[] }> {
  const apiKey = requireApiKey()

  const res = await fetch(`${SHIPBUBBLE_BASE_URL}/shipping/fetch_rates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender_address_code: input.senderAddressCode,
      reciever_address_code: input.receiverAddressCode,
      pickup_date: input.pickupDate,
      category_id: SHIPBUBBLE_CATEGORY_ID,
      package_items: input.packageItems,
      package_dimension: input.packageDimension,
    }),
  })

  const body = (await res.json()) as {
    status?: boolean
    message?: string
    data?: {
      request_token?: string
      couriers?: Array<{
        courier_id?: string
        courier_name?: string
        service_code?: string
        total?: number
        currency?: string
        delivery_eta?: string
        delivery_eta_time?: string
      }>
    }
  }

  if (!res.ok || body.status !== true || !body.data) {
    throw new Error(`ShipBubble fetch rates failed: ${body.message ?? res.status}`)
  }

  const requestToken = body.data.request_token
  if (!requestToken) throw new Error('ShipBubble fetch rates returned no request_token')

  const couriers = body.data.couriers ?? []

  return {
    requestToken,
    rates: couriers.map((courier) => ({
      courierId: String(courier.courier_id ?? ''),
      serviceCode: String(courier.service_code ?? ''),
      label: String(courier.courier_name ?? ''),
      amountMinor: courier.total ?? 0,
      currency: String(courier.currency ?? ''),
      deliveryEta: courier.delivery_eta ?? courier.delivery_eta_time,
    })),
  }
}

/**
 * `POST /shipping/labels` — books the shipment ShipBubble quoted via
 * `fetchRates` (the `requestToken` binds this booking to that quote; tokens
 * are short-lived, so callers re-quote just before booking).
 *
 * QA-VERIFY (same protocol as `courier.total` above): the exact field names
 * (`request_token`/`service_code`/`courier_id`; `data.order_id`,
 * `data.tracking_number`, `data.tracking_url`, `data.courier.name`) are from
 * ShipBubble's docs and MUST be confirmed against a real test key before live
 * use — mapped in exactly this one function.
 */
export async function createLabel(input: { requestToken: string; courierId: string; serviceCode: string }): Promise<{
  shipbubbleOrderId: string
  trackingNumber: string
  trackingUrl?: string
  courierName: string
}> {
  const apiKey = requireApiKey()

  const res = await fetch(`${SHIPBUBBLE_BASE_URL}/shipping/labels`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_token: input.requestToken, service_code: input.serviceCode, courier_id: input.courierId }),
  })

  const body = (await res.json()) as {
    status?: boolean
    message?: string
    data?: { order_id?: number | string; tracking_number?: string; tracking_url?: string; courier?: { name?: string } }
  }

  if (!res.ok || body.status !== true || !body.data?.order_id || !body.data.tracking_number) {
    throw new Error(`ShipBubble create label failed: ${body.message ?? res.status}`)
  }

  return {
    shipbubbleOrderId: String(body.data.order_id),
    trackingNumber: body.data.tracking_number,
    trackingUrl: body.data.tracking_url,
    courierName: String(body.data.courier?.name ?? ''),
  }
}
