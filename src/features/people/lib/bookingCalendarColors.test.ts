import { describe, expect, it } from 'vitest'
import {
  DEPARTMENT_PALETTE,
  getContrastText,
  getDefaultColorConfig,
  getDepartmentNames,
  mergeConfigWithDefaults,
  nextPrincipalColor,
  resolvePersonColor,
  type BookingColorConfig,
} from './bookingCalendarColors'
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

describe('getDepartmentNames', () => {
  it('returns sorted unique non-empty departments', () => {
    const people = [
      person('a', { department: 'Camera' }),
      person('b', { department: 'Art' }),
      person('c', { department: 'Camera' }),
      person('d', { department: '  ' }),
    ]
    expect(getDepartmentNames(people)).toEqual(['Art', 'Camera'])
  })
})

describe('getDefaultColorConfig', () => {
  it('assigns palette colors deterministically by sorted department', () => {
    const people = [person('a', { department: 'Camera' }), person('b', { department: 'Art' })]
    const config = getDefaultColorConfig(people)
    expect(config.departmentColors['Art']).toBe(DEPARTMENT_PALETTE[0])
    expect(config.departmentColors['Camera']).toBe(DEPARTMENT_PALETTE[1])
  })
})

describe('mergeConfigWithDefaults', () => {
  it('adds colors for new departments and preserves existing choices', () => {
    const base: BookingColorConfig = {
      departmentColors: { Camera: '#123456' },
      principalCastColors: {},
      supportingCastColor: '#000000',
      crewFallbackColor: '#111111',
    }
    const merged = mergeConfigWithDefaults(base, [
      person('a', { department: 'Camera' }),
      person('b', { department: 'Sound' }),
    ])
    expect(merged.departmentColors['Camera']).toBe('#123456')
    expect(merged.departmentColors['Sound']).toBeDefined()
    expect(merged.departmentColors['Sound']).not.toBe('#123456')
  })

  it('drops principal colors for people no longer present', () => {
    const base: BookingColorConfig = {
      departmentColors: {},
      principalCastColors: { gone: '#abcdef', keep: '#fedcba' },
      supportingCastColor: '#000000',
      crewFallbackColor: '#111111',
    }
    const merged = mergeConfigWithDefaults(base, [person('keep', { is_cast: 1 })])
    expect(merged.principalCastColors).toEqual({ keep: '#fedcba' })
  })
})

describe('resolvePersonColor', () => {
  const config: BookingColorConfig = {
    departmentColors: { Camera: '#aaaaaa' },
    principalCastColors: { star: '#ff00ff' },
    supportingCastColor: '#cccccc',
    crewFallbackColor: '#222222',
  }

  it('colors principal cast individually', () => {
    expect(resolvePersonColor(person('star', { is_cast: 1 }), config)).toBe('#ff00ff')
  })
  it('colors other cast with the shared supporting color', () => {
    expect(resolvePersonColor(person('extra', { is_cast: 1 }), config)).toBe('#cccccc')
  })
  it('colors crew by department', () => {
    expect(resolvePersonColor(person('cam', { department: 'Camera' }), config)).toBe('#aaaaaa')
  })
  it('falls back for crew without a mapped department', () => {
    expect(resolvePersonColor(person('grip', { department: 'Grip' }), config)).toBe('#222222')
  })
})

describe('nextPrincipalColor', () => {
  it('returns an unused principal palette color', () => {
    const config = getDefaultColorConfig([])
    const first = nextPrincipalColor(config)
    config.principalCastColors['a'] = first
    const second = nextPrincipalColor(config)
    expect(second).not.toBe(first)
  })
})

describe('getContrastText', () => {
  it('uses light text on dark backgrounds', () => {
    expect(getContrastText('#2563eb')).toBe('#ffffff')
  })
  it('uses dark text on light backgrounds', () => {
    expect(getContrastText('#fde047')).toBe('#0b0f19')
  })
})
