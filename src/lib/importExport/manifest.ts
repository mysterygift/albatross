import { z } from 'zod'

import {
  APF_FILE_KIND,
  APF_FILES_ENTRY_PREFIX,
  APF_V1_DATA_ENTRY_PATH,
} from '@/lib/importExport/constants'
import { ApfInvalidManifestError } from '@/lib/importExport/errors'

/**
 * v1 manifest schema. `formatVersion` is the on-disk interchange version (not app semver).
 * Newer files (higher formatVersion than the app supports) must be rejected before any DB work.
 */
export const apfManifestSchemaV1 = z.object({
  formatVersion: z.number().int().positive(),
  kind: z.literal(APF_FILE_KIND),
  /** ISO-8601 timestamp when the archive was written (required). */
  exportedAt: z.string().min(1),
  production: z.object({
    id: z.string().min(1),
    name: z.string(),
    slug: z.string().optional(),
  }),
  /** Path to the main JSON payload inside the zip (default: data/production.json). */
  dataEntryPath: z.string().min(1).optional(),
  /** Prefix for bundled file bytes (default: files/). */
  filesPrefix: z.string().min(1).optional(),
  /** Optional export diagnostics and support metadata. */
  export: z
    .object({
      tableRowCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
      bundledDocumentIds: z.array(z.string()).optional(),
      missingDocumentFileIds: z.array(z.string()).optional(),
    })
    .optional(),
  app: z
    .object({
      name: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
})

export type ApfManifestV1 = z.infer<typeof apfManifestSchemaV1>

export function parseApfManifestJson(raw: unknown): ApfManifestV1 {
  const res = apfManifestSchemaV1.safeParse(raw)
  if (!res.success) {
    const msg = res.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ')
    throw new ApfInvalidManifestError(`Invalid .apf manifest: ${msg}`)
  }
  return res.data
}

export function getManifestDataEntryPath(m: ApfManifestV1): string {
  return m.dataEntryPath ?? APF_V1_DATA_ENTRY_PATH
}

export function getManifestFilesPrefix(m: ApfManifestV1): string {
  const p = m.filesPrefix ?? APF_FILES_ENTRY_PREFIX
  return p.endsWith('/') ? p : `${p}/`
}
