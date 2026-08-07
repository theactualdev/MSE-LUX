import { describe, it, expect } from 'vitest'
import { subdivisionsFor, subdivisionLabel } from '@/lib/subdivisions'

describe('subdivisionsFor', () => {
  it('returns all 36 Nigerian states plus the FCT', () => {
    const states = subdivisionsFor('Nigeria')

    expect(states).toHaveLength(37)
    expect(states).toContain('Lagos')
    // The dataset names it "Abuja Federal Capital Territory", not "Federal
    // Capital Territory" — it is sent verbatim to ShipBubble, so the exact
    // string is what matters.
    expect(states).toContain('Abuja Federal Capital Territory')
  })

  // `isNigeria` in shipping-rates.ts already treats "nigeria" and "ng" alike,
  // and the field was free text before this, so stored values vary.
  it('accepts an ISO code or odd casing, matching how country is stored elsewhere', () => {
    expect(subdivisionsFor('NG')).toEqual(subdivisionsFor('Nigeria'))
    expect(subdivisionsFor('  nigeria  ')).toEqual(subdivisionsFor('Nigeria'))
  })

  // null, not [] — an empty array would assert "this country has no
  // subdivisions", which this data never claims. Callers branch on null to
  // decide select vs free-text input.
  //
  // Every country in the dataset now has subdivisions, so the only way to
  // reach null is a value that resolves to no country at all — a blank field,
  // or a free-text country stored before the select existed.
  it('returns null when the country cannot be resolved, so the field stays free text', () => {
    expect(subdivisionsFor('')).toBeNull()
    expect(subdivisionsFor('Not A Country')).toBeNull()
    expect(subdivisionsFor('Republic of Nowhere')).toBeNull()
  })

  it('now covers every country, not just the original five', () => {
    expect(subdivisionsFor('United States')).toContain('New York')
    expect(subdivisionsFor('Canada')).toContain('Ontario')
    expect(subdivisionsFor('Ghana')).toContain('Greater Accra')
    expect(subdivisionsFor('South Africa')).toContain('Gauteng')
    // Previously free text — the point of the change.
    expect(subdivisionsFor('France')).toContain('Bretagne')
    expect(subdivisionsFor('Japan')?.length).toBeGreaterThan(0)
    expect(subdivisionsFor('Brazil')?.length).toBeGreaterThan(0)
  })

  it('lists no duplicates and no blank entries', () => {
    for (const country of ['Nigeria', 'United States', 'Canada', 'Ghana', 'South Africa', 'France', 'India']) {
      const list = subdivisionsFor(country) ?? []
      expect(new Set(list).size, `${country} has duplicates`).toBe(list.length)
      expect(list.every((name) => name.trim() !== ''), `${country} has a blank entry`).toBe(true)
    }
  })
})

describe('subdivisionLabel', () => {
  it('uses the term each country actually uses', () => {
    expect(subdivisionLabel('Nigeria')).toBe('State')
    expect(subdivisionLabel('Canada')).toBe('Province')
    expect(subdivisionLabel('Ghana')).toBe('Region')
  })

  // Only the five named countries get a specific term; everywhere else uses
  // the neutral one rather than guessing at 249 local conventions.
  it('falls back to a neutral label elsewhere', () => {
    expect(subdivisionLabel('France')).toBe('State / Region')
    expect(subdivisionLabel('Japan')).toBe('State / Region')
  })
})
