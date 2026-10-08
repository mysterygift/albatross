import { describe, expect, it } from 'vitest'
import {
  sortUnitsForDisplay,
  unitColorVars,
  unitNameToKey,
  unitNameToRank,
  unitRankToName,
} from './unitKey'

describe('unitKey', () => {
  it('reads the rank from canonical and imported unit names', () => {
    expect(unitNameToRank('Main Unit')).toBe(1)
    expect(unitNameToRank('Second Unit')).toBe(2)
    expect(unitNameToRank('2nd Unit')).toBe(2)
    expect(unitNameToRank('Third Unit')).toBe(3)
    expect(unitNameToRank('4th unit')).toBe(4)
    expect(unitNameToRank('Fifth Unit')).toBe(5)
    expect(unitNameToRank('Splinter')).toBeNull()
  })

  it('keeps unranked names on the main colour, as before', () => {
    expect(unitNameToKey('Splinter')).toBe('main')
    expect(unitNameToKey('Fourth Unit')).toBe('fourth')
    expect(unitColorVars('fifth')).toEqual({
      background: 'var(--unit-fifth)',
      foreground: 'var(--unit-fifth-foreground)',
    })
  })

  it('names ranks and sorts units Main first rather than alphabetically', () => {
    expect(unitRankToName(3)).toBe('Third Unit')
    const sorted = sortUnitsForDisplay(
      ['Third Unit', 'Fifth Unit', 'Main Unit', 'Splinter', 'Second Unit', 'Fourth Unit'].map((name) => ({ name }))
    )
    expect(sorted.map((u) => u.name)).toEqual([
      'Main Unit',
      'Second Unit',
      'Third Unit',
      'Fourth Unit',
      'Fifth Unit',
      'Splinter',
    ])
  })
})
