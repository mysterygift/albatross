import { describe, expect, it } from 'vitest'
import { BUILT_IN_HAZARDS, getBuiltInHazard } from '@/lib/risk-assessments/builtInHazards'
import { isValidRating } from '@/lib/risk-assessments/riskMatrix'

describe('BUILT_IN_HAZARDS', () => {
  it('has unique keys and names', () => {
    expect(new Set(BUILT_IN_HAZARDS.map((h) => h.key)).size).toBe(BUILT_IN_HAZARDS.length)
    expect(new Set(BUILT_IN_HAZARDS.map((h) => h.name)).size).toBe(BUILT_IN_HAZARDS.length)
  })

  it('has valid ratings, content and at least one group at risk', () => {
    for (const h of BUILT_IN_HAZARDS) {
      for (const r of [h.severity_before, h.probability_before, h.severity_after, h.probability_after]) {
        expect(isValidRating(r), h.key).toBe(true)
      }
      expect(h.name.trim(), h.key).not.toBe('')
      expect(h.risks.trim(), h.key).not.toBe('')
      expect(h.control_measures.trim(), h.key).not.toBe('')
      expect(h.at_risk_crew + h.at_risk_cast + h.at_risk_public, h.key).toBeGreaterThan(0)
    }
  })

  it('never rates a hazard worse after controls', () => {
    for (const h of BUILT_IN_HAZARDS) {
      expect(h.severity_after * h.probability_after, h.key).toBeLessThanOrEqual(
        h.severity_before * h.probability_before
      )
    }
  })

  it('looks up by key', () => {
    expect(getBuiltInHazard('stunts')?.severity_before).toBe(5)
    expect(getBuiltInHazard('vehicles')?.severity_before).toBe(5)
    expect(getBuiltInHazard('nope')).toBeUndefined()
  })
})
