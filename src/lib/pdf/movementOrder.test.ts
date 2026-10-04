import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { generateMovementOrderPDF } from '@/lib/pdf/movementOrder'
import { PAPER_SIZES, wrapLines } from '@/lib/pdf/layoutKit'
import type { MovementOrderData, MovementOrderMovementLeg } from '@/lib/movement-orders/types'
import { extractPdfText } from '@/test/episodicIntegrationHelpers'

const leg = (over: Partial<MovementOrderMovementLeg>): MovementOrderMovementLeg => ({
  key: 'k',
  fromLocationName: 'Unit base',
  toLocationName: 'Smith House',
  drivingTimeMinutes: 14,
  drivingDistanceText: '5.2 km',
  drivingDistanceMeters: 5200,
  walkingTimeMinutes: null,
  walkingDistanceText: null,
  writtenDirections: null,
  departTime: null,
  arriveTime: null,
  ...over,
})

function order(over: Partial<MovementOrderData> = {}): MovementOrderData {
  return {
    productionName: 'The Long Production Title',
    shootDate: '2026-10-14',
    dayNumber: 3,
    totalShootDays: 24,
    unitName: 'Main Unit',
    callTime: '07:30',
    wrapTime: '19:00',
    unitBaseTime: '06:30',
    unitBaseAddress: 'Mill Lane Car Park',
    revisionLabel: 'Draft 2',
    issuedAt: '2026-10-13T18:40:00',
    shootingBlocLabel: null,
    safety: {
      hospitalName: "St Mary's Hospital",
      hospitalAddress: 'Praed Street, London',
      policeStationName: null,
      policeStationAddress: null,
      notes: 'Hi-vis at all times.',
    },
    locations: [
      {
        id: 'a',
        name: 'Smith House',
        address: '12 Sensitive Street',
        what3words: 'one.two.three',
        parkingInfo: 'Rear gate',
        lat: null,
        lng: null,
        scenes: [
          { sceneNumber: '1', intExt: 'INT', dayNight: 'DAY' },
          { sceneNumber: '2', intExt: 'INT', dayNight: 'DAY' },
          { sceneNumber: '7', intExt: 'EXT', dayNight: 'NIGHT' },
        ],
      },
    ],
    locationContacts: [{ name: 'Casey Location', role: null, phone: null, email: null }],
    movementLegs: [
      leg({ key: '1', departTime: '07:00', arriveTime: '07:14', writtenDirections: 'Left onto Mill Lane' }),
      leg({ key: '2', fromLocationName: 'Smith House', toLocationName: 'Unit base', drivingTimeMinutes: 11, drivingDistanceText: '4.1 km', drivingDistanceMeters: 4100 }),
    ],
    ...over,
  }
}

describe('generateMovementOrderPDF', () => {
  it('prints the header strip, hand-entered journey times and numbered sections', async () => {
    const text = await extractPdfText(await generateMovementOrderPDF(order()))
    expect(text).toContain('MOVEMENT ORDER')
    expect(text).toContain('Draft 2 | Issued 13 Oct 2026 18:40')
    expect(text).toContain('Wednesday, 14 October 2026')
    expect(text).toContain('Day 3 of 24')
    expect(text).toContain('06:30')
    expect(text).toContain('Crew call 07:30 | Wrap (est.) 19:00')
    expect(text).toContain('2 stops')
    expect(text).toContain('Total drive 25 min | 9.3 km')
    expect(text).toContain('07:00')
    expect(text).toContain('07:14')
    expect(text).toContain('1 | Unit base to Smith House')
    expect(text).toContain('1, 2 | INT | Day; 7 | EXT | Night')
    expect(text).toContain('what3words: one.two.three')
    expect(text).toContain("St Mary's Hospital")
    expect(text).toContain('CONFIDENTIAL - DO NOT SHARE.')
    expect(text).toContain('Page 1 of 1')
    expect(text).not.toContain('·')
  })

  it('hides empty fields instead of printing filler text', async () => {
    const text = await extractPdfText(
      await generateMovementOrderPDF(
        order({
          unitBaseTime: null,
          callTime: null,
          wrapTime: null,
          revisionLabel: null,
          safety: { hospitalName: null, hospitalAddress: null, policeStationName: null, policeStationAddress: null, notes: null },
          locationContacts: [],
          movementLegs: [leg({ writtenDirections: null, drivingTimeMinutes: null, drivingDistanceText: null, drivingDistanceMeters: null })],
        })
      )
    )
    for (const filler of [
      'unavailable',
      'Unavailable',
      'No directions available',
      'Walking route unavailable',
      'Address not available',
      'Role unavailable',
      'Contacts',
      'Nearest A&E',
      'Safety',
      'Unit base opens',
    ]) {
      expect(text).not.toContain(filler)
    }
    expect(text).toContain('Issued ')
  })

  it('wraps long names and addresses instead of truncating them', async () => {
    const longName = 'The Extraordinarily Long Location Name That Would Previously Have Been Cut Off At Ninety Characters Wide'
    const longAddress = 'Unit 14, The Old Cannery Business Park, Some Very Long Industrial Estate Road, Greater Manchester, M1 2AB, United Kingdom'
    const bytes = await generateMovementOrderPDF(
      order({
        locations: [{ ...order().locations[0]!, name: longName, address: longAddress }],
        movementLegs: [leg({ toLocationName: longName })],
      })
    )
    const flat = (await extractPdfText(bytes)).replace(/\s+/g, ' ')
    expect(flat).toContain('Cut Off At Ninety Characters Wide')
    expect(flat).toContain('United Kingdom')
  })

  it('defaults to A4 and supports US Letter', async () => {
    const a4 = await PDFDocument.load(await generateMovementOrderPDF(order()))
    const size = a4.getPage(0).getSize()
    expect(size.width).toBeCloseTo(PAPER_SIZES.a4.width, 1)
    expect(size.height).toBeCloseTo(PAPER_SIZES.a4.height, 1)

    const letter = await PDFDocument.load(await generateMovementOrderPDF(order(), { paperSize: 'letter' }))
    expect(letter.getPage(0).getSize()).toEqual({ width: 612, height: 792 })
  })

  it('numbers pages and repeats the running header on continuation pages', async () => {
    const legs = Array.from({ length: 40 }, (_, i) =>
      leg({ key: `k${i}`, fromLocationName: `Stop ${i}`, toLocationName: `Stop ${i + 1}`, writtenDirections: 'Head north for a mile then turn left at the church.' })
    )
    const bytes = await generateMovementOrderPDF(order({ movementLegs: legs }))
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(1)
    const text = await extractPdfText(bytes)
    expect(text).toContain(`Page 2 of ${doc.getPageCount()}`)
    expect(text).toContain('MOVEMENT ORDER | Day 3 of 24 | Main Unit')
  })

  it('shows the shooting bloc for episodic productions', async () => {
    const text = await extractPdfText(await generateMovementOrderPDF(order({ shootingBlocLabel: 'Block A' })))
    expect(text).toContain('Unit: Main Unit | Shooting bloc: Block A')
  })
})

describe('wrapLines', () => {
  it('breaks a single overlong token rather than overflowing', async () => {
    const doc = await PDFDocument.create()
    const { StandardFonts } = await import('pdf-lib')
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const lines = wrapLines('A'.repeat(200), 100, font, 9)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(font.widthOfTextAtSize(line, 9)).toBeLessThanOrEqual(100)
    expect(lines.join('')).toBe('A'.repeat(200))
  })
})
