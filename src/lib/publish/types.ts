export type PublishAssetKind = 'document' | 'storyboard_image'

export type PublishAssetManifestEntry = {
  assetId: string
  kind: PublishAssetKind
  sourceTable: string
  sourceRowId: string
  fileName: string
  archivePath: string
  sha256: string
  sizeBytes: number
}

export type PublishManifest = {
  kind: string
  formatVersion: number
  exportedAt: string
  source: {
    appName: string
    appVersion?: string
    database: 'sqlite'
  }
  production: {
    id: string
    name: string
    slug?: string
  }
  data: {
    entryPath: string
    tableOrder: string[]
    tableRowCounts: Record<string, number>
  }
  assets: {
    entryPrefix: string
    strict: boolean
    entries: PublishAssetManifestEntry[]
  }
}

export type PublishDataFile = {
  formatVersion: number
  productionId: string
  tableOrder: string[]
  tables: Record<string, Array<Record<string, unknown>>>
}

export type ExportPublishResult = {
  outputPath: string
  tableRowCounts: Record<string, number>
  assetCount: number
}

export type PostgresImportProgressStage =
  | 'parse'
  | 'validate'
  | 'assets'
  | 'database'
  | 'acl'
  | 'complete'

export type PostgresImportProgress = {
  stage: PostgresImportProgressStage
  message: string
}

export type ImportPublishResult = {
  productionId: string
  productionName: string
  tableRowsImported: number
  assetsImported: number
}
