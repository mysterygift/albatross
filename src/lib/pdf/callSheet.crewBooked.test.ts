import { describe, expect, it } from 'vitest'
import { getDefaultCrewHierarchyConfig } from '@/lib/people/crewHierarchyResolver'
import { getCallSheetCrewRequirements } from '@/lib/call-sheets/crewRequirements'
import { generateCallSheetPdf, type CallSheetData } from '@/lib/pdf/callSheet'
import type { Person } from '@/lib/db/types'

function minimalData(over: Partial<CallSheetData> = {}): CallSheetData {
  return {
    productionName: 'Test Prod',
    shootDate: '2025-06-01',
    unitName: 'Main',
    dayNumber: 1,
    callTime: '07:00',
    wrapTime: null,
    dayNotes: null,
    unitNotes: null,
    keyContacts: [],
    hospitalName: null,
    hospitalAddress: null,
    policeStationName: null,
    policeStationAddress: null,
    weatherSummary: null,
    weatherSunrise: null,
    weatherSunset: null,
    parkingBaseAddress: null,
    mealTimes: [],
    specialNotes: null,
    schedule: [
      {
        strip_type: 'SHOT',
        scene_number: '1',
        shot_number: '1',
        scene_title: 'Kitchen',
        shot_description: 'Wide',
        int_ext: 'INT',
        day_night: 'DAY',
      },
    ],
    castCalled: [],
    castCalledRows: [],
    crewGroups: [],
    locations: [],
    ...over,
  }
}

describe('generateCallSheetPdf with booked crew', () => {
  it('generates PDF when crew groups are present', async () => {
    const hierarchy = getDefaultCrewHierarchyConfig()
    const crew: Person[] = [
      {
        id: 'crew-1',
        production_id: 'p1',
        name: '\u202dAlex Producer',
        is_cast: 0,
        email: null,
        phone: '555-0100',
        department: 'Production',
        phases: null,
        notes: null,
        contributor_form_status: null,
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
    const bookings = [{ person_id: 'crew-1' }]
    const crewGroups = getCallSheetCrewRequirements(hierarchy, bookings, crew)
    expect(crewGroups.length).toBeGreaterThan(0)

    const bytes = await generateCallSheetPdf(
      minimalData({
        crewGroups,
        castCalledRows: [
          {
            person_id: 'cast-1',
            cast_number: '1',
            name: 'Pat Cast',
            phone: null,
            email: null,
            agent_name: null,
            agent_email: null,
            agent_phone: null,
            source: 'shot',
            booking_schedule_line: '7–18',
          },
        ],
      }),
    )
    expect(bytes.length).toBeGreaterThan(1000)
  })
})
