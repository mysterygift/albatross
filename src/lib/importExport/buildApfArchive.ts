import { strToU8, zipSync } from 'fflate'

import { APF_MANIFEST_ENTRY_PATH, APF_V1_DATA_ENTRY_PATH } from '@/lib/importExport/constants'
import type { ApfManifestV1 } from '@/lib/importExport/manifest'
import type { ApfV1DataFile } from '@/lib/importExport/payload'

export type ApfZipBundledFile = { archivePath: string; bytes: Uint8Array }

function stableJsonStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * Builds a standard ZIP byte array (suitable for `.apf` extension).
 */
export function buildApfZipBytes(
  manifest: ApfManifestV1,
  dataFile: ApfV1DataFile,
  bundled: ApfZipBundledFile[]
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    [APF_MANIFEST_ENTRY_PATH]: strToU8(stableJsonStringify(manifest)),
    [APF_V1_DATA_ENTRY_PATH]: strToU8(stableJsonStringify(dataFile)),
  }

  for (const { archivePath, bytes } of bundled) {
    files[archivePath] = bytes
  }

  return zipSync(files, { level: 6 })
}
