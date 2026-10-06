import { describe, expect, it } from 'vitest'
import {
  buildSectionCodes,
  deriveSectionStatus,
  sectionStatusLabel,
  sectionStatusSteps,
  type SectionShotProgress,
} from './scriptSectionStatus'

const D4 = { id: 'd4', dayNumber: 4, shootDate: '2026-10-02' }
const D6 = { id: 'd6', dayNumber: 6, shootDate: '2026-10-08' }

function shot(over: Partial<SectionShotProgress> = {}): SectionShotProgress {
  return { shotId: 's', shotNumber: '12A', shootDays: [], printedTakes: [], sceneComplete: false, ...over }
}

describe('deriveSectionStatus', () => {
  it('is No coverage with no linked shots', () => {
    expect(deriveSectionStatus({ cut: false, shots: [] })).toBe('no_coverage')
  })

  it('is Covered until every linked shot is on a shoot day', () => {
    expect(deriveSectionStatus({ cut: false, shots: [shot({ shootDays: [D6] }), shot()] })).toBe('covered')
  })

  it('is Scheduled once every linked shot is on a shoot day', () => {
    expect(deriveSectionStatus({ cut: false, shots: [shot({ shootDays: [D6] }), shot({ shootDays: [D4] })] })).toBe(
      'scheduled'
    )
  })

  it('is Shot once every linked shot is confirmed by the script supervisor', () => {
    expect(
      deriveSectionStatus({
        cut: false,
        shots: [shot({ shootDays: [D4], printedTakes: ['Slate 41 T3'] }), shot({ sceneComplete: true })],
      })
    ).toBe('shot')
  })

  it('stays Scheduled while only some shots are confirmed', () => {
    expect(
      deriveSectionStatus({ cut: false, shots: [shot({ shootDays: [D4], printedTakes: ['Slate 41 T3'] }), shot({ shootDays: [D6] })] })
    ).toBe('scheduled')
  })

  it('is Cut regardless of shots', () => {
    expect(deriveSectionStatus({ cut: true, shots: [shot({ printedTakes: ['Slate 1 T1'] })] })).toBe('cut')
  })
})

describe('labels and steps', () => {
  it('names the shoot day on scheduled and shot sections', () => {
    expect(sectionStatusLabel('scheduled', [shot({ shootDays: [D6] })])).toBe('Scheduled · Day 6')
    expect(sectionStatusLabel('covered', [shot(), shot()])).toBe('Covered · 2 shots')
    expect(sectionStatusLabel('no_coverage', [])).toBe('No coverage')
  })

  it('reports partial progress per step', () => {
    const steps = sectionStatusSteps([shot({ shotNumber: '12D', shootDays: [D6] }), shot({ shotNumber: '12E' })])
    expect(steps.map((s) => s.state)).toEqual(['done', 'partial', 'todo'])
    expect(steps[1]!.detail).toBe('1 of 2 on a shoot day. 12E not scheduled.')
  })
})

describe('buildSectionCodes', () => {
  it('numbers sections per scene in script order', () => {
    const sections = [
      { id: 'late', scene_id: 's12', script_version_id: 'v', created_at: '1' },
      { id: 'early', scene_id: 's12', script_version_id: 'v', created_at: '2' },
      { id: 'other', scene_id: 's13', script_version_id: 'v', created_at: '3' },
      { id: 'norange', scene_id: 's12', script_version_id: 'v', created_at: '0' },
    ]
    const ranges = new Map([
      ['late', { start_page: '15', start_eighth: 1, start_offset: 10 }],
      ['early', { start_page: '14', start_eighth: 6, start_offset: 300 }],
      ['other', { start_page: '15', start_eighth: 4, start_offset: 0 }],
    ])
    const codes = buildSectionCodes(sections, ranges, new Map([['s12', '12'], ['s13', '13']]))
    expect(codes.get('early')).toBe('12.1')
    expect(codes.get('late')).toBe('12.2')
    expect(codes.get('norange')).toBe('12.3')
    expect(codes.get('other')).toBe('13.1')
  })
})
