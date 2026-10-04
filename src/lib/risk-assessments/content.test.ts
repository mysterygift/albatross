import { describe, expect, it } from 'vitest'
import {
  blankHazard,
  parseFirstAiders,
  riskAssessmentContentSignature,
  serializeFirstAiders,
  splitLines,
  type RiskAssessmentContent,
} from '@/lib/risk-assessments/content'

function base(over: Partial<RiskAssessmentContent> = {}): RiskAssessmentContent {
  return {
    shoot_day_id: 'day-1',
    shoot_day_unit_ids: ['a', 'b'],
    location_id: null,
    location_name: 'Warehouse',
    activities: 'Stunt rigging',
    responsible_person_id: null,
    responsible_person_name: 'Sam',
    first_aiders: [],
    hospital_name: '',
    hospital_address: '',
    hospital_phone: '',
    police_name: '',
    police_address: '',
    police_phone: '',
    hazards: [blankHazard()],
    ...over,
  }
}

describe('first aiders', () => {
  it('round-trips and drops blank rows', () => {
    const json = serializeFirstAiders([
      { name: ' Ann ', phone: '123', email: '' },
      { name: '', phone: '', email: '' },
    ])
    expect(parseFirstAiders(json)).toEqual([{ name: 'Ann', phone: '123', email: '' }])
    expect(serializeFirstAiders([])).toBeNull()
  })

  it('tolerates bad json', () => {
    expect(parseFirstAiders('not json')).toEqual([])
    expect(parseFirstAiders(null)).toEqual([])
    expect(parseFirstAiders('{"a":1}')).toEqual([])
  })
})

describe('riskAssessmentContentSignature', () => {
  it('ignores unit order, whitespace and blank first-aider rows', () => {
    const a = riskAssessmentContentSignature(base())
    const b = riskAssessmentContentSignature(
      base({
        shoot_day_unit_ids: ['b', 'a'],
        activities: '  Stunt rigging ',
        first_aiders: [{ name: '', phone: '', email: '' }],
      })
    )
    expect(a).toBe(b)
  })

  it('detects content changes', () => {
    const a = riskAssessmentContentSignature(base())
    expect(riskAssessmentContentSignature(base({ activities: 'Other' }))).not.toBe(a)
    expect(riskAssessmentContentSignature(base({ shoot_day_unit_ids: ['a'] }))).not.toBe(a)
    expect(
      riskAssessmentContentSignature(base({ hazards: [{ ...blankHazard(), severity_after: 4 }] }))
    ).not.toBe(a)
  })
})

describe('splitLines', () => {
  it('strips bullets and blanks', () => {
    expect(splitLines('- one\n\n• two\r\n  three ')).toEqual(['one', 'two', 'three'])
  })
})
