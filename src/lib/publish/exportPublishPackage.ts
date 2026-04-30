import { writeFile } from '@tauri-apps/plugin-fs'

import type { AuthenticatedUser } from '@/lib/auth/authService'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { requireProjectEditAccess } from '@/lib/access/projectAccessService'
import { getProductionById } from '@/lib/db/repositories/production'
import { CURRENT_PUBLISH_FORMAT_VERSION, PUBLISH_DATA_ENTRY_PATH, PUBLISH_FILES_ENTRY_PREFIX, PUBLISH_PACKAGE_KIND } from '@/lib/publish/constants'
import { collectPublishAssets } from '@/lib/publish/collectPublishAssets'
import { loadPublishProductionData } from '@/lib/publish/loadPublishProductionData'
import { buildPublishPackageBytes } from '@/lib/publish/packageCodec'
import { PUBLISH_TABLE_ORDER } from '@/lib/publish/tableOrder'
import type { ExportPublishResult, PublishDataFile, PublishManifest } from '@/lib/publish/types'

function sortRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [...rows].sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')))
}

export async function exportProductionForPostgresPublish(
  productionId: string,
  outputPath: string
): Promise<ExportPublishResult> {
  const production = await getProductionById(productionId)
  if (!production) throw new Error('Production not found or deleted')

  const tables = await loadPublishProductionData(productionId)
  const orderedTables: Record<string, Array<Record<string, unknown>>> = {}
  for (const table of PUBLISH_TABLE_ORDER) {
    orderedTables[table] = sortRows(tables[table] ?? [])
  }

  const assets = await collectPublishAssets({
    productionId,
    documents: orderedTables.documents ?? [],
    storyboardImages: orderedTables.storyboard_images ?? [],
    strictMissingAssets: true,
  })

  const tableRowCounts = Object.fromEntries(
    PUBLISH_TABLE_ORDER.map((table) => [table, orderedTables[table]?.length ?? 0])
  )

  const dataFile: PublishDataFile = {
    formatVersion: CURRENT_PUBLISH_FORMAT_VERSION,
    productionId,
    tableOrder: [...PUBLISH_TABLE_ORDER],
    tables: orderedTables,
  }
  const manifest: PublishManifest = {
    kind: PUBLISH_PACKAGE_KIND,
    formatVersion: CURRENT_PUBLISH_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      appName: 'albatross',
      database: 'sqlite',
    },
    production: {
      id: production.id,
      name: production.name,
      slug: production.slug,
    },
    data: {
      entryPath: PUBLISH_DATA_ENTRY_PATH,
      tableOrder: [...PUBLISH_TABLE_ORDER],
      tableRowCounts,
    },
    assets: {
      entryPrefix: PUBLISH_FILES_ENTRY_PREFIX,
      strict: true,
      entries: assets.manifestEntries,
    },
  }

  const bytes = buildPublishPackageBytes({
    manifest,
    dataFile,
    files: assets.files,
  })
  await writeFile(outputPath, bytes)
  return {
    outputPath,
    tableRowCounts,
    assetCount: assets.manifestEntries.length,
  }
}

export async function exportProductionForPostgresPublishForActor(args: {
  db: DatabaseAdapter
  actor: AuthenticatedUser
  productionId: string
  outputPath: string
}): Promise<ExportPublishResult> {
  await requireProjectEditAccess(args.db, args.actor, args.productionId)
  return exportProductionForPostgresPublish(args.productionId, args.outputPath)
}
