import { applyRecipientNameWatermarkToPDF } from '@/lib/pdf/applyRecipientNameWatermarkToPDF'
import {
  pickExportDirectory,
  ensureUniqueFilenameInDirectory,
  writeFileInDirectory,
} from '@/lib/files/directories'
import { persistProductionDocument } from '@/lib/documents/persistDocument'
import type { PersonalizedDocumentRecipient } from '@/lib/documents/exportPersonalizedDocuments'

export type PersistPersonalizedDocumentsOptions = {
  productionId: string
  entityType: string
  basePDFBytes: Uint8Array
  recipients: PersonalizedDocumentRecipient[]
  buildFileName: (recipient: PersonalizedDocumentRecipient) => string
  resolveEntityId: (recipient: PersonalizedDocumentRecipient) => string | null
  /** When true, also prompt for an export directory after persisting to Documents. */
  alsoExportCopy?: boolean
  directoryPickerTitle?: string
  onProgress?: (current: number, total: number) => void
}

export type PersistPersonalizedDocumentsResult = {
  persisted: number
  exported: number
  directoryPath: string | null
}

function parsePersonIdFromRecipientId(recipientId: string): string | null {
  const match = recipientId.match(/^(?:cast|crew)-(.+)$/)
  return match?.[1] ?? recipientId
}

export function personIdFromRecipient(recipient: PersonalizedDocumentRecipient): string {
  return parsePersonIdFromRecipientId(recipient.id) ?? recipient.id
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

  if (alsoExportCopy) {
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
