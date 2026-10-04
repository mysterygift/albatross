import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { generateRiskAssessmentPdf } from '@/lib/pdf/riskAssessment'
import type { RiskAssessmentFull } from '@/lib/db/repositories/risk-assessments'
import { BUILT_IN_HAZARDS } from '@/lib/risk-assessments/builtInHazards'
import { blankHazard } from '@/lib/risk-assessments/content'

function hazard(over: Partial<ReturnType<typeof blankHazard>> = {}, i = 0) {
  return {
    ...blankHazard(),
    ...over,
    id: `h${i}`,
    risk_assessment_id: 'ra-1',
    sort_order: i,
    created_at: 't',
    updated_at: 't',
    deleted_at: null,
  }
}

function ra(over: Partial<RiskAssessmentFull> = {}): RiskAssessmentFull {
  return {
    id: 'ra-1',
    production_id: 'p1',
    shoot_day_id: 'd1',
    location_id: null,
    location_name: 'Warehouse, Unit 4',
    activities: 'Stunt rigging and a vehicle chase.',
    responsible_person_id: null,
    responsible_person_name: 'Sam Safety',
    first_aiders_json: null,
    first_aiders: [{ name: 'Ann Aid', phone: '07700 900123', email: 'ann@example.com' }],
    hospital_name: 'City Hospital',
    hospital_address: '1 Hospital Road',
    hospital_phone: '020 7946 0000',
    police_name: null,
    police_address: null,
    police_phone: null,
    status: 'draft',
    approved_by: null,
    approved_at: null,
    generated_document_id: null,
    created_at: 't',
    updated_at: 't',
    deleted_at: null,
    shoot_day_unit_ids: ['u1'],
    hazards: [hazard({ ...BUILT_IN_HAZARDS[0]! }, 0)],
    ...over,
  }
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount()
}

describe('generateRiskAssessmentPdf', () => {
  it('produces a landscape A4 PDF for a draft RAMS', async () => {
    const bytes = await generateRiskAssessmentPdf({
      productionName: 'Test Production',
      shootDayLabel: 'Day 4 - 2026-06-09',
      unitNames: ['Main Unit', 'Second Unit'],
      riskAssessment: ra(),
    })
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe('%PDF')
    const loaded = await PDFDocument.load(bytes)
    const { width, height } = loaded.getPage(0).getSize()
    expect(width).toBeGreaterThan(height)
    expect(Math.round(width)).toBe(842)
  })

  it('renders an approved RAMS, no hazards, and empty contacts without throwing', async () => {
    const bytes = await generateRiskAssessmentPdf({
      productionName: 'Test Production',
      shootDayLabel: 'Day 4',
      unitNames: [],
      riskAssessment: ra({
        status: 'approved',
        approved_by: 'Boss',
        approved_at: '2026-06-01T10:00:00.000Z',
        first_aiders: [],
        hazards: [],
      }),
    })
    expect(await pageCount(bytes)).toBe(1)
  })

  it('paginates many hazards and very long text, and tolerates unsupported characters', async () => {
    const long = Array.from({ length: 60 }, (_, i) => `Control measure number ${i} with some words to wrap`).join('\n')
    const hazards = Array.from({ length: 8 }, (_, i) =>
      hazard(
        {
          name: `Hazard ${i} — “quoted” \u{1F525}`,
          description: 'x'.repeat(400),
          control_measures: i === 3 ? long : 'Short',
          severity_before: ((i % 5) + 1),
          probability_before: (((i + 2) % 5) + 1),
        },
        i
      )
    )
    const bytes = await generateRiskAssessmentPdf({
      productionName: 'Test Production',
      shootDayLabel: 'Day 4',
      unitNames: ['Main Unit'],
      riskAssessment: ra({ hazards }),
    })
    expect(await pageCount(bytes)).toBeGreaterThan(2)
  })
})
