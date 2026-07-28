import 'server-only'
import { headers } from 'next/headers'
import { currencyForCountry, chargeCurrencyFor } from './currencies'

/**
 * Re-derives the authored charge currency ('NGN' | 'USD') from the request's
 * server-observed geo signal (`x-vercel-ip-country`, the same header
 * `geo-cookie.ts` seeds the display-currency cookie from) rather than
 * trusting whatever the client claims. This closes the Phase-6 finding that
 * `placeOrder` only format-validated `input.chargeCurrency` — a client could
 * otherwise simply send `'USD'` while browsing from Nigeria (or vice versa)
 * to pick the cheaper authored currency.
 *
 * Returns `null` — never throws — whenever the signal isn't available or
 * usable: no `x-vercel-ip-country` header (local dev, or any non-Vercel
 * deploy), or `headers()`/the mapping unexpectedly throwing. Callers must
 * treat `null` as "no server opinion" and fall back to today's
 * format-validated client value; `null` is NOT the same as "USD" and must
 * never be substituted for the client's own value.
 */
export async function serverChargeCurrency(): Promise<'NGN' | 'USD' | null> {
  try {
    const headerList = await headers()
    const country = headerList.get('x-vercel-ip-country')
    if (!country) return null

    return chargeCurrencyFor(currencyForCountry(country))
  } catch (error) {
    console.error('[serverChargeCurrency] failed to read the geo header — falling back to null', error)
    return null
  }
}
