import type { CallSheetData } from '@/lib/pdf/callSheet'
import { generateCallSheetPdf } from '@/lib/pdf/callSheet'
import { applyRecipientNameWatermarkToPDF } from '@/lib/pdf/applyRecipientNameWatermarkToPDF'
import type { CallSheetRecipient } from '@/features/call-sheets/CallSheetDistributionDialog'
import {
  pickExportDirectory,
  ensureUniqueFilenameInDirectory,
  writeFileInDirectory,
} from '@/lib/files/directories'

function sanitizeForFilename(input: string): string {
  const trimmed = input.trim()
  const safe = trimmed
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return safe || 'recipient'
}

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
  } catch (e) {
    throw new Error('Failed to generate call sheet PDF. Please try again.')
  }

  if (!baseBytes?.length) {
    throw new Error('Generated call sheet PDF is empty.')
  }

  const total = recipients.length
  const usedFilenames = new Set<string>()
  let written = 0

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i]!
    onProgress?.(i + 1, total)

    let watermarked: Uint8Array
    try {
      watermarked = await applyRecipientNameWatermarkToPDF(baseBytes, {
        recipientFullName: recipient.fullName,
      })
    } catch (e) {
      throw new Error(
        `Watermarking failed for "${recipient.fullName}". No files have been written.`,
      )
    }
    if (!watermarked?.length) {
      throw new Error(
        `Watermarked PDF is empty for "${recipient.fullName}". No files have been written.`,
      )
    }

    const safeName = sanitizeForFilename(recipient.fullName)
    const safeUnit = sanitizeForFilename(baseData.unitName || 'unit')
    const baseFileName = `call-sheet-${baseData.shootDate}-${safeUnit}-${safeName}.pdf`
    const fileName = await ensureUniqueFilenameInDirectory(directory, baseFileName, usedFilenames)
    usedFilenames.add(fileName)

    try {
      await writeFileInDirectory(directory, fileName, watermarked)
    } catch (e) {
      const msg = (e as Error)?.message ?? 'Unknown error'
      throw new Error(
        `Could not write file "${fileName}" to the selected directory. ${msg} No further files were written.`,
      )
    }
    written += 1
  }

  return { written, directoryPath: directory }
}

