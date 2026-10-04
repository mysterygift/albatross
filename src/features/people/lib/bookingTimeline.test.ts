import { describe, expect, it } from 'vitest'
import { buildTimelineGroups, getMonthTimelineSegment, personInitials } from './bookingTimeline'
import { getDefaultColorConfig } from './bookingCalendarColors'
import type { Person } from '@/lib/db/types'

function person(id: string, opts: Partial<Person> = {}): Person {
  return {
    id,
    production_id: 'p1',
    name: id,
    is_cast: 0,
    email: null,
    phone: null,
    department: null,
    phases: null,
    notes: null,
    contributor_form_status: 'not_requested',
    cast_number: null,
    agent_name: null,
    agent_email: null,
    agent_phone: null,
    role_name: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...opts,
  }
}

describe('getMonthTimelineSegment', () => {
  it('maps a span inside the month to day numbers', () => {
    expect(getMonthTimelineSegment({ startDate: '2026-10-05', endDate: '2026-10-09' }, 2026, 9)).toEqual({
      startDay: 5,
      endDay: 9,
      continuesLeft: false,
      continuesRight: false,
    })
  })

  it('clamps spans that cross month boundaries', () => {
    expect(getMonthTimelineSegment({ startDate: '2026-09-28', endDate: '2026-11-03' }, 2026, 9)).toEqual({
      startDay: 1,
      endDay: 31,
      continuesLeft: true,
      continuesRight: true,
    })
  })

  it('returns null when the span misses the month', () => {
    expect(getMonthTimelineSegment({ startDate: '2026-11-03', endDate: '2026-11-04' }, 2026, 9)).toBeNull()
  })
})

describe('buildTimelineGroups', () => {
  const people = [
    person('maya', { is_cast: 1, name: 'Maya', cast_number: '1' }),
    person('lena', { is_cast: 1, name: 'Lena' }),
    person('rafi', { name: 'Rafi', department: 'Camera' }),
    person('ana', { name: 'Ana', department: 'Camera' }),
    person('jo', { name: 'Jo', department: 'Art' }),
    person('nia', { name: 'Nia' }),
  ]

  it('orders principal cast, supporting cast, departments, then other crew', () => {
    const config = { ...getDefaultColorConfig(people), principalCastColors: { maya: '#7c3aed' } }
    const groups = buildTimelineGroups(people, config)
    expect(groups.map((g) => g.label)).toEqual(['Principal cast', 'Supporting cast', 'Art', 'Camera', 'Other crew'])
    expect(groups[3].people.map((p) => p.name)).toEqual(['Ana', 'Rafi'])
  })

  it('omits empty groups', () => {
    const groups = buildTimelineGroups([person('jo', { department: 'Art' })], getDefaultColorConfig([]))
    expect(groups.map((g) => g.label)).toEqual(['Art'])
  })
})

describe('personInitials', () => {
  it('takes up to two initials', () => {
    expect(personInitials('Hye-jin Park')).toBe('HP')
    expect(personInitials('Maya')).toBe('M')
  })
})
