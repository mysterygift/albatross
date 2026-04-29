import { readFile } from 'node:fs/promises'

import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { exportProductionForPostgresPublish } from '@/lib/publish/exportPublishPackage'
import { createFilesystemAssetStorage } from '@/lib/publish/filesystemAssetStorage'
import { importPublishPackageToPostgres } from '@/lib/publish/postgresImport'
import type { ExportPublishResult, ImportPublishResult, PostgresImportProgress } from '@/lib/publish/types'

export async function exportProductionForServerPublish(
  productionId: string,
  outputPath: string
): Promise<ExportPublishResult> {
  return exportProductionForPostgresPublish(productionId, outputPath)
}

export async function importPublishPackageFileToPostgres(params: {
  packagePath: string
  postgresAdapter: DatabaseAdapter
  serverAssetRoot: string
  importingUserId?: string
  onAssignAdministrator?: (args: { productionId: string; userId: string }) => Promise<void>
  onProgress?: (progress: PostgresImportProgress) => void
}): Promise<ImportPublishResult> {
  const bytes = new Uint8Array(await readFile(params.packagePath))
  return importPublishPackageToPostgres({
    packageBytes: bytes,
    adapter: params.postgresAdapter,
    assetStorage: createFilesystemAssetStorage(params.serverAssetRoot),
    importingUserId: params.importingUserId,
    onAssignAdministrator: params.onAssignAdministrator,
    onProgress: params.onProgress,
  })
}
