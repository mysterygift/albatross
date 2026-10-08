import { BaseDirectory, readFile } from '@tauri-apps/plugin-fs'
import { saveFileWithDialog } from '@/lib/files'
import type { Document } from '@/lib/db/types'

/** Save As on desktop; on iPad and iPhone builds this opens the share sheet. */
export function saveReleaseCopy(fileName: string, bytes: Uint8Array): Promise<string | null> {
  return saveFileWithDialog(
    {
      defaultPath: fileName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      title: 'Save or share a copy of the signed release',
    },
    bytes
  )
}

/** Offers a copy of a release already stored in Documents. */
export async function saveStoredReleaseCopy(doc: Pick<Document, 'file_name' | 'file_path'>): Promise<string | null> {
  const bytes = new Uint8Array(await readFile(doc.file_path, { baseDir: BaseDirectory.AppData }))
  return saveReleaseCopy(doc.file_name, bytes)
}
