import {
  pickExportDirectory,
  ensureUniqueFilenameInDirectory,
  writeFileInDirectory,
} from '@/lib/files/directories'
import { applyRecipientNameWatermarkToPDF } from '@/lib/pdf/applyRecipientNameWatermarkToPDF'

export type PersonalizedDocumentRecipient = {
  id: string
  fullName: string
}

export interface ExportPersonalizedDocumentsOptions {
  basePDFBytes: Uint8Array
  recipients: PersonalizedDocumentRecipient[]
  buildFileName: (recipient: PersonalizedDocumentRecipient) => string
  /**
   * When set, skips the directory dialog and writes into this path (e.g. the caller
   * already prompted so PDF generation can run in a specific order).
   * When omitted, `pickExportDirectory` runs once at the start of the export.
   */
  directory?: string
  directoryPickerTitle?: string
  onProgress?: (current: number, total: number) => void
}

export type ExportPersonalizedDocumentsResult = {
  written: number
  directoryPath: string
}

/**
 * Watermark a base PDF once per recipient and write files into a user-selected (or preset) folder.
 * Filenames from `buildFileName` are made unique within the batch and against existing files on disk.
 */
export async function exportPersonalizedDocuments(
  options: ExportPersonalizedDocumentsOptions,
): Promise<ExportPersonalizedDocumentsResult | null> {
  const {
    basePDFBytes,
    recipients,
    buildFileName,
    directory: directoryPreset,
    directoryPickerTitle,
    onProgress,
  } = options

  if (!recipients.length) {
    return null
  }

  const directory =
    directoryPreset ??
    (await pickExportDirectory(directoryPickerTitle ?? 'Select export directory'))
  if (!directory) {
    return null
  }

  if (!basePDFBytes || basePDFBytes.length === 0) {
    throw new Error('Failed to generate base PDF.')
  }

  const total = recipients.length
  const usedFilenames = new Set<string>()
  let written = 0

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i]!
    onProgress?.(i + 1, total)

    let watermarked: Uint8Array
    try {
      watermarked = await applyRecipientNameWatermarkToPDF(basePDFBytes, {
        recipientFullName: recipient.fullName,
      })
    } catch {
      throw new Error(
        `Watermarking failed for "${recipient.fullName}". No files have been written.`,
      )
    }
    if (!watermarked?.length) {
      throw new Error(
        `Watermarked PDF is empty for "${recipient.fullName}". No files have been written.`,
      )
    }

    const desiredFileName = buildFileName(recipient)
    const fileName = await ensureUniqueFilenameInDirectory(directory, desiredFileName, usedFilenames)
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
