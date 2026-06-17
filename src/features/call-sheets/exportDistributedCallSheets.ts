import type { CallSheetData } from '@/lib/pdf/callSheet'
import { generateCallSheetPdf } from '@/lib/pdf/callSheet'
import type { CallSheetRecipient } from '@/features/call-sheets/CallSheetDistributionDialog'
import { sanitizeForFilename } from '@/lib/files/sanitizeForFilename'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import {
  persistPersonalizedDocuments,
  personIdFromRecipient,
} from '@/lib/documents/persistPersonalizedDocuments'

export interface ExportDistributedCallSheetsOptions {
  productionId: string
  shootDayId: string
  baseData: CallSheetData
  recipients: CallSheetRecipient[]
  /** Called as each file is about to be written (1-based index, total count). */
  onProgress?: (current: number, total: number) => void
}

/**
 * Generate a base call sheet PDF once, persist personalised copies to Documents,
 * then optionally export copies to a user-selected directory.
 */
export async function exportDistributedCallSheets(
  options: ExportDistributedCallSheetsOptions
): Promise<{ persisted: number; exported: number; directoryPath: string | null } | null> {
  const { productionId, baseData, recipients, onProgress } = options
  if (!recipients.length) return null

  let baseBytes: Uint8Array
  try {
    baseBytes = new Uint8Array(await generateCallSheetPdf(baseData))
  } catch {
    throw new Error('Failed to generate call sheet PDF. Please try again.')
  }

  if (!baseBytes?.length) {
    throw new Error('Failed to generate base PDF.')
  }

  return persistPersonalizedDocuments({
    productionId,
    entityType: DOCUMENT_ENTITY_TYPES.callSheetPersonalized,
    basePDFBytes: baseBytes,
    recipients,
    resolveEntityId: personIdFromRecipient,
    buildFileName: (recipient) => {
      const safeName = sanitizeForFilename(recipient.fullName)
      const safeUnit = sanitizeForFilename(baseData.unitName || 'unit')
      return `call-sheet-${baseData.shootDate}-${safeUnit}-${safeName}.pdf`
    },
    directoryPickerTitle: 'Select directory for personalised call sheet copies',
    onProgress,
  })
}
