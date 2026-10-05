import { zipSync } from 'fflate'

import { applyRecipientNameWatermarkToPDF } from '@/lib/pdf/applyRecipientNameWatermarkToPDF'
import {
  pickExportDirectory,
  ensureUniqueFilenameInDirectory,
  writeFileInDirectory,
} from '@/lib/files/directories'
import { shareMobileExport } from '@/lib/files/mobileShare'
import { isMobilePlatform } from '@/lib/platform'
import { persistProductionDocument } from '@/lib/documents/persistDocument'
import type { PersonalizedDocumentRecipient } from '@/lib/documents/exportPersonalizedDocuments'

export type PersistPersonalizedDocumentsOptions = {
  productionId: string
  entityType: string
  basePDFBytes: Uint8Array
  recipients: PersonalizedDocumentRecipient[]
  buildFileName: (recipient: PersonalizedDocumentRecipient) => string
  resolveEntityId: (recipient: PersonalizedDocumentRecipient) => string | null
  /**
   * When true, also export copies after persisting to Documents: on desktop into a folder the user
   * picks; on iOS/Android as one zip (see `archiveFileName`) offered through the share sheet.
   */
  alsoExportCopy?: boolean
  /** Name of the zip the copies are bundled into on mobile, e.g. "call-sheets-2026-11-02-main-unit.zip". */
  archiveFileName?: string
  directoryPickerTitle?: string
  onProgress?: (current: number, total: number) => void
}

export type PersistPersonalizedDocumentsResult = {
  persisted: number
  exported: number
  /** Folder the copies were written to, or on mobile the path of the zip. */
  directoryPath: string | null
}

function parsePersonIdFromRecipientId(recipientId: string): string | null {
  const match = recipientId.match(/^(?:cast|crew)-(.+)$/)
  return match?.[1] ?? recipientId
}

export function personIdFromRecipient(recipient: PersonalizedDocumentRecipient): string {
  return parsePersonIdFromRecipientId(recipient.id) ?? recipient.id
}

/** One zip of the recipients' PDFs, each under a unique name (names that sanitise alike get -1, -2…). */
export function zipPersonalizedCopies(items: ReadonlyArray<{ fileName: string; bytes: Uint8Array }>): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  for (const item of items) {
    let name = item.fileName
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    for (let n = 1; name in files; n++) name = `${stem}-${n}${ext}`
    files[name] = item.bytes
  }
  // PDFs are already compressed; storing them keeps zipping instant on a phone.
  return zipSync(files, { level: 0 })
}

/**
 * Watermark and persist one documents row per recipient, then optionally write copies
 * to a user-selected folder.
 */
export async function persistPersonalizedDocuments(
  options: PersistPersonalizedDocumentsOptions
): Promise<PersistPersonalizedDocumentsResult> {
  const {
    productionId,
    entityType,
    basePDFBytes,
    recipients,
    buildFileName,
    resolveEntityId,
    alsoExportCopy = true,
    archiveFileName,
    directoryPickerTitle,
    onProgress,
  } = options

  if (!recipients.length) {
    return { persisted: 0, exported: 0, directoryPath: null }
  }
  if (!basePDFBytes?.length) {
    throw new Error('Failed to generate base PDF.')
  }

  const watermarkedByRecipient: Array<{
    recipient: PersonalizedDocumentRecipient
    bytes: Uint8Array
    fileName: string
  }> = []

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i]!
    onProgress?.(i + 1, recipients.length)

    const watermarked = await applyRecipientNameWatermarkToPDF(basePDFBytes, {
      recipientFullName: recipient.fullName,
    })
    if (!watermarked?.length) {
      throw new Error(`Watermarked PDF is empty for "${recipient.fullName}".`)
    }
    watermarkedByRecipient.push({
      recipient,
      bytes: watermarked,
      fileName: buildFileName(recipient),
    })
  }

  for (const item of watermarkedByRecipient) {
    await persistProductionDocument({
      productionId,
      fileName: item.fileName,
      bytes: item.bytes,
      mimeType: 'application/pdf',
      entityType,
      entityId: resolveEntityId(item.recipient),
    })
  }

  let exported = 0
  let directoryPath: string | null = null

  if (alsoExportCopy && isMobilePlatform()) {
    // A phone has no folder to save a batch into, and sharing dozens of PDFs one by one is unworkable:
    // bundle them into one zip in the app's Exports folder and hand that to the share sheet.
    const directory = await pickExportDirectory()
    if (directory) {
      const zipPath = await writeFileInDirectory(
        directory,
        await ensureUniqueFilenameInDirectory(directory, archiveFileName ?? 'personalised-documents.zip'),
        zipPersonalizedCopies(watermarkedByRecipient)
      )
      directoryPath = zipPath
      exported = watermarkedByRecipient.length
      await shareMobileExport(zipPath)
    }
  } else if (alsoExportCopy) {
    const directory = await pickExportDirectory(
      directoryPickerTitle ?? 'Select directory for export copies'
    )
    if (directory) {
      directoryPath = directory
      const usedFilenames = new Set<string>()
      for (const item of watermarkedByRecipient) {
        const fileName = await ensureUniqueFilenameInDirectory(
          directory,
          item.fileName,
          usedFilenames
        )
        usedFilenames.add(fileName)
        await writeFileInDirectory(directory, fileName, item.bytes)
        exported += 1
      }
    }
  }

  return {
    persisted: watermarkedByRecipient.length,
    exported,
    directoryPath,
  }
}
