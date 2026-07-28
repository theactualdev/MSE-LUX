import 'server-only'
import { headers } from 'next/headers'
import { currencyForCountry, chargeCurrencyFor } from './currencies'

/**
 * Derives the authored charge currency ('NGN' | 'USD') from the request's
 * server-observed geo signal (`x-vercel-ip-country`, the same header
 * `geo-cookie.ts` seeds the display-currency cookie from). Note that
 * `x-vercel-ip-country` is only authoritative on Vercel: their edge
 * *overwrites* it on every request, so a client-sent copy of the header
 * never survives to the origin. On a non-Vercel deploy nothing strips or
 * re-sets it, so it would simply be whatever the client sent — which is one
 * reason (Phase 9c Task 4) this signal is used for observability
 * (`placeOrder`/`getShippingRates` log a divergence against it) rather than
 * enforcement: it is not a value that can safely be trusted more than the
 * client's own claim in every deployment target.
 *
 * Returns `null` — never throws — whenever the signal isn't available or
 * usable: no `x-vercel-ip-country` header (local dev, or any non-Vercel
 * deploy), or `headers()`/the mapping unexpectedly throwing. Callers must
 * treat `null` as "no server opinion"; `null` is NOT the same as "USD" and
 * must never be substituted for the client's own value.
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
