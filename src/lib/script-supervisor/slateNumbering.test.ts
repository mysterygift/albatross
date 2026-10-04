import { describe, expect, it } from 'vitest'

import {
  formatSlateLabel,
  formatTramlineLabel,
  nextConsecutiveSlateNumber,
  nextTakeNumber,
  normaliseSlatePrefix,
  slateDisplayLabel,
  usOrdinalForSetupLetter,
  usSetupLetterForOrdinal,
} from './slateNumbering'

describe('UK consecutive slating', () => {
  it('starts at 1 and continues from the highest live number, ignoring gaps', () => {
    expect(nextConsecutiveSlateNumber([])).toBe(1)
    expect(nextConsecutiveSlateNumber([1, 2, 5])).toBe(6)
    expect(nextTakeNumber([2, 1])).toBe(3)
  })

  it('normalises series prefixes and formats clapperboard labels', () => {
    expect(normaliseSlatePrefix(' x ')).toBe('X')
    expect(normaliseSlatePrefix(null)).toBe('')
    expect(formatSlateLabel('', 212)).toBe('212')
    expect(formatSlateLabel('y', 3)).toBe('Y3')
  })
})

describe('US scene + setup letter slating', () => {
  it('maps ordinals to letters, skipping I and O and doubling after Z', () => {
    expect([1, 2, 3, 9, 10, 14, 25, 26, 27].map(usSetupLetterForOrdinal)).toEqual([
      '', 'A', 'B', 'H', 'J', 'P', 'Z', 'AA', 'BB',
    ])
  })

  it('round-trips letters and rejects ambiguous ones', () => {
    for (const ordinal of [1, 2, 10, 25, 26, 50]) {
      expect(usOrdinalForSetupLetter(usSetupLetterForOrdinal(ordinal))).toBe(ordinal)
    }
    expect(usOrdinalForSetupLetter(' b ')).toBe(3)
    expect(usOrdinalForSetupLetter('I')).toBeNull()
    expect(usOrdinalForSetupLetter('O')).toBeNull()
    expect(usOrdinalForSetupLetter('AB')).toBeNull()
  })

  it('labels slates by system', () => {
    expect(slateDisplayLabel({ slating_system: 'us', slate_prefix: '', slate_number: 3 }, '23')).toBe('23B')
    expect(slateDisplayLabel({ slating_system: 'us', slate_prefix: '', slate_number: 1 }, '10A')).toBe('10A')
    expect(slateDisplayLabel({ slating_system: 'uk', slate_prefix: 'X', slate_number: 9 }, '23')).toBe('X9')
  })
})

describe('tramline labels', () => {
  it('adds printed takes and shot code', () => {
    expect(formatTramlineLabel({ slateLabel: '67', printTakeNumbers: [4], shotCode: 'MS', description: 'Elena' })).toBe(
      '67/4 MS Elena'
    )
    expect(formatTramlineLabel({ slateLabel: '23A', printTakeNumbers: [4, 2] })).toBe('23A/2,4')
    expect(formatTramlineLabel({ slateLabel: '217', printTakeNumbers: [], shotCode: 'CU' })).toBe('217 CU')
  })
})
