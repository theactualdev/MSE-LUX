/**
 * Generates `src/lib/subdivisions.generated.ts` — first-level administrative
 * subdivisions for every country, keyed by ISO 3166-1 alpha-2.
 *
 *   npm run subdivisions
 *
 * WHY GENERATE RATHER THAN IMPORT. `country-region-data` is a devDependency
 * and never reaches the browser. Importing it directly from the address form
 * would ship its whole 633 kB payload — country names, ISO codes, region
 * short codes — into the CHECKOUT bundle, the page where a buyer on Nigerian
 * mobile data can least afford it. This emits only what the field actually
 * renders: an ISO code mapped to a list of region NAMES. Everything else is
 * dropped.
 *
 * Region names are what the customer would write and are sent verbatim to
 * ShipBubble as part of `line1, city, state, country`, so the human-readable
 * name is kept and the short code discarded.
 *
 * Countries with no subdivisions in the source are omitted entirely, which is
 * what `subdivisionsFor` reads as "no list — keep this a free-text input".
 * That is a real case (city-states, small island nations), not an edge case.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

type CountryTuple = [name: string, iso2: string, regions: [name: string, code: string][]]

async function main() {
  // `require`, not an ESM import: tsx transpiles this file to CJS, where the
  // package's default export does not survive the interop as a value — the
  // imported binding comes through undefined. Requiring it returns the array
  // directly.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const raw: unknown = require('country-region-data')
  // The module exports an object (`countryShortCodes`, `countryNames`,
  // `countryTuples`, `allCountries`, plus a key per ISO code), not an array —
  // the tuple list lives on `allCountries`.
  const mod = raw as { allCountries?: unknown; default?: { allCountries?: unknown } }
  const list = mod.allCountries ?? mod.default?.allCountries
  if (!Array.isArray(list)) throw new Error('country-region-data: could not find allCountries')
  const countries = list as CountryTuple[]

  const entries = countries
    .map(([, iso2, regions]) => [iso2, regions.map(([name]) => name)] as const)
    .filter(([iso2, regions]) => iso2 && regions.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))

  const body = entries
    .map(([iso2, regions]) => `  ${iso2}: [${regions.map((r) => JSON.stringify(r)).join(', ')}],`)
    .join('\n')

  const file = `// GENERATED FILE — do not edit by hand.
// Run \`npm run subdivisions\` to regenerate from country-region-data.
//
// First-level administrative subdivisions by ISO 3166-1 alpha-2. Only region
// NAMES are kept: they are what a customer writes and what ShipBubble receives
// in the address line. Countries absent from this map have no subdivision list
// and fall back to a free-text field.

export const SUBDIVISIONS: Record<string, string[]> = {
${body}
}
`

  const target = path.join(process.cwd(), 'src/lib/subdivisions.generated.ts')
  await writeFile(target, file)

  const totalRegions = entries.reduce((n, [, regions]) => n + regions.length, 0)
  console.log(`countries with subdivisions : ${entries.length} of ${countries.length}`)
  console.log(`total subdivisions          : ${totalRegions}`)
  console.log(`bytes                       : ${file.length.toLocaleString()}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
