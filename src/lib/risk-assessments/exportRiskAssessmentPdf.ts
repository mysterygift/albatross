import { getDocumentById } from '@/lib/db/repositories/document'
import { getProductionById } from '@/lib/db/repositories/production'
import {
  buildSetGeneratedDocumentStatements,
  getRiskAssessment,
} from '@/lib/db/repositories/risk-assessments'
import { getShootDayById } from '@/lib/db/repositories/schedule'
import { listShootDayUnitsByShootDay } from '@/lib/db/repositories/shoot-day-units'
import { listUnitsByProduction } from '@/lib/db/repositories/units'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { hardDeleteDocument } from '@/lib/documents/hardDeleteDocument'
import { persistProductionDocument } from '@/lib/documents/persistDocument'
import { sanitizeForFilename } from '@/lib/files/sanitizeForFilename'
import { generateRiskAssessmentPdf } from '@/lib/pdf/riskAssessment'

export function formatShootDayLabel(day: { shoot_date: string; day_number: number | null }): string {
  return day.day_number != null ? `Day ${day.day_number} - ${day.shoot_date}` : day.shoot_date
}

export function riskAssessmentPdfFileName(shootDate: string, locationName: string): string {
  const loc = sanitizeForFilename(locationName.trim() || 'risk-assessment')
  return `rams-${shootDate}-${loc}.pdf`
}

export type RiskAssessmentPdfExport = {
  bytes: Uint8Array
  fileName: string
  documentId: string
}

/**
 * Renders a saved RAMS, stores it in Documents (entity = shoot day) and links it as the RAMS's
 * latest PDF. A previously exported PDF for the same RAMS is replaced, so there is one per RAMS.
 */
export async function exportRiskAssessmentPdf(riskAssessmentId: string): Promise<RiskAssessmentPdfExport> {
  const ra = await getRiskAssessment(riskAssessmentId)
  if (!ra) throw new Error('Risk assessment not found')
  const [production, day, dayUnits, units] = await Promise.all([
    getProductionById(ra.production_id),
    getShootDayById(ra.shoot_day_id),
    listShootDayUnitsByShootDay(ra.shoot_day_id),
    listUnitsByProduction(ra.production_id),
  ])
  if (!day) throw new Error('Shoot day not found')

  const unitNameById = new Map(units.map((u) => [u.id, u.name]))
  const unitNames = dayUnits
    .filter((sdu) => ra.shoot_day_unit_ids.includes(sdu.id))
    .map((sdu) => unitNameById.get(sdu.unit_id) ?? 'Unit')

  const bytes = new Uint8Array(
    await generateRiskAssessmentPdf({
      productionName: production?.name ?? '',
      shootDayLabel: formatShootDayLabel(day),
      unitNames,
      riskAssessment: ra,
    })
  )
  const fileName = riskAssessmentPdfFileName(day.shoot_date, ra.location_name)

  const previousId = ra.generated_document_id
  const documentId = crypto.randomUUID()
  await persistProductionDocument({
    productionId: ra.production_id,
    fileName,
    bytes,
    mimeType: 'application/pdf',
    entityType: DOCUMENT_ENTITY_TYPES.riskAssessment,
    entityId: ra.shoot_day_id,
    documentId,
    extraStatements: buildSetGeneratedDocumentStatements(ra.id, documentId, new Date().toISOString()),
  })
  if (previousId && previousId !== documentId && (await getDocumentById(previousId))) {
    await hardDeleteDocument(previousId)
  }
  return { bytes, fileName, documentId }
}
