import { getDocumentFileRef, hardDeleteDocumentRow } from '@/lib/db/repositories/document'
import { deleteAttachmentFile } from '@/lib/files'

/**
 * Permanently deletes a document: its file on disk and its database row. Unlike `deleteDocument`
 * (soft delete), nothing is kept. The file goes first so a failure leaves the row in place and the
 * delete can be retried; the file is kept if another document row still points at it.
 */
export async function hardDeleteDocument(id: string): Promise<void> {
  const ref = await getDocumentFileRef(id)
  if (!ref) return
  if (!ref.sharedWithOthers) await deleteAttachmentFile(ref.filePath)
  await hardDeleteDocumentRow(id)
}
