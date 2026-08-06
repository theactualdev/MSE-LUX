import { findCountry } from '@/lib/countries'

/**
 * First-level administrative subdivisions, keyed by ISO 3166-1 alpha-2.
 *
 * DELIBERATELY NOT EXHAUSTIVE. A complete ISO 3166-2 dataset is roughly five
 * thousand entries, and this list is imported by the checkout address form —
 * the page where a Nigerian buyer on mobile data can least afford another
 * payload. What is here covers the store's real destinations; every other
 * country falls back to a free-text box, which is the behaviour the field had
 * for everyone until now, so nobody is worse off.
 *
 * The names are the ones a customer would write and are sent verbatim to
 * ShipBubble as part of `line1, city, state, country`, so they must stay
 * human-readable — not codes.
 *
 * Adding a country is just another entry.
 */
const SUBDIVISIONS: Record<string, string[]> = {
  // All 36 states plus the Federal Capital Territory.
  NG: [
    'Abia',
    'Adamawa',
    'Akwa Ibom',
    'Anambra',
    'Bauchi',
    'Bayelsa',
    'Benue',
    'Borno',
    'Cross River',
    'Delta',
    'Ebonyi',
    'Edo',
    'Ekiti',
    'Enugu',
    'Federal Capital Territory',
    'Gombe',
    'Imo',
    'Jigawa',
    'Kaduna',
    'Kano',
    'Katsina',
    'Kebbi',
    'Kogi',
    'Kwara',
    'Lagos',
    'Nasarawa',
    'Niger',
    'Ogun',
    'Ondo',
    'Osun',
    'Oyo',
    'Plateau',
    'Rivers',
    'Sokoto',
    'Taraba',
    'Yobe',
    'Zamfara',
  ],
  GH: [
    'Ahafo',
    'Ashanti',
    'Bono',
    'Bono East',
    'Central',
    'Eastern',
    'Greater Accra',
    'North East',
    'Northern',
    'Oti',
    'Savannah',
    'Upper East',
    'Upper West',
    'Volta',
    'Western',
    'Western North',
  ],
  ZA: [
    'Eastern Cape',
    'Free State',
    'Gauteng',
    'KwaZulu-Natal',
    'Limpopo',
    'Mpumalanga',
    'North West',
    'Northern Cape',
    'Western Cape',
  ],
  US: [
    'Alabama',
    'Alaska',
    'Arizona',
    'Arkansas',
    'California',
    'Colorado',
    'Connecticut',
    'Delaware',
    'District of Columbia',
    'Florida',
    'Georgia',
    'Hawaii',
    'Idaho',
    'Illinois',
    'Indiana',
    'Iowa',
    'Kansas',
    'Kentucky',
    'Louisiana',
    'Maine',
    'Maryland',
    'Massachusetts',
    'Michigan',
    'Minnesota',
    'Mississippi',
    'Missouri',
    'Montana',
    'Nebraska',
    'Nevada',
    'New Hampshire',
    'New Jersey',
    'New Mexico',
    'New York',
    'North Carolina',
    'North Dakota',
    'Ohio',
    'Oklahoma',
    'Oregon',
    'Pennsylvania',
    'Rhode Island',
    'South Carolina',
    'South Dakota',
    'Tennessee',
    'Texas',
    'Utah',
    'Vermont',
    'Virginia',
    'Washington',
    'West Virginia',
    'Wisconsin',
    'Wyoming',
  ],
  CA: [
    'Alberta',
    'British Columbia',
    'Manitoba',
    'New Brunswick',
    'Newfoundland and Labrador',
    'Northwest Territories',
    'Nova Scotia',
    'Nunavut',
    'Ontario',
    'Prince Edward Island',
    'Quebec',
    'Saskatchewan',
    'Yukon',
  ],
}

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
