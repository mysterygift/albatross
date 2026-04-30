import { BaseDirectory, readFile } from '@tauri-apps/plugin-fs'

import type { PublishAssetManifestEntry } from '@/lib/publish/types'

type AssetFile = {
  archivePath: string
  bytes: Uint8Array
}

function sanitizeName(name: string): string {
  return name.trim().replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'file'
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function collectPublishAssets(params: {
  productionId: string
  documents: Array<Record<string, unknown>>
  storyboardImages: Array<Record<string, unknown>>
  strictMissingAssets?: boolean
}): Promise<{ manifestEntries: PublishAssetManifestEntry[]; files: AssetFile[] }> {
  const strict = params.strictMissingAssets !== false
  const manifestEntries: PublishAssetManifestEntry[] = []
  const files: AssetFile[] = []
  const missing: string[] = []

  for (const row of params.documents) {
    const rowId = String(row.id ?? '')
    const filePath = String(row.file_path ?? '')
    const fileName = sanitizeName(String(row.file_name ?? `${rowId}.bin`))
    if (!rowId || !filePath) continue
    try {
      const bytes = new Uint8Array(await readFile(filePath, { baseDir: BaseDirectory.AppData }))
      const archivePath = `files/assets/documents/${rowId}/${fileName}`
      files.push({ archivePath, bytes })
      manifestEntries.push({
        assetId: `document:${rowId}`,
        kind: 'document',
        sourceTable: 'documents',
        sourceRowId: rowId,
        fileName,
        archivePath,
        sha256: await sha256Hex(bytes),
        sizeBytes: bytes.byteLength,
      })
    } catch {
      missing.push(`documents:${rowId}`)
    }
  }

  for (const row of params.storyboardImages) {
    const rowId = String(row.id ?? '')
    const storageKey = String(row.storage_key ?? '')
    const fileName = sanitizeName(String(row.original_filename ?? `${rowId}.bin`))
    if (!rowId || !storageKey) continue
    try {
      const bytes = new Uint8Array(await readFile(storageKey, { baseDir: BaseDirectory.AppData }))
      const archivePath = `files/assets/storyboard-images/${rowId}/${fileName}`
      files.push({ archivePath, bytes })
      manifestEntries.push({
        assetId: `storyboard_image:${rowId}`,
        kind: 'storyboard_image',
        sourceTable: 'storyboard_images',
        sourceRowId: rowId,
        fileName,
        archivePath,
        sha256: await sha256Hex(bytes),
        sizeBytes: bytes.byteLength,
      })
    } catch {
      missing.push(`storyboard_images:${rowId}`)
    }
  }

  if (strict && missing.length > 0) {
    throw new Error(`Missing referenced publish assets: ${missing.join(', ')}`)
  }

  return { manifestEntries, files }
}
