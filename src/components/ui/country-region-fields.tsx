'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { COUNTRIES, flagEmoji } from '@/lib/countries'
import { subdivisionLabel, subdivisionsFor } from '@/lib/subdivisions'
import { cn } from '@/lib/utils'

const SELECT_CLASSES = cn(
  'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs',
  'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
  'aria-invalid:border-destructive',
)

interface CountrySelectProps {
  id: string
  value: string
  onChange: (country: string) => void
  error?: string
}

interface RegionFieldProps {
  id: string
  /** The currently selected country — this is what decides select vs input. */
  country: string
  value: string
  onChange: (region: string) => void
  error?: string
}

/**
 * The Country and State/Region pair, where the second depends on the first.
 *
 * Both were free-text inputs, so a buyer could type "lagos", "Lagos State" or
 * a typo, and the store had no reliable way to group orders by destination.
 * Country is now always a select; the region becomes a select for the
 * countries `subdivisions.ts` knows and stays a text input for the rest.
 *
 * Values are stored as human-readable NAMES, not codes, because that is what
 * already goes to ShipBubble — the address line is
 * `line1, city, state, country` — and what existing saved addresses hold.
 * `isNigeria` in `shipping-rates.ts` accepts "nigeria" or "ng" either way, so
 * the domestic-vs-international branch is unaffected by this change.
 *
 * Changing country CLEARS the region rather than keeping it: "Lagos" is not a
 * meaningful province of Canada, and silently carrying it over would send a
 * nonsense address line to the courier.
 */
export function CountrySelect({ id: countryId, value: country, onChange: onCountryChange, error: countryError }: CountrySelectProps) {
  return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={countryId}>Country</Label>
        <select
          id={countryId}
          autoComplete="country-name"
          value={country}
          aria-invalid={!!countryError}
          aria-describedby={countryError ? `${countryId}-error` : undefined}
          onChange={(event) => onCountryChange(event.target.value)}
          className={SELECT_CLASSES}
        >
          {/* A stored country that isn't in the list (an older free-text row,
              or a spelling the list doesn't use) would otherwise make the
              select silently show the first country in the world and submit
              THAT. Surfacing it as a selected option keeps the address intact
              until someone deliberately changes it. */}
          {country && !COUNTRIES.some((option) => option.name === country) ? (
            <option value={country}>{country}</option>
          ) : null}
          {COUNTRIES.map((option) => (
            <option key={option.iso} value={option.name}>
              {flagEmoji(option.iso)} {option.name}
            </option>
          ))}
        </select>
        {countryError ? (
          <p id={`${countryId}-error`} className="text-sm text-destructive">
            {countryError}
          </p>
        ) : null}
      </div>
  )
}

/**
 * The State / Province / Region field. A select for countries
 * `subdivisions.ts` knows, a text input for the rest — so nobody in an
 * uncovered country is blocked by a list that doesn't contain their region.
 */
export function RegionField({ id: regionId, country, value: region, onChange: onRegionChange, error: regionError }: RegionFieldProps) {
  const regions = subdivisionsFor(country)
  const label = subdivisionLabel(country)

  return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={regionId}>{label}</Label>
        {regions ? (
          <select
            id={regionId}
            autoComplete="address-level1"
            value={region}
            aria-invalid={!!regionError}
            aria-describedby={regionError ? `${regionId}-error` : undefined}
            onChange={(event) => onRegionChange(event.target.value)}
            className={SELECT_CLASSES}
          >
            <option value="">Select {label.toLowerCase()}</option>
            {/* Same reasoning as the country fallback: keep an unrecognised
                stored value visible rather than silently replacing it. */}
            {region && !regions.includes(region) ? <option value={region}>{region}</option> : null}
            {regions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <Input
            id={regionId}
            autoComplete="address-level1"
            value={region}
            aria-invalid={!!regionError}
            aria-describedby={regionError ? `${regionId}-error` : undefined}
            onChange={(event) => onRegionChange(event.target.value)}
          />
        )}
        {regionError ? (
          <p id={`${regionId}-error`} className="text-sm text-destructive">
            {regionError}
          </p>
        ) : null}
      </div>
  )
}
