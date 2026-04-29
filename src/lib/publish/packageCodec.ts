import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

import {
  CURRENT_PUBLISH_FORMAT_VERSION,
  PUBLISH_DATA_ENTRY_PATH,
  PUBLISH_FILES_ENTRY_PREFIX,
  PUBLISH_MANIFEST_ENTRY_PATH,
  PUBLISH_PACKAGE_KIND,
} from '@/lib/publish/constants'
import type { PublishDataFile, PublishManifest } from '@/lib/publish/types'

type BundleFile = { archivePath: string; bytes: Uint8Array }

function stableJson(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value, null, 2)}\n`)
}

export function buildPublishPackageBytes(params: {
  manifest: PublishManifest
  dataFile: PublishDataFile
  files: BundleFile[]
}): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    [PUBLISH_MANIFEST_ENTRY_PATH]: stableJson(params.manifest),
    [PUBLISH_DATA_ENTRY_PATH]: stableJson(params.dataFile),
  }
  for (const file of params.files) {
    entries[file.archivePath] = file.bytes
  }
  return zipSync(entries, { level: 6 })
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(strFromU8(bytes, false))
  } catch {
    throw new Error(`Invalid JSON at ${label}`)
  }
}

function parseManifest(raw: unknown): PublishManifest {
  if (typeof raw !== 'object' || raw == null) throw new Error('Publish manifest must be an object')
  const manifest = raw as PublishManifest
  if (manifest.kind !== PUBLISH_PACKAGE_KIND) throw new Error(`Unexpected publish package kind: ${manifest.kind}`)
  if (manifest.formatVersion !== CURRENT_PUBLISH_FORMAT_VERSION) {
    throw new Error(`Unsupported publish format version ${manifest.formatVersion}`)
  }
  if (!manifest.data?.entryPath || !manifest.assets?.entryPrefix) {
    throw new Error('Publish manifest missing required data/assets metadata')
  }
  return manifest
}

function parseDataFile(raw: unknown): PublishDataFile {
  if (typeof raw !== 'object' || raw == null) throw new Error('Publish data file must be an object')
  const data = raw as PublishDataFile
  if (data.formatVersion !== CURRENT_PUBLISH_FORMAT_VERSION) {
    throw new Error(`Unsupported publish data format version ${data.formatVersion}`)
  }
  if (!data.productionId || !Array.isArray(data.tableOrder) || typeof data.tables !== 'object' || data.tables == null) {
    throw new Error('Publish data file missing productionId/tableOrder/tables')
  }
  return data
}

export function parsePublishPackageBytes(bytes: Uint8Array): {
  manifest: PublishManifest
  dataFile: PublishDataFile
  fileIndex: ReadonlyMap<string, Uint8Array>
} {
  const unzipped = unzipSync(bytes)
  const index = new Map<string, Uint8Array>()
  for (const [path, fileBytes] of Object.entries(unzipped)) {
    index.set(path.replace(/\\/g, '/'), fileBytes)
  }
  const manifestBytes = index.get(PUBLISH_MANIFEST_ENTRY_PATH)
  const dataBytes = index.get(PUBLISH_DATA_ENTRY_PATH)
  if (!manifestBytes || !dataBytes) {
    throw new Error('Publish package is missing manifest or data payload')
  }
  const manifest = parseManifest(parseJson(manifestBytes, PUBLISH_MANIFEST_ENTRY_PATH))
  const dataFile = parseDataFile(parseJson(dataBytes, PUBLISH_DATA_ENTRY_PATH))
  if (!manifest.assets.entryPrefix.startsWith(PUBLISH_FILES_ENTRY_PREFIX)) {
    // Keep the publish package rooted under `files/assets/` to avoid accidental path mismatches.
    throw new Error(`Unsupported asset prefix ${manifest.assets.entryPrefix}`)
  }
  return { manifest, dataFile, fileIndex: index }
}
