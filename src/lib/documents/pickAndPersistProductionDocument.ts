/**
 * Pick a file via native dialog and persist it as a production-scoped document.
 */
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'

import {
  persistProductionDocument,
  type PersistProductionDocumentArgs,
  type PersistProductionDocumentResult,
} from '@/lib/documents/persistDocument'

export type PickAndPersistProductionDocumentArgs = Omit<
  PersistProductionDocumentArgs,
  'fileName' | 'bytes'
> & {
  /** Optional dialog filters, e.g. [{ name: 'PDF', extensions: ['pdf'] }]. */
  filters?: { name: string; extensions: string[] }[]
}

function guessMimeType(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'csv') return 'text/csv'
  return null
}

/**
 * Open a file picker, read bytes, and persist via {@link persistProductionDocument}.
 * Returns null if the user cancels.
 */
export async function pickAndPersistProductionDocument(
  args: PickAndPersistProductionDocumentArgs
): Promise<(PersistProductionDocumentResult & { fileName: string }) | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: args.filters,
  })
  if (typeof selected !== 'string' || !selected) return null

  const fileName = selected.split(/[/\\]/).pop() ?? `file-${Date.now()}`
  const bytes = await readFile(selected)
  const mimeType = args.mimeType ?? guessMimeType(fileName)

  const result = await persistProductionDocument({
    ...args,
    fileName,
    bytes,
    mimeType,
  })
  return { ...result, fileName }
}

export type PickedFileBytes = {
  fileName: string
  bytes: Uint8Array
  mimeType: string | null
}

/**
 * Pick a file and return bytes without persisting. Used when the caller batches
 * document persistence with other writes (e.g. create invoice + document + link).
 */
export async function pickFileBytes(
  filters?: { name: string; extensions: string[] }[]
): Promise<PickedFileBytes | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters,
  })
  if (typeof selected !== 'string' || !selected) return null

  const fileName = selected.split(/[/\\]/).pop() ?? `file-${Date.now()}`
  const bytes = await readFile(selected)
  return { fileName, bytes, mimeType: guessMimeType(fileName) }
}

/** Query key for documents linked to a specific entity. */
export function entityDocumentsQueryKey(entityType: string, entityId: string) {
  return ['documents', entityType, entityId] as const
}
