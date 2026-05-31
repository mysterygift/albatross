import { describe, expect, it } from 'vitest'
import {
  addPhases,
  formatPhaseLabel,
  parsePhases,
  phaseEquals,
  serializePhases,
  togglePresetPhase,
} from './productionPhases'

describe('productionPhases', () => {
  it('parses demo seed phase strings', () => {
    expect(parsePhases('prep,shoot,wrap,post')).toEqual(['prep', 'shoot', 'wrap', 'post'])
    expect(parsePhases('development,prep,shoot,wrap,post')).toEqual([
      'development',
      'prep',
      'shoot',
      'wrap',
      'post',
    ])
  })

  it('maps common aliases to preset keys', () => {
    expect(parsePhases('pre, production, principal photography')).toEqual(['prep', 'shoot'])
    expect(parsePhases('Pre-Production')).toEqual(['prep'])
  })

  it('preserves custom phases', () => {
    expect(parsePhases('shoot, principal photography review')).toEqual([
      'shoot',
      'principal photography review',
    ])
  })

  it('dedupes case-insensitively on parse', () => {
    expect(parsePhases('prep, Prep, PREP')).toEqual(['prep'])
  })

  it('serializes phases to comma-separated string', () => {
    expect(serializePhases(['prep', 'shoot', 'wrap'])).toBe('prep,shoot,wrap')
    expect(serializePhases([])).toBeNull()
  })

  it('round-trips legacy values', () => {
    const raw = 'development,prep,shoot,wrap,post'
    expect(serializePhases(parsePhases(raw))).toBe(raw)
  })

  it('formats preset and custom labels', () => {
    expect(formatPhaseLabel('prep')).toBe('Prep')
    expect(formatPhaseLabel('principal photography review')).toBe('Principal Photography Review')
  })

  it('adds phases without duplicates', () => {
    expect(addPhases(['prep'], ['shoot', 'prep', 'Shoot'])).toEqual(['prep', 'shoot'])
  })

  it('toggles preset phases', () => {
    expect(togglePresetPhase([], 'prep')).toEqual(['prep'])
    expect(togglePresetPhase(['prep', 'shoot'], 'prep')).toEqual(['shoot'])
  })

  it('compares phases case-insensitively for presets', () => {
    expect(phaseEquals('prep', 'Prep')).toBe(true)
    expect(phaseEquals('prep', 'shoot')).toBe(false)
  })
})
