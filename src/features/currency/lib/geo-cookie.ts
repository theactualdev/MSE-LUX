import type { NextRequest, NextResponse } from 'next/server'
import { currencyForCountry } from './currencies'

export const CURRENCY_COOKIE = 'mse-currency'
const ONE_YEAR = 60 * 60 * 24 * 365

/** Seed the display-currency cookie from Vercel geo on first visit. Never overwrites an
 *  existing cookie (so a switcher choice persists), and no-ops without a country header
 *  (client then defaults to NGN). Setting a cookie here does NOT make any page dynamic. */
export function applyCurrencyCookie(request: NextRequest, response: NextResponse): void {
  if (request.cookies.get(CURRENCY_COOKIE)) return
  const country = request.headers.get('x-vercel-ip-country')
  if (!country) return
  response.cookies.set(CURRENCY_COOKIE, currencyForCountry(country), {
    path: '/', maxAge: ONE_YEAR, sameSite: 'lax',
  })
}
