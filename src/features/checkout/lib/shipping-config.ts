/**
 * Shipping config: a mix of env (store-specific, per-deploy) and constants
 * (package-model illustrative defaults). No directive — this is plain data,
 * safe to import from either server or client code, though in practice only
 * `shipping.ts` ('use server') reads it today.
 *
 * Every value here is documented as tunable / to be finalized before launch
 * (see `docs/phases/phase-7-shipping/spec.md` §7 "Open Items / Assumptions").
 */

/**
 * The store's validated ShipBubble pickup/sender `address_code` — obtained by
 * validating the store's real address via `validateAddress` once (Task 6,
 * developer gate) and pasting the resulting code into `.env`. Empty string
 * until configured; `getShippingRates` (Task 3) must guard against that and
 * fall back rather than call ShipBubble with a blank sender code.
 */
export const SHIPBUBBLE_ORIGIN_ADDRESS_CODE = process.env.SHIPBUBBLE_ORIGIN_ADDRESS_CODE ?? ''

/**
 * ShipBubble's package category id, required on every `fetch_rates` call.
 * Defaults to `0` (a placeholder / "others"-style general category) until a
 * real category id is confirmed against ShipBubble's category list — tunable
 * via `SHIPBUBBLE_CATEGORY_ID` without a code change.
 */
export const SHIPBUBBLE_CATEGORY_ID = Number(process.env.SHIPBUBBLE_CATEGORY_ID ?? '0')

/**
 * The flat rate offered for a non-Nigeria delivery address, or any address
 * when the customer is charged in USD (no live ShipBubble quoting for
 * international couriers yet — see spec §2 deferred list; and ShipBubble's ₦
 * rates can't be charged in USD without FX). Illustrative value; finalize
 * before launch.
 */
export const FLAT_INTERNATIONAL_USD = { amountMinor: 2500, currency: 'USD' as const, label: 'International shipping', deliveryEta: '7–14 days' }

/**
 * The flat rate offered when the customer is charged in NGN but the delivery
 * address is outside Nigeria — same "no live international quoting" gap as
 * `FLAT_INTERNATIONAL_USD`, but quoted in NGN since that's the charge
 * currency. Illustrative value; finalize before launch.
 */
export const FLAT_INTERNATIONAL_NGN = { amountMinor: 500_000, currency: 'NGN' as const, label: 'International shipping', deliveryEta: '7–14 days' }

/**
 * The flat rate used when ShipBubble is unavailable / can't validate the
 * address / returns no couriers for a Nigerian address. Illustrative value;
 * finalize before launch.
 */
export const FLAT_FALLBACK_NGN = { amountMinor: 250_000, currency: 'NGN' as const, label: 'Standard delivery', deliveryEta: '3–5 days' }

/**
 * The flat rate used when ShipBubble is unavailable for a non-Nigerian
 * address (falls back to the same value as `FLAT_INTERNATIONAL_USD` today,
 * kept as a distinct export so the two concerns — "no live international
 * quoting" vs. "ShipBubble outage" — can diverge later without a rename).
 */
export const FLAT_FALLBACK_USD = { amountMinor: 2500, currency: 'USD' as const, label: 'International shipping', deliveryEta: '7–14 days' }

/** Flat package-weight model (grams) until real per-product weights (Phase 8). */
export const WEIGHT_BASE_GRAMS = 300
export const WEIGHT_PER_ITEM_GRAMS = 150

/** A nominal small-parcel dimension (cm) until real per-product dimensions (Phase 8). */
export const NOMINAL_DIMENSION = { length: 20, width: 15, height: 8 }
