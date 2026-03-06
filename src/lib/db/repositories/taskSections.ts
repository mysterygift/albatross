import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush, outboxStatementForRows } from '../outbox'
import type { ProductionTaskSection } from '../types'

const TABLE = 'production_task_sections'
const TASKS_TABLE = 'production_tasks'

function rowToSection(r: Record<string, unknown>): ProductionTaskSection {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    sort_order: (r.sort_order as number) ?? 0,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

export async function listTaskSectionsByProduction(
  productionId: string
): Promise<ProductionTaskSection[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC`,
    [productionId]
  )
  return rows.map(rowToSection)
}

export type CreateTaskSectionData = {
  production_id: string
  name: string
  sort_order?: number
}

export async function createTaskSection(
  data: CreateTaskSectionData
): Promise<ProductionTaskSection> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const sortOrder = data.sort_order ?? 0

  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL AND LOWER(TRIM(name)) = LOWER(TRIM($2))`,
    [data.production_id, data.name.trim()]
  )
  if (existing.length > 0) {
    throw new Error('A section with this name already exists')
  }

  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, name, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, data.production_id, data.name.trim(), sortOrder, ts, ts]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [
    id,
  ])
  return rowToSection(rows[0]!)
}

export type UpdateTaskSectionPatch = Partial<{
  name: string
  sort_order: number
}>

export async function updateTaskSection(
  id: string,
  patch: UpdateTaskSectionPatch
): Promise<ProductionTaskSection> {
  const db = await getDb()
  const ts = now()

  if (patch.name !== undefined) {
    const section = await db.select<Record<string, unknown>[]>(
      `SELECT production_id FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (section.length === 0) throw new Error('Section not found')
    const productionId = section[0]!.production_id as string

    const existing = await db.select<Record<string, unknown>[]>(
      `SELECT id FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL AND id != $2 AND LOWER(TRIM(name)) = LOWER(TRIM($3))`,
      [productionId, id, patch.name.trim()]
    )
    if (existing.length > 0) {
      throw new Error('A section with this name already exists')
    }
  }

  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (patch.name !== undefined) {
    cols.push(`name = $${i++}`)
    vals.push(patch.name.trim())
  }
  if (patch.sort_order !== undefined) {
    cols.push(`sort_order = $${i++}`)
    vals.push(patch.sort_order)
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (rows.length === 0) throw new Error('Section not found')
    return rowToSection(rows[0]!)
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(TABLE, id, 'update', JSON.stringify(patch))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [
    id,
  ])
  return rowToSection(rows[0]!)
}

/**
 * Soft-delete a section and unassign all tasks in that section (section_id = NULL).
 * Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md.
 */
export async function deleteTaskSection(id: string): Promise<void> {
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const ts = now()

    const taskRows = await db.select<{ id: string }[]>(
      `SELECT id FROM ${TASKS_TABLE} WHERE section_id = $1 AND deleted_at IS NULL`,
      [id]
    )
    const taskIds = taskRows.map((r) => r.id)

    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
    ]

    for (const taskId of taskIds) {
      statements.push({
        sql: `UPDATE ${TASKS_TABLE} SET section_id = NULL, updated_at = $1 WHERE id = $2`,
        bindValues: [ts, taskId],
      })
    }

    statements.push({
      sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
      bindValues: [ts, id],
    })

    const outboxRows: Array<{ entity: string; entityId: string; operation: 'update' | 'delete'; payloadJson: string | null }> = [
      ...taskIds.map((entityId) => ({
        entity: TASKS_TABLE,
        entityId,
        operation: 'update' as const,
        payloadJson: JSON.stringify({ section_id: null }),
      })),
      { entity: TABLE, entityId: id, operation: 'delete' as const, payloadJson: null },
    ]
    const outboxStmt = outboxStatementForRows(outboxRows)
    if (outboxStmt) statements.push(outboxStmt)

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}
