import { describe, expect, it } from 'vitest'
import { getDefaultCrewHierarchyConfig } from '@/lib/people/crewHierarchyResolver'
import { getCallSheetCrewRequirements } from '@/lib/call-sheets/crewRequirements'
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
})
