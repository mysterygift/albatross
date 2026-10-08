import { describe, expect, it } from 'vitest'

import { bestMatches, normalizeNameKey } from './similarity'

type Row = { id: string; name: string }
const rows: Row[] = [
  { id: '1', name: 'Brighton Beach' },
  { id: '2', name: 'BEACH' },
  { id: '3', name: 'Kitchen' },
]

describe('bestMatches', () => {
  it('prefers an exact normalised name and returns only exact matches', () => {
    expect(bestMatches('  beach ', rows, (r) => r.name)).toEqual([{ item: rows[1], score: 1, exact: true }])
  })

  it('falls back to word overlap above the threshold, best first', () => {
    const matches = bestMatches('Brighton Beach Car Park', rows, (r) => r.name)
    expect(matches.map((m) => m.item.id)).toEqual(['1'])
    expect(matches[0]!.exact).toBe(false)
  })

  it('returns nothing for unrelated or blank names', () => {
    expect(bestMatches('Spaceship', rows, (r) => r.name)).toEqual([])
    expect(bestMatches('   ', rows, (r) => r.name)).toEqual([])
  })

  it('normalises quotes, dashes and spacing in keys', () => {
    expect(normalizeNameKey('john’s  flat – night')).toBe("JOHN'S FLAT - NIGHT")
  })
})
