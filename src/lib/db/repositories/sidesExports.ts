import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush, outboxStatementForRow } from '../outbox'
import type { ShootDaySidesExport } from '../types'

const TABLE = 'shoot_day_sides_exports'

type Stmt = { sql: string; bindValues: unknown[] }

function rowToSidesExport(r: Record<string, unknown>): ShootDaySidesExport {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shoot_day_id: r.shoot_day_id as string,
    unit_id: (r.unit_id as string | null) ?? null,
    document_id: (r.document_id as string | null) ?? null,
    script_version_id: (r.script_version_id as string | null) ?? null,
    export_label: (r.export_label as string | null) ?? null,
    metadata_json: (r.metadata_json as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

export async function listSidesExportsByProduction(productionId: string): Promise<ShootDaySidesExport[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [productionId]
  )
  return rows.map(rowToSidesExport)
}

export async function listSidesExportsByShootDay(shootDayId: string): Promise<ShootDaySidesExport[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shoot_day_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [shootDayId]
  )
  return rows.map(rowToSidesExport)
}

export async function getSidesExportById(id: string): Promise<ShootDaySidesExport | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToSidesExport(rows[0]!) : null
}

export type CreateSidesExportData = {
  production_id: string
  shoot_day_id: string
  unit_id?: string | null
  document_id?: string | null
  script_version_id?: string | null
  export_label?: string | null
  metadata_json?: string | null
}

/**
 * Returns statements to create a sides export row for use in executeBatch (insert + outbox).
 * Does not include BEGIN/COMMIT. Caller provides id and ts. Use this when the export insert must
 * be coordinated atomically with the document insert in one transaction.
 */
export function buildCreateSidesExportStatements(
  id: string,
  ts: string,
  data: CreateSidesExportData
): Stmt[] {
  const insert: Stmt = {
    sql: `INSERT INTO ${TABLE} (id, production_id, shoot_day_id, unit_id, document_id, script_version_id, export_label, metadata_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    bindValues: [
      id,
      data.production_id,
      data.shoot_day_id,
      data.unit_id ?? null,
      data.document_id ?? null,
      data.script_version_id ?? null,
      data.export_label ?? null,
      data.metadata_json ?? null,
      ts,
      ts,
    ],
  }
  const outbox = outboxStatementForRow({
    entity: TABLE,
    entityId: id,
    operation: 'create',
    payloadJson: JSON.stringify({ ...data, id }),
  })
  return [insert, outbox]
}

export async function createSidesExport(data: CreateSidesExportData): Promise<ShootDaySidesExport> {
  const id = uuid()
  const ts = now()
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildCreateSidesExportStatements(id, ts, data),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
  return (await getSidesExportById(id))!
}

export async function softDeleteSidesExport(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(`UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`, [ts, ts, id])
  await outboxPush(TABLE, id, 'delete', null)
}
