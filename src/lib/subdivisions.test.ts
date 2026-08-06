import { describe, it, expect } from 'vitest'
import { subdivisionsFor, subdivisionLabel } from '@/lib/subdivisions'

describe('subdivisionsFor', () => {
  it('returns all 36 Nigerian states plus the FCT', () => {
    const states = subdivisionsFor('Nigeria')

    expect(states).toHaveLength(37)
    expect(states).toContain('Lagos')
    expect(states).toContain('Federal Capital Territory')
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
  it('returns null for a country with no list, so the field stays free text', () => {
    expect(subdivisionsFor('France')).toBeNull()
    expect(subdivisionsFor('')).toBeNull()
    expect(subdivisionsFor('Not A Country')).toBeNull()
  })

  it('covers the other markets it claims to', () => {
    expect(subdivisionsFor('United States')).toContain('New York')
    expect(subdivisionsFor('Canada')).toContain('Ontario')
    expect(subdivisionsFor('Ghana')).toContain('Greater Accra')
    expect(subdivisionsFor('South Africa')).toContain('Gauteng')
  })

  it('lists no duplicates and no blank entries', () => {
    for (const country of ['Nigeria', 'United States', 'Canada', 'Ghana', 'South Africa']) {
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

  it('falls back to a neutral label for countries with no list', () => {
    expect(subdivisionLabel('France')).toBe('State / Region')
  })
})
