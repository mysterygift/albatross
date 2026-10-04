import { describe, expect, it } from 'vitest'

import {
  formatSlateLabel,
  formatTramlineLabel,
  nextConsecutiveSlateNumber,
  nextTakeNumber,
  normaliseSlatePrefix,
} from './slateNumbering'

describe('slate numbering (UK consecutive)', () => {
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

  it('formats tramline labels with print takes and shot code', () => {
    expect(
      formatTramlineLabel({ prefix: '', slateNumber: 67, printTakeNumbers: [4], shotCode: 'MS', description: 'Elena' })
    ).toBe('67/4 MS Elena')
    expect(formatTramlineLabel({ prefix: 'X', slateNumber: 9, printTakeNumbers: [4, 2] })).toBe('X9/2,4')
    expect(formatTramlineLabel({ prefix: '', slateNumber: 217, printTakeNumbers: [], shotCode: 'CU' })).toBe('217 CU')
  })
})
