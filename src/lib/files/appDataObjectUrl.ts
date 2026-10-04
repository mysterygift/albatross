import { BaseDirectory, readFile } from '@tauri-apps/plugin-fs'

/**
 * Reads a file stored under AppData (e.g. a document's `file_path`) and returns a blob URL to show it.
 * Callers revoke the URL when done. Works without the Tauri asset protocol.
 */
export async function createAppDataObjectUrl(relativePath: string, mimeType?: string | null): Promise<string> {
  const bytes = await readFile(relativePath, { baseDir: BaseDirectory.AppData })
  return URL.createObjectURL(new Blob([bytes], { type: mimeType ?? 'application/octet-stream' }))
}
