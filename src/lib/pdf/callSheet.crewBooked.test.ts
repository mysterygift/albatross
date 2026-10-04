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

  it('renders weather in the header strip, then safety, then day notes', async () => {
    const bytes = await generateCallSheetPdf(
      minimalData({
        weatherSummary: 'Sunny, 72°F',
        specialNotes: 'Hard hats required on set.',
        dayNotes: 'Day note after safety.',
      }),
    )
    const text = await extractPdfText(bytes)
    const weatherIdx = text.indexOf('Sunny')
    const safetyIdx = text.indexOf('SAFETY')
    const dayNotesIdx = text.indexOf('DAY NOTES')
    expect(weatherIdx).toBeGreaterThanOrEqual(0)
    expect(safetyIdx).toBeGreaterThan(weatherIdx)
    expect(dayNotesIdx).toBeGreaterThan(safetyIdx)
    expect(text).toMatch(/Hard hats required on set/)
  })

  it('renders "Day X of Y", the crew call and page numbers on A4', async () => {
    const bytes = await generateCallSheetPdf(minimalData({ dayNumber: 3, totalDays: 24 }))
    const { PDFDocument } = await import('pdf-lib')
    const [page] = (await PDFDocument.load(bytes.slice())).getPages()
    const text = await extractPdfText(bytes)
    expect(text).toContain('Day 3 of 24')
    expect(text).toContain('CREW CALL')
    expect(text).toContain('07:00')
    expect(text).toMatch(/Page 1 of 1/)
    expect(Math.round(page!.getWidth())).toBe(595)
    expect(Math.round(page!.getHeight())).toBe(842)
  })

  it('supports US Letter and uses | rather than dot separators', async () => {
    const bytes = await generateCallSheetPdf(
      minimalData({ paperSize: 'Letter', shootingBlocMastheadLabel: 'Block A' }),
    )
    const { PDFDocument } = await import('pdf-lib')
    const [page] = (await PDFDocument.load(bytes.slice())).getPages()
    const text = await extractPdfText(bytes)
    expect(text).toContain('Unit: Main | Shooting bloc: Block A')
    expect(text).not.toContain('\u00b7')
    expect(Math.round(page!.getWidth())).toBe(612)
  })

  it('wraps rather than truncates long cast notes and rows paginate', async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({
      person_id: `c${i}`,
      cast_number: String(i + 1),
      name: `Cast Member ${i + 1}`,
      phone: null,
      email: null,
      agent_name: null,
      agent_email: null,
      agent_phone: null,
      source: 'shot' as const,
      booking_notes: 'ENDMARKER',
    }))
    const bytes = await generateCallSheetPdf(minimalData({ castCalledRows: rows }))
    const text = await extractPdfText(bytes)
    expect(text).toContain('Cast Member 80')
    expect(text).toMatch(/Page 2 of \d+/)
  })

  it('grows the safety box for multi-line safety text', async () => {
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
