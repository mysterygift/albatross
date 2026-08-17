import { describe, expect, it } from 'vitest'

import { generateCallSheetPdf, type CallSheetData } from '@/lib/pdf/callSheet'
import { generateMovementOrderPDF } from '@/lib/pdf/movementOrder'
import { extractPdfText } from '@/test/episodicIntegrationHelpers'

function minimalCallSheet(over: Partial<CallSheetData> = {}): CallSheetData {
  return {
    productionName: 'Privacy Boundary Production',
    shootDate: '2026-08-17',
    unitName: 'Main Unit',
    dayNumber: 3,
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
    schedule: [],
    castCalled: [],
    castCalledRows: [],
    crewGroups: [],
    locations: [],
    ...over,
  }
}

describe('operational PDF PII boundary', () => {
  it('intentionally renders authorized contact details and addresses on a call sheet', async () => {
    const bytes = await generateCallSheetPdf(
      minimalCallSheet({
        primaryContactsTop: [
          {
            department: 'Production Coordinator',
            name: 'Avery Coordinator',
            phone: '+44 7700 900111',
            email: 'avery@example.test',
            notes: null,
          },
        ],
        keyContacts: [
          {
            department: 'Locations',
            name: 'Casey Location',
            phone: '+44 7700 900222',
            email: 'casey@example.test',
            notes: null,
          },
        ],
        hospitalName: 'Private Hospital',
        hospitalAddress: '20 Care Road, London',
        parkingBaseAddress: '10 Crew Base Lane, London',
        locations: [
          {
            name: 'Private Residence',
            address: '12 Sensitive Street, London',
            what3words: 'private.contact.address',
            notes: null,
          },
        ],
      }),
    )

    const text = await extractPdfText(bytes)
    expect(text).toContain('Avery Coordinator')
    expect(text).toContain('+44 7700 900111')
    expect(text).toContain('avery@example.test')
    expect(text).toContain('Casey Location')
    expect(text).toContain('+44 7700 900222')
    expect(text).toContain('casey@example.test')
    expect(text).toContain('20 Care Road, London')
    expect(text).toContain('10 Crew Base Lane, London')
    expect(text).toContain('12 Sensitive Street, London')
  })

  it('intentionally renders authorized contact details and addresses on a movement order', async () => {
    const bytes = await generateMovementOrderPDF({
      productionName: 'Privacy Boundary Production',
      shootDate: '2026-08-17',
      dayNumber: 3,
      unitName: 'Main Unit',
      locations: [
        {
          id: 'location-1',
          name: 'Private Residence',
          address: '12 Sensitive Street, London',
          what3words: 'private.contact.address',
          parkingInfo: 'Use rear gate',
          lat: null,
          lng: null,
        },
      ],
      locationContacts: [
        {
          name: 'Casey Location',
          role: 'Location Manager',
          phone: '+44 7700 900222',
          email: 'casey@example.test',
        },
      ],
      movementLegs: [],
    })

    const text = await extractPdfText(bytes)
    expect(text).toContain('Private Residence')
    expect(text).toContain('12 Sensitive Street, London')
    expect(text).toContain('private.contact.address')
    expect(text).toContain('Casey Location')
    expect(text).toContain('+44 7700 900222')
    expect(text).toContain('casey@example.test')
  })
})
