'use client'

import { useMemo, useState } from 'react'
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Nigeria: the store ships from Lagos and most buyers are Nigerian. */
const DEFAULT_COUNTRY: CountryCode = 'NG'

/**
 * Flag emoji from an ISO 3166-1 alpha-2 code, by offsetting each letter into
 * the Regional Indicator Symbol block. Computed rather than stored so there is
 * no 245-entry flag table to maintain or ship.
 *
 * Renders as a flag on iOS, Android and macOS. Windows has no colour flag
 * font and shows the two letters instead — which is why the dial code and
 * country name sit beside it rather than relying on the glyph alone. That
 * degradation is acceptable here: the storefront's traffic is overwhelmingly
 * mobile, where flags render.
 */
function flagEmoji(iso: string): string {
  return String.fromCodePoint(...[...iso].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65))
}

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' })

interface CountryOption {
  iso: CountryCode
  name: string
  dialCode: string
}

/**
 * Every country libphonenumber knows, sorted by display name. Built once at
 * module scope — it is the same list for every render and every instance.
 */
const COUNTRIES: CountryOption[] = getCountries()
  .map((iso) => ({
    iso,
    name: REGION_NAMES.of(iso) ?? iso,
    dialCode: `+${getCountryCallingCode(iso)}`,
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

/**
 * Splits an existing value into a country and a national number so the field
 * can be re-opened on a saved address.
 *
 * Falls back to the default country and leaves the raw text in the national
 * box when the value can't be parsed — a legacy local-format number like
 * `08012345678` predates this control and must stay editable rather than
 * being silently blanked.
 */
function splitValue(value: string): { country: CountryCode; national: string } {
  if (!value) return { country: DEFAULT_COUNTRY, national: '' }

  const parsed = parsePhoneNumberFromString(value)
  if (parsed?.country) {
    return { country: parsed.country, national: parsed.nationalNumber }
  }

  return { country: DEFAULT_COUNTRY, national: value.replace(/^\+/, '') }
}

/**
 * National digits -> E.164, via the library rather than string concatenation.
 *
 * Concatenating `+${dialCode}${digits}` is the obvious implementation and it
 * is WRONG. Most countries write national numbers with a trunk prefix that
 * must be dropped internationally: Nigeria's `080 1234 5678` is `+234 801 234
 * 5678`, not `+234 080 1234 5678`, and the UK's `07911` is `+447911`. Naive
 * concatenation produced `+23408012345678` — a malformed number that this
 * field would have handed to ShipBubble for every Nigerian order.
 *
 * `AsYouType.getNumber()` applies each country's real national-prefix rules,
 * so it strips the trunk digit when that country has one and leaves it alone
 * when it does not (a US area code may not begin with 0 at all).
 *
 * The fallback covers a number the metadata cannot yet resolve — a partially
 * typed one, or a newly allocated range. It drops a single leading zero,
 * which is the trunk-prefix convention across Nigeria, the UK and most of
 * Europe and Africa, and is harmless where no such prefix exists.
 */
function toE164(country: CountryCode, digits: string): string {
  const asYouType = new AsYouType(country)
  asYouType.input(digits)

  const parsed = asYouType.getNumber()
  if (parsed?.number) return parsed.number

  return `+${getCountryCallingCode(country)}${digits.replace(/^0/, '')}`
}

interface PhoneFieldProps {
  id?: string
  /** E.164 where possible, e.g. `+2348012345678`. */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  className?: string
}

/**
 * Phone input with a country selector, replacing a bare `<input type="tel">`
 * that required buyers to type their own dial code.
 *
 * Emits E.164 (`+2348012345678`). That format was verified against the live
 * ShipBubble address validator — which is where this value ends up, for both
 * rate quoting and label booking — across Nigeria, the UK, the US and Ghana,
 * rather than assumed from the API docs.
 *
 * A NATIVE `<select>` on purpose: 245 options is exactly the case where the
 * OS picker beats a custom listbox, and most of this store's traffic is
 * mobile. It also keeps type-ahead, keyboard support and screen-reader
 * behaviour without reimplementing any of it.
 */
export function PhoneField({
  id,
  value,
  onChange,
  onBlur,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: PhoneFieldProps) {
  const initial = useMemo(() => splitValue(value), [value])
  const [country, setCountry] = useState<CountryCode>(initial.country)

  // The national part is local state, not derived from `value` on every
  // render: formatting as-you-type would otherwise fight the caret while the
  // buyer is still mid-number.
  const [national, setNational] = useState(() =>
    initial.national ? new AsYouType(initial.country).input(initial.national) : '',
  )

  function emit(nextCountry: CountryCode, nextNational: string) {
    const digits = nextNational.replace(/\D/g, '')

    // A country with no number yet must emit empty, NOT a bare dial code —
    // "+234" alone would sail past a "required" check and reach ShipBubble as
    // an unusable phone number.
    if (!digits) {
      onChange('')
      return
    }

    onChange(toE164(nextCountry, digits))
  }

  function handleCountry(nextIso: CountryCode) {
    setCountry(nextIso)
    // Re-format the existing digits for the new country rather than clearing:
    // picking the wrong country first is a common slip, and wiping the number
    // punishes it.
    const digits = national.replace(/\D/g, '')
    setNational(digits ? new AsYouType(nextIso).input(digits) : '')
    emit(nextIso, digits)
  }

  function handleNational(raw: string) {
    const digits = raw.replace(/\D/g, '')
    setNational(new AsYouType(country).input(digits))
    emit(country, digits)
  }

  return (
    <div className={cn('flex gap-2', className)}>
      {/* "Dialling code", not "Country calling code": this sits in the same
          form as the address's own Country field, and two controls both
          announcing "country" is genuinely confusing to navigate by label. */}
      <select
        aria-label="Dialling code"
        value={country}
        onChange={(event) => handleCountry(event.target.value as CountryCode)}
        onBlur={onBlur}
        className={cn(
          'h-9 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        )}
      >
        {COUNTRIES.map((option) => (
          <option key={option.iso} value={option.iso}>
            {flagEmoji(option.iso)} {option.iso} {option.dialCode}
          </option>
        ))}
      </select>

      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={national}
        onChange={(event) => handleNational(event.target.value)}
        onBlur={onBlur}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="flex-1"
      />
    </div>
  )
}
