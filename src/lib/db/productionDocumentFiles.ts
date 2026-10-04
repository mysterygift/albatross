/**
 * Disk side of production-scoped document attachments (`attachments/<productionId>/<documentId>-<fileName>`
 * under AppData). Callers write the file first, then insert the `documents` row in their transaction, and
 * remove the file again if that transaction fails.
 */
import { BaseDirectory, mkdir, remove, writeFile } from '@tauri-apps/plugin-fs'

const ATTACHMENTS_DIR = 'attachments'

export function buildProductionDocumentRelativePath(
  productionId: string,
  documentId: string,
  fileName: string
): string {
  return `${ATTACHMENTS_DIR}/${productionId}/${documentId}-${fileName}`
}

export async function writeProductionDocumentFile(
  productionId: string,
  documentId: string,
  fileName: string,
  bytes: Uint8Array
): Promise<string> {
  const relativePath = buildProductionDocumentRelativePath(productionId, documentId, fileName)
  await mkdir(`${ATTACHMENTS_DIR}/${productionId}`, {
    baseDir: BaseDirectory.AppData,
    recursive: true,
  })
  await writeFile(relativePath, bytes, { baseDir: BaseDirectory.AppData })
  return relativePath
}

export async function removeProductionDocumentFile(relativePath: string): Promise<void> {
  try {
    await remove(relativePath, { baseDir: BaseDirectory.AppData })
  } catch {
    // Best-effort cleanup.
  }
}
