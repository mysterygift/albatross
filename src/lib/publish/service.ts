import { readFile } from 'node:fs/promises'

import type { AuthenticatedUser } from '@/lib/auth/authService'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import {
  exportProductionForPostgresPublish,
  exportProductionForPostgresPublishForActor,
} from '@/lib/publish/exportPublishPackage'
import { createFilesystemAssetStorage } from '@/lib/publish/filesystemAssetStorage'
import { importPublishPackageToPostgres } from '@/lib/publish/postgresImport'
import type { ExportPublishResult, ImportPublishResult, PostgresImportProgress } from '@/lib/publish/types'

export async function exportProductionForServerPublish(
  productionId: string,
  outputPath: string
): Promise<ExportPublishResult> {
  return exportProductionForPostgresPublish(productionId, outputPath)
}

export async function exportProductionForServerPublishForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  outputPath: string
}): Promise<ExportPublishResult> {
  return exportProductionForPostgresPublishForActor(args)
}

export async function importPublishPackageFileToPostgres(params: {
  packagePath: string
  postgresAdapter: DatabaseAdapter
  serverAssetRoot: string
  importingUserId?: string
  authenticatedUserId?: string
  onAssignAdministrator?: (args: { productionId: string; userId: string }) => Promise<void>
  onProgress?: (progress: PostgresImportProgress) => void
}): Promise<ImportPublishResult> {
  const bytes = new Uint8Array(await readFile(params.packagePath))
  return importPublishPackageToPostgres({
    packageBytes: bytes,
    adapter: params.postgresAdapter,
    assetStorage: createFilesystemAssetStorage(params.serverAssetRoot),
    importingUserId: params.importingUserId,
    authenticatedUserId: params.authenticatedUserId,
    onAssignAdministrator: params.onAssignAdministrator,
    onProgress: params.onProgress,
  })
}
