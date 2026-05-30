import { describe, expect, it } from 'vitest'
import { getDefaultCrewHierarchyConfig } from '@/lib/people/crewHierarchyResolver'
import { getCallSheetCrewRequirements } from '@/lib/call-sheets/crewRequirements'
import { generateCallSheetPdf, type CallSheetData } from '@/lib/pdf/callSheet'
import { extractPdfText } from '@/test/episodicIntegrationHelpers'
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

  it('generates PDF when shot description wraps to many lines', async () => {
    const longDesc = Array(24).fill('description').join(' ')
    const shortBytes = await generateCallSheetPdf(
      minimalData({ schedule: [{ ...minimalData().schedule[0]!, shot_description: 'Wide' }] }),
    )
    const longBytes = await generateCallSheetPdf(
      minimalData({
        schedule: [{ ...minimalData().schedule[0]!, shot_description: longDesc }],
      }),
    )
    expect(longBytes.length).toBeGreaterThan(shortBytes.length)
  })

  it('renders safety information beneath weather in Environment & safety', async () => {
    const bytes = await generateCallSheetPdf(
      minimalData({
        weatherSummary: 'Sunny, 72°F',
        specialNotes: 'Hard hats required on set.',
        dayNotes: 'Day note after safety.',
      }),
    )
    const text = await extractPdfText(bytes)
    const forecastIdx = text.indexOf('Forecast')
    const safetyIdx = text.indexOf('Safety information')
    const dayNotesIdx = text.indexOf('Day notes')
    expect(forecastIdx).toBeGreaterThanOrEqual(0)
    expect(safetyIdx).toBeGreaterThan(forecastIdx)
    expect(dayNotesIdx).toBeGreaterThan(safetyIdx)
    expect(text).toMatch(/Hard hats required on set/)
  })

  it('grows Environment & safety section height for multi-line safety text', async () => {
    const singleLine = 'Wear hi-vis vests at all times.'
    const multiLine = Array(12).fill(singleLine).join('\n')
    const shortBytes = await generateCallSheetPdf(
      minimalData({ weatherSummary: 'Cloudy', specialNotes: singleLine }),
    )
    const longBytes = await generateCallSheetPdf(
      minimalData({ weatherSummary: 'Cloudy', specialNotes: multiLine }),
    )
    expect(longBytes.length).toBeGreaterThan(shortBytes.length)
  })
})
