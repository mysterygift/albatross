import type { CallSheetData } from '@/lib/pdf/callSheet'
import { generateCallSheetPdf } from '@/lib/pdf/callSheet'
import type { CallSheetRecipient } from '@/features/call-sheets/CallSheetDistributionDialog'
import { pickExportDirectory } from '@/lib/files/directories'
import { sanitizeForFilename } from '@/lib/files/sanitizeForFilename'
import { exportPersonalizedDocuments } from '@/lib/documents/exportPersonalizedDocuments'

export interface ExportDistributedCallSheetsOptions {
  baseData: CallSheetData
  recipients: CallSheetRecipient[]
  /** Called as each file is about to be written (1-based index, total count). */
  onProgress?: (current: number, total: number) => void
}

/**
 * Generate a base call sheet PDF once, then create a personalised,
 * name-watermarked copy for each selected recipient. Uses unique filenames
 * (numeric suffix) when a file already exists or when multiple recipients
 * sanitize to the same name.
 *
 * Returns null if the user cancels directory selection; otherwise
 * { written, directoryPath }. Throws on PDF generation, watermarking, or write failure.
 */
export async function exportDistributedCallSheets(
  options: ExportDistributedCallSheetsOptions,
): Promise<{ written: number; directoryPath: string } | null> {
  const { baseData, recipients, onProgress } = options
  if (!recipients.length) return null

  const directory = await pickExportDirectory('Select directory for personalised call sheets')
  if (!directory) {
    return null
  }

  let baseBytes: Uint8Array
  try {
    baseBytes = new Uint8Array(await generateCallSheetPdf(baseData))
  } catch {
    throw new Error('Failed to generate call sheet PDF. Please try again.')
  }

  if (!baseBytes || baseBytes.length === 0) {
    throw new Error('Failed to generate base PDF.')
  }

  return exportPersonalizedDocuments({
    basePDFBytes: baseBytes,
    recipients,
    directory,
    buildFileName: (recipient) => {
      const safeName = sanitizeForFilename(recipient.fullName)
      const safeUnit = sanitizeForFilename(baseData.unitName || 'unit')
      return `call-sheet-${baseData.shootDate}-${safeUnit}-${safeName}.pdf`
    },
    onProgress,
  })
}
