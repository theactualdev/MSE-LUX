import { findCountry } from '@/lib/countries'
import { SUBDIVISIONS } from '@/lib/subdivisions.generated'

/**
 * First-level administrative subdivisions for every country, by ISO 3166-1
 * alpha-2.
 *
 * The map is GENERATED (`npm run subdivisions`) from `country-region-data`,
 * which stays a devDependency: importing it directly would ship its whole
 * 633 kB payload — country names, ISO codes, region short codes — into the
 * checkout bundle. The generated artifact keeps only region NAMES, which is
 * all the field renders and all ShipBubble receives, at roughly 62 kB for
 * 4,387 subdivisions across 249 countries.
 *
 * This replaced a hand-written list covering five countries, with everywhere
 * else falling back to a free-text box. `subdivisionsFor` still returns null
 * for any country absent from the map, so that fallback remains the behaviour
 * for anything the data does not cover.
 */

/**
 * The subdivisions to offer for a stored country value, or `null` when that
 * country has no list here and the field should stay free text.
 *
 * `null` and `[]` are meaningfully different: an empty array would mean "this
 * country has no subdivisions", which is not something this file claims about
 * anywhere. Callers branch on `null` to decide select-vs-input.
 */
export function subdivisionsFor(country: string): string[] | null {
  const match = findCountry(country)
  if (!match) return null
  return SUBDIVISIONS[match.iso] ?? null
}

/** The label a country uses for its first-level subdivision. */
export function subdivisionLabel(country: string): string {
  const match = findCountry(country)
  switch (match?.iso) {
    case 'NG':
    case 'US':
      return 'State'
    case 'CA':
      return 'Province'
    case 'GH':
      return 'Region'
    case 'ZA':
      return 'Province'
    default:
      return 'State / Region'
  }
}
