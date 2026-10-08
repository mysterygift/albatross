import { describe, expect, it } from 'vitest'
import { getDefaultCrewHierarchyConfig } from '@/lib/people/crewHierarchyResolver'
import { bookingsForShootDayUnit, getCallSheetCrewRequirements } from '@/lib/call-sheets/crewRequirements'
import type { Person } from '@/lib/db/types'

describe('getCallSheetCrewRequirements', () => {
  it('excludes cast (is_cast=1) even when booked', () => {
    const hierarchy = getDefaultCrewHierarchyConfig()
    const crew: Person[] = [
      {
        id: 'cast-1',
        production_id: 'p1',
        name: 'Actor One',
        is_cast: 1,
        email: null,
        phone: null,
        department: 'Cast',
        phases: null,
        notes: null,
        contributor_form_status: 'not_requested',
        cast_number: '1',
        agent_name: null,
        agent_email: null,
        agent_phone: null,
        role_name: null,
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      },
      {
        id: 'crew-1',
        production_id: 'p1',
        name: 'Alex Producer',
        is_cast: 0,
        email: null,
        phone: null,
        department: 'Production',
        phases: null,
        notes: null,
        contributor_form_status: 'not_requested',
        cast_number: null,
        agent_name: null,
        agent_email: null,
        agent_phone: null,
        role_name: 'Producer',
        created_at: 't',
        updated_at: 't',
        deleted_at: null,
      },
    ]
    const groups = getCallSheetCrewRequirements(
      hierarchy,
      [{ person_id: 'cast-1' }, { person_id: 'crew-1' }],
      crew,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]?.rows[0]?.person_id).toBe('crew-1')
  })

  it('keeps crew booked to the unit or to the whole day, and drops crew booked to another unit', () => {
    const hierarchy = getDefaultCrewHierarchyConfig()
    const person = (id: string, name: string): Person => ({
      id,
      production_id: 'p1',
      name,
      is_cast: 0,
      email: null,
      phone: null,
      department: 'Camera',
      phases: null,
      notes: null,
      contributor_form_status: 'not_requested',
      cast_number: null,
      agent_name: null,
      agent_email: null,
      agent_phone: null,
      role_name: null,
      created_at: 't',
      updated_at: 't',
      deleted_at: null,
    })
    const crew = [person('a', 'All Day'), person('m', 'Main Only'), person('s', 'Second Only')]
    const bookings = [
      { person_id: 'a', shoot_day_unit_id: null },
      { person_id: 'm', shoot_day_unit_id: 'sdu-main' },
      { person_id: 's', shoot_day_unit_id: 'sdu-second' },
    ]
    const names = (unit?: string | null) =>
      getCallSheetCrewRequirements(hierarchy, bookings, crew, unit)
        .flatMap((g) => g.rows.map((r) => r.name))
        .sort()

    expect(names('sdu-main')).toEqual(['All Day', 'Main Only'])
    expect(names('sdu-second')).toEqual(['All Day', 'Second Only'])
    expect(names('sdu-third')).toEqual(['All Day'])
    // No unit: the whole day, as before.
    expect(names()).toEqual(['All Day', 'Main Only', 'Second Only'])
  })

  it('bookingsForShootDayUnit treats a missing unit field as the whole day', () => {
    const bookings: { person_id: string; shoot_day_unit_id?: string | null }[] = [{ person_id: 'x' }]
    expect(bookingsForShootDayUnit(bookings, 'sdu-1')).toHaveLength(1)
  })
})
