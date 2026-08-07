import 'server-only'

/**
 * NGN -> USD conversion for SHIPPING CHARGES.
 *
 * Deliberately separate from `services/fx` (the display-FX provider). That
 * module exists to render an authored USD price in a browsing currency; it is
 * best-effort by design, and — decisively — it carries no NGN rate at all,
 * because NGN is an AUTHORED currency in this system rather than a derived
 * one. Reaching for it here would have meant converting money on a table that
 * does not contain the pair.
 *
 * This exists because ShipBubble quotes every route in Naira, including
 * international ones, while a dollar customer must be charged in dollars.
 * Before it, USD orders skipped the courier call entirely and paid one flat
 * rate worldwide.
 */

const FX_ENDPOINT = 'https://open.er-api.com/v6/latest/USD'

/**
 * Applied on top of the converted amount, so the store sits slightly over
 * rather than under.
 *
 * The rate below refreshes once a day; a charge can happen twenty-three hours
 * later, and the Naira is not a quiet currency. Without a margin, every
 * intraday move against us comes straight out of the shipping line — on
 * exactly the orders where shipping is largest. 5% on a ₦78,000 parcel is
 * about $3: small enough not to distort the customer's price, large enough to
 * absorb an ordinary day's drift.
 */
const FX_MARGIN = 0.05

/**
 * Committed USD->NGN snapshot, used only when the live feed is unreachable.
 *
 * Taken 2026-08-07, when the feed read 1364.22. Deliberately rounded DOWN to
 * 1300: a backstop that overstates the naira's strength would undercharge, and
 * a stale backstop always errs in that direction as the naira weakens. Erring
 * low means a feed outage charges slightly more, never less. Refresh it by
 * hand when the real rate moves far from it.
 */
const BACKSTOP_USD_NGN = 1300

export interface UsdNgnRate {
  /** Naira per one US dollar. */
  rate: number
  source: 'live' | 'backstop'
}

/**
 * Today's USD->NGN rate, cached for a day by the same mechanism the display
 * feed uses. Never throws: an unreachable or malformed feed yields the
 * backstop, because a shipping quote must always be produceable.
 */
export async function getUsdNgnRate(): Promise<UsdNgnRate> {
  try {
    const res = await fetch(FX_ENDPOINT, { next: { revalidate: 86_400 } })
    if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`)

    const body = (await res.json()) as { rates?: Record<string, unknown> }
    const ngn = body.rates?.NGN

    // A non-finite or non-positive rate would produce Infinity/NaN/negative
    // money downstream, so it is treated as no rate at all rather than
    // trusted because the request happened to return 200.
    if (typeof ngn !== 'number' || !Number.isFinite(ngn) || ngn <= 0) {
      throw new Error('FX feed returned no usable NGN rate')
    }

    return { rate: ngn, source: 'live' }
  } catch (error) {
    console.error('shipping-fx: falling back to the backstop USD/NGN rate', error)
    return { rate: BACKSTOP_USD_NGN, source: 'backstop' }
  }
}

/**
 * Naira minor units -> US dollar minor units, with the margin applied.
 *
 * PURE, so the rounding and margin can be tested without touching the network.
 *
 * Rounds UP to the cent. Rounding to nearest would let a fraction of a cent
 * favour the customer on every single international order; over a catalog's
 * worth of shipments that is a systematic leak, and the direction of the error
 * matters more than its size. A guard rate of zero or worse cannot silently
 * produce Infinity either — it falls back to the backstop.
 */
export function usdMinorFromNgnMinor(ngnMinor: number, rate: number): number {
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : BACKSTOP_USD_NGN
  const usdMajor = (ngnMinor / 100 / safeRate) * (1 + FX_MARGIN)
  return Math.ceil(usdMajor * 100)
}
