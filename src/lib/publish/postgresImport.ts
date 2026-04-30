import type { DatabaseAdapter, SqlStatement } from '@/lib/db/databaseAdapter'
import { parsePublishPackageBytes } from '@/lib/publish/packageCodec'
import { PublishImportError } from '@/lib/publish/errors'
import type { ImportPublishResult, PostgresImportProgress, PublishManifest } from '@/lib/publish/types'

type ColumnInfo = {
  column_name: string
  data_type: string
  udt_name: string
}

export type PublishAssetStorage = {
  writeAsset: (storageKey: string, bytes: Uint8Array) => Promise<void>
  deleteAsset: (storageKey: string) => Promise<void>
}

export type ImportPublishToPostgresParams = {
  packageBytes: Uint8Array
  adapter: DatabaseAdapter
  assetStorage: PublishAssetStorage
  importingUserId?: string
  authenticatedUserId?: string
  onAssignAdministrator?: (args: { productionId: string; userId: string }) => Promise<void>
  onProgress?: (progress: PostgresImportProgress) => void
}

function progress(params: ImportPublishToPostgresParams, stage: PostgresImportProgress['stage'], message: string): void {
  params.onProgress?.({ stage, message })
}

function sanitizeName(name: string): string {
  return name.trim().replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'file'
}

function getProductionId(manifest: PublishManifest, tables: Record<string, Array<Record<string, unknown>>>): string {
  const productionRow = tables.productions?.[0]
  const rowId = productionRow?.id != null ? String(productionRow.id) : ''
  if (!rowId || rowId !== manifest.production.id) {
    throw new PublishImportError(
      'validation',
      'Publish package production mismatch between manifest and productions table'
    )
  }
  return rowId
}

async function getColumnInfoMap(
  adapter: DatabaseAdapter,
  tableNames: string[]
): Promise<Map<string, Map<string, ColumnInfo>>> {
  const map = new Map<string, Map<string, ColumnInfo>>()
  for (const tableName of tableNames) {
    const cols = await adapter.select<ColumnInfo[]>(
      `SELECT column_name, data_type, udt_name
       FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    )
    map.set(tableName, new Map(cols.map((c) => [c.column_name, c])))
  }
  return map
}

function convertValue(value: unknown, column: ColumnInfo): unknown {
  if (value === undefined) return null
  if (value === null) return null
  const type = (column.data_type ?? '').toLowerCase()
  if (column.udt_name === 'uuid' || type === 'uuid') {
    const text = String(value).trim()
    return text.length === 0 ? null : text
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value === 1
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === '1' || normalized === 'true' || normalized === 't') return true
      if (normalized === '0' || normalized === 'false' || normalized === 'f') return false
    }
    throw new PublishImportError('type_conversion', `Invalid boolean value "${String(value)}"`)
  }
  if (type === 'numeric') {
    if (typeof value === 'string') return value
    if (typeof value === 'number') return Number.isFinite(value) ? value.toString() : null
    return String(value)
  }
  if (type === 'jsonb') {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch {
        throw new PublishImportError('type_conversion', 'Invalid JSON string for JSONB column')
      }
    }
    return value
  }
  if (type === 'timestamp with time zone' || type === 'date') {
    if (value instanceof Date) return value.toISOString()
    return String(value)
  }
  return value
}

async function ensureNoProductionCollision(adapter: DatabaseAdapter, productionId: string): Promise<void> {
  const rows = await adapter.select<Array<{ id: string }>>(
    'SELECT id FROM productions WHERE id = $1 LIMIT 1',
    [productionId]
  )
  if (rows.length > 0) {
    throw new PublishImportError('constraint', `Production id ${productionId} already exists`)
  }
}

async function ensureImportingUserCanReceiveProject(adapter: DatabaseAdapter, userId: string): Promise<void> {
  const rows = await adapter.select<Array<{ id: string; disabled_at: string | null }>>(
    `SELECT id, disabled_at FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  )
  if (!rows[0]) {
    throw new PublishImportError('acl', `Importing user ${userId} not found`)
  }
  if (rows[0].disabled_at) {
    throw new PublishImportError('acl', `Importing user ${userId} is disabled`)
  }
}

function resolveStorageKeyForAsset(productionId: string, entry: { kind: string; sourceRowId: string; fileName: string }): string {
  const fileName = sanitizeName(entry.fileName)
  if (entry.kind === 'document') {
    return `server-assets/productions/${productionId}/documents/${entry.sourceRowId}-${fileName}`
  }
  return `server-assets/productions/${productionId}/storyboards/${entry.sourceRowId}-${fileName}`
}

function rewriteRowAssetPaths(
  tables: Record<string, Array<Record<string, unknown>>>,
  storageMap: Map<string, string>
): Record<string, Array<Record<string, unknown>>> {
  const out: Record<string, Array<Record<string, unknown>>> = {}
  for (const [table, rows] of Object.entries(tables)) {
    out[table] = rows.map((row) => {
      const next = { ...row }
      if (table === 'documents') {
        const key = `document:${String(row.id ?? '')}`
        if (storageMap.has(key)) next.file_path = storageMap.get(key)
      }
      if (table === 'storyboard_images') {
        const key = `storyboard_image:${String(row.id ?? '')}`
        if (storageMap.has(key)) next.storage_key = storageMap.get(key)
      }
      return next
    })
  }
  return out
}

function buildInsertStatements(params: {
  tableOrder: string[]
  tables: Record<string, Array<Record<string, unknown>>>
  columnMap: Map<string, Map<string, ColumnInfo>>
}): SqlStatement[] {
  const statements: SqlStatement[] = []
  for (const table of params.tableOrder) {
    const rows = params.tables[table] ?? []
    const columnsForTable = params.columnMap.get(table)
    if (!columnsForTable || rows.length === 0) continue
    for (const row of rows) {
      const columns: string[] = []
      const bindValues: unknown[] = []
      for (const [columnName, columnInfo] of columnsForTable.entries()) {
        if (!Object.prototype.hasOwnProperty.call(row, columnName)) continue
        columns.push(columnName)
        bindValues.push(convertValue(row[columnName], columnInfo))
      }
      if (columns.length === 0) continue
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
      statements.push({
        sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
        bindValues,
      })
    }
  }
  return statements
}

export async function importPublishPackageToPostgres(
  params: ImportPublishToPostgresParams
): Promise<ImportPublishResult> {
  progress(params, 'parse', 'Parsing publish package')
  const parsed = parsePublishPackageBytes(params.packageBytes)
  const productionId = getProductionId(parsed.manifest, parsed.dataFile.tables)
  progress(params, 'validate', 'Validating package and collisions')
  await ensureNoProductionCollision(params.adapter, productionId)
  if (!params.importingUserId) {
    throw new PublishImportError('acl', 'Importing user is required for publish import')
  }
  if (params.authenticatedUserId && params.authenticatedUserId !== params.importingUserId) {
    throw new PublishImportError('acl', 'Importing user does not match authenticated session user')
  }
  await ensureImportingUserCanReceiveProject(params.adapter, params.importingUserId)

  const storageMap = new Map<string, string>()
  const writtenAssets: string[] = []
  let phase: 'assets' | 'database' | 'acl' = 'assets'
  try {
    progress(params, 'assets', 'Writing publish assets to server storage')
    for (const entry of parsed.manifest.assets.entries) {
      const bytes = parsed.fileIndex.get(entry.archivePath)
      if (!bytes) {
        throw new PublishImportError('missing_assets', `Missing bundled asset bytes for ${entry.assetId}`)
      }
      const storageKey = resolveStorageKeyForAsset(productionId, entry)
      await params.assetStorage.writeAsset(storageKey, bytes)
      writtenAssets.push(storageKey)
      storageMap.set(entry.assetId, storageKey)
    }

    progress(params, 'database', 'Importing rows into PostgreSQL')
    phase = 'database'
    const rewrittenTables = rewriteRowAssetPaths(parsed.dataFile.tables, storageMap)
    const columnMap = await getColumnInfoMap(params.adapter, parsed.dataFile.tableOrder)
    const statements = buildInsertStatements({
      tableOrder: parsed.dataFile.tableOrder,
      tables: rewrittenTables,
      columnMap,
    })
    const membershipId = crypto.randomUUID()
    const ts = new Date().toISOString()
    statements.push({
      sql: `INSERT INTO project_memberships
            (id, production_id, user_id, access_level, created_at, updated_at)
            VALUES ($1, $2, $3, 'administrator', $4, $4)`,
      bindValues: [membershipId, productionId, params.importingUserId, ts],
    })
    await params.adapter.executeBatch([
      { sql: 'BEGIN', bindValues: [] },
      ...statements,
      { sql: 'COMMIT', bindValues: [] },
    ])

    if (params.onAssignAdministrator) {
      progress(params, 'acl', 'Assigning administrator role for importing user')
      phase = 'acl'
      await params.onAssignAdministrator({
        productionId,
        userId: params.importingUserId,
      })
    }

    progress(params, 'complete', 'Publish import completed')
    const tableRowsImported = parsed.dataFile.tableOrder.reduce(
      (sum, table) => sum + (parsed.dataFile.tables[table]?.length ?? 0),
      0
    )
    return {
      productionId,
      productionName: parsed.manifest.production.name,
      tableRowsImported,
      assetsImported: writtenAssets.length,
    }
  } catch (error) {
    for (const asset of writtenAssets) {
      await params.assetStorage.deleteAsset(asset).catch(() => undefined)
    }
    if (error instanceof PublishImportError) throw error
    const message = error instanceof Error ? error.message : String(error)
    if (phase === 'assets') throw new PublishImportError('storage', message)
    if (phase === 'database') {
      const lower = message.toLowerCase()
      if (lower.includes('constraint') || lower.includes('duplicate key') || lower.includes('violates')) {
        throw new PublishImportError('constraint', message)
      }
      throw new PublishImportError('validation', message)
    }
    throw new PublishImportError('acl', message)
  }
}
