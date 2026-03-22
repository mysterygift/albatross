import { APF_FILE_KIND, CURRENT_APF_FORMAT_VERSION } from '@/lib/importExport/constants'
import type { ApfManifestV1 } from '@/lib/importExport/manifest'

export type BuildApfExportManifestParams = {
  productionId: string
  productionName: string
  slug?: string
  exportedAtIso: string
  tableRowCounts: Record<string, number>
  bundledDocumentIds: string[]
  missingDocumentFileIds: string[]
}

export function buildApfExportManifest(params: BuildApfExportManifestParams): ApfManifestV1 {
  const production: ApfManifestV1['production'] = {
    id: params.productionId,
    name: params.productionName,
  }
  if (params.slug !== undefined && params.slug.length > 0) {
    production.slug = params.slug
  }

  const manifest: ApfManifestV1 = {
    formatVersion: CURRENT_APF_FORMAT_VERSION,
    kind: APF_FILE_KIND,
    exportedAt: params.exportedAtIso,
    production,
    export: {
      tableRowCounts: { ...params.tableRowCounts },
      bundledDocumentIds:
        params.bundledDocumentIds.length > 0 ? [...params.bundledDocumentIds].sort() : undefined,
      missingDocumentFileIds:
        params.missingDocumentFileIds.length > 0
          ? [...params.missingDocumentFileIds].sort()
          : undefined,
    },
  }

  return manifest
}
