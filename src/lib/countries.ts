import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min'

/**
 * Flag emoji from an ISO 3166-1 alpha-2 code, by offsetting each letter into
 * the Regional Indicator Symbol block. Computed rather than stored so there is
 * no 245-entry flag table to maintain or ship.
 *
 * Renders as a flag on iOS, Android and macOS. Windows has no colour flag font
 * and shows the two letters instead, which is why callers put the ISO code or
 * country name beside it rather than relying on the glyph alone.
 */
export function flagEmoji(iso: string): string {
  return String.fromCodePoint(...[...iso].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65))
}

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' })

export interface CountryOption {
  iso: CountryCode
  name: string
  dialCode: string
}

/**
 * Every country libphonenumber knows, sorted by display name. Built once at
 * module scope — the same list for every render and every instance.
 *
 * Shared by the phone field (which wants the dial code) and the address forms
 * (which want the name), so the two can never disagree about which countries
 * exist.
 */
export const COUNTRIES: CountryOption[] = getCountries()
  .map((iso) => ({
    iso,
    name: REGION_NAMES.of(iso) ?? iso,
    dialCode: `+${getCountryCallingCode(iso)}`,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

const BY_LOWER_NAME = new Map(COUNTRIES.map((country) => [country.name.toLowerCase(), country]))
const BY_ISO = new Map(COUNTRIES.map((country) => [country.iso.toLowerCase(), country]))

/**
 * Resolves whatever is stored in an address's `country` field to a known
 * country.
 *
 * Addresses are stored with the country NAME ("Nigeria"), and that is what
 * `validateAddress` receives as part of the address line. But the field was
 * free text before this, so older rows may hold anything a customer typed —
 * including a bare ISO code. Accepting both mirrors `isNigeria` in
 * `shipping-rates.ts`, which already treats "nigeria" and "ng" alike.
 */
export function findCountry(value: string): CountryOption | undefined {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  return BY_LOWER_NAME.get(normalized) ?? BY_ISO.get(normalized)
}
