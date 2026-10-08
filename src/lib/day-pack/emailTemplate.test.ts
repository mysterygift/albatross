import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DAY_PACK_BODY,
  DEFAULT_DAY_PACK_SUBJECT,
  dayPackTemplateVars,
  renderDayPackTemplate,
} from '@/lib/day-pack/emailTemplate'

const vars = dayPackTemplateVars({
  fullName: '  Ada  Lovelace ',
  productionName: 'The Albatross',
  shootDate: '2026-10-14',
  dayNumber: 3,
  unitName: 'Second Unit',
})

describe('day pack email template', () => {
  it('fills the default subject and body', () => {
    expect(renderDayPackTemplate(DEFAULT_DAY_PACK_SUBJECT, vars)).toBe(
      'The Albatross – Call sheet & docs – Day 3, Wednesday, 14 October 2026 (Second Unit)'
    )
    const body = renderDayPackTemplate(DEFAULT_DAY_PACK_BODY, vars)
    expect(body.startsWith('Hi Ada,\n\n')).toBe(true)
    expect(body).toContain(
      'here is the call sheet + relevant docs for the shoot for The Albatross on Wednesday, 14 October 2026'.replace('here', 'Here')
    )
    expect(body).toContain('if you have any questions please get in touch')
  })

  it('leaves unknown placeholders alone', () => {
    expect(renderDayPackTemplate('{name} {nope} {', vars)).toBe('Ada Lovelace {nope} {')
  })

  it('falls back when the day has no number', () => {
    expect(dayPackTemplateVars({ fullName: 'Cher', productionName: 'P', shootDate: 'x', dayNumber: null, unitName: 'U' })).toMatchObject({
      firstName: 'Cher',
      day: 'Shoot day',
      date: 'x',
    })
  })
})
