import { describe, expect, it } from 'vitest'
import {
  RISK_BAND_COLORS,
  RISK_SCALE,
  clampRating,
  formatRiskFactor,
  riskBand,
  riskBandForRating,
  riskFactor,
  type RiskBand,
} from '@/lib/risk-assessments/riskMatrix'
import { BUILT_IN_HAZARDS } from '@/lib/risk-assessments/builtInHazards'

/** Expected band per [probability][severity] cell, written out like the reference matrix. */
const T: RiskBand = 'tolerable'
const M: RiskBand = 'moderate'
const S: RiskBand = 'severe'
const EXPECTED: Record<number, RiskBand[]> = {
  // severity:  1  2  3  4  5
  5: [T, M, S, S, S],
  4: [T, M, S, S, S],
  3: [T, T, M, S, S],
  2: [T, T, T, M, M],
  1: [T, T, T, T, T],
}

describe('riskMatrix', () => {
  it('computes factor = severity x probability', () => {
    expect(riskFactor(4, 3)).toBe(12)
    expect(riskFactor(2, 2)).toBe(4)
  })

  it('bands all 25 cells', () => {
    for (const p of RISK_SCALE) {
      for (const s of RISK_SCALE) {
        const expected = EXPECTED[p]![s - 1]!
        expect(riskBandForRating(s, p), `severity ${s} x probability ${p}`).toBe(expected)
      }
    }
  })

  it('bands by factor boundaries (1-6 / 8-10 / 12-25, 9 is amber)', () => {
    for (const f of [1, 2, 3, 4, 5, 6]) expect(riskBand(f)).toBe('tolerable')
    for (const f of [8, 9, 10]) expect(riskBand(f)).toBe('moderate')
    for (const f of [12, 15, 16, 20, 25]) expect(riskBand(f)).toBe('severe')
  })

  it('formats a factor with a vertical bar', () => {
    expect(formatRiskFactor(12)).toBe('12 | Severe')
    expect(formatRiskFactor(9)).toBe('9 | Moderate')
    expect(formatRiskFactor(4)).toBe('4 | Tolerable')
  })

  it('uses the fixed band colours', () => {
    expect(RISK_BAND_COLORS.tolerable).toMatchObject({ bg: '#1FA34A', fg: '#FFFFFF' })
    expect(RISK_BAND_COLORS.moderate).toMatchObject({ bg: '#FFB400', fg: '#2B1B00' })
    expect(RISK_BAND_COLORS.severe).toMatchObject({ bg: '#E02B20', fg: '#FFFFFF' })
  })

  it('clamps ratings into 1-5', () => {
    expect(clampRating(0)).toBe(1)
    expect(clampRating(9)).toBe(5)
    expect(clampRating('3')).toBe(3)
    expect(clampRating('x', 2)).toBe(2)
  })

  it('Manual Handling built-in is red before and green after', () => {
    const mh = BUILT_IN_HAZARDS.find((h) => h.key === 'manual-handling')!
    expect(riskFactor(mh.severity_before, mh.probability_before)).toBe(12)
    expect(riskBandForRating(mh.severity_before, mh.probability_before)).toBe('severe')
    expect(riskFactor(mh.severity_after, mh.probability_after)).toBe(4)
    expect(riskBandForRating(mh.severity_after, mh.probability_after)).toBe('tolerable')
    expect(mh.risks.split('\n')).toHaveLength(2)
    expect(mh.control_measures.split('\n')).toHaveLength(6)
    expect(mh.at_risk_crew).toBe(1)
  })
})
