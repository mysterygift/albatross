import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush, outboxStatementForRow, outboxStatementForRows } from '../outbox'
import { coerceBoolean } from '../sqlValueCoercion'
import type { ProductionTask } from '../types'

const TABLE = 'production_tasks'

function rowToTask(r: Record<string, unknown>): ProductionTask {
  const p = r.priority as number | null
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    description: r.description as string,
    is_complete: coerceBoolean(r.is_complete, false) ? 1 : 0,
    notes: (r.notes as string | null) ?? null,
    due_date: (r.due_date as string | null) ?? null,
    assigned_department: (r.assigned_department as string | null) ?? null,
    priority: p === 1 || p === 2 || p === 3 ? (p as 1 | 2 | 3) : null,
    parent_task_id: (r.parent_task_id as string | null) ?? null,
    section_id: (r.section_id as string | null) ?? null,
    vendor_invoice_id: (r.vendor_invoice_id as string | null) ?? null,
    equipment_id: (r.equipment_id as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function getDefaultOrderSql(dialect: 'sqlite' | 'postgres' | undefined): string {
  if (dialect === 'postgres') {
    return `
      is_complete ASC,
      CASE
        WHEN is_complete = TRUE THEN 1
        WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE THEN 0
        WHEN due_date IS NOT NULL AND due_date <= (CURRENT_DATE + INTERVAL '7 days')::date THEN 1
        ELSE 2
      END,
      CASE WHEN priority IS NULL THEN 4 ELSE priority END ASC,
      due_date ASC,
      description ASC
    `
  }
  return `
    is_complete ASC,
    CASE
      WHEN is_complete = 1 THEN 1
      WHEN due_date IS NOT NULL AND due_date < date('now','localtime') THEN 0
      WHEN due_date IS NOT NULL AND due_date <= date('now','localtime','+7 days') THEN 1
      ELSE 2
    END,
    CASE WHEN priority IS NULL THEN 4 ELSE priority END ASC,
    due_date ASC,
    description ASC
  `
}

export type TaskFilters = {
  search?: string
  status?: 'all' | 'incomplete' | 'complete'
  department?: string | null
  priority?: 1 | 2 | 3 | null
  dueTiming?: 'all' | 'overdue' | 'due_soon' | 'no_due_date'
}

export async function listTasksByProduction(productionId: string): Promise<ProductionTask[]> {
  const db = await getDb()
  const defaultOrder = getDefaultOrderSql(db.dialect)
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY ${defaultOrder}`,
    [productionId]
  )
  return rows.map(rowToTask)
}

export async function listTasksByProductionWithFilters(
  productionId: string,
  filters: TaskFilters
): Promise<ProductionTask[]> {
  const db = await getDb()
  const defaultOrder = getDefaultOrderSql(db.dialect)
  const incompletePredicate = db.dialect === 'postgres' ? 'is_complete = FALSE' : 'is_complete = 0'
  const completePredicate = db.dialect === 'postgres' ? 'is_complete = TRUE' : 'is_complete = 1'
  const overduePredicate =
    db.dialect === 'postgres'
      ? 'due_date IS NOT NULL AND due_date < CURRENT_DATE'
      : "due_date IS NOT NULL AND due_date < date('now','localtime')"
  const dueSoonPredicate =
    db.dialect === 'postgres'
      ? "due_date IS NOT NULL AND due_date >= CURRENT_DATE AND due_date <= (CURRENT_DATE + INTERVAL '7 days')::date"
      : "due_date IS NOT NULL AND due_date >= date('now','localtime') AND due_date <= date('now','localtime','+7 days')"
  const conditions: string[] = ['production_id = $1', 'deleted_at IS NULL']
  const params: unknown[] = [productionId]
  let i = 2

  if (filters.status === 'incomplete') {
    conditions.push(incompletePredicate)
  } else if (filters.status === 'complete') {
    conditions.push(completePredicate)
  }

  if (filters.department !== undefined && filters.department !== null) {
    conditions.push(`assigned_department = $${i++}`)
    params.push(filters.department)
  }

  if (filters.priority !== undefined && filters.priority !== null) {
    conditions.push(`priority = $${i++}`)
    params.push(filters.priority)
  }

  if (filters.dueTiming === 'overdue') {
    conditions.push(overduePredicate)
  } else if (filters.dueTiming === 'due_soon') {
    conditions.push(dueSoonPredicate)
  } else if (filters.dueTiming === 'no_due_date') {
    conditions.push('due_date IS NULL')
  }

  if (filters.search?.trim()) {
    const pattern = `%${filters.search.trim()}%`
    conditions.push(`(LOWER(description) LIKE LOWER($${i}) OR (notes IS NOT NULL AND LOWER(notes) LIKE LOWER($${i})))`)
    params.push(pattern)
    i++
  }

  const where = conditions.join(' AND ')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE ${where} ORDER BY ${defaultOrder}`,
    params
  )
  return rows.map(rowToTask)
}

export async function listTasksDueSoonByProduction(productionId: string): Promise<ProductionTask[]> {
  const db = await getDb()
  const incompletePredicate = db.dialect === 'postgres' ? 'is_complete = FALSE' : 'is_complete = 0'
  const overdueCase =
    db.dialect === 'postgres'
      ? `CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE THEN 0
             WHEN due_date IS NOT NULL AND due_date <= (CURRENT_DATE + INTERVAL '7 days')::date THEN 1
             ELSE 2 END`
      : `CASE WHEN due_date IS NOT NULL AND due_date < date('now','localtime') THEN 0
             WHEN due_date IS NOT NULL AND due_date <= date('now','localtime','+7 days') THEN 1
             ELSE 2 END`
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE}
     WHERE production_id = $1 AND deleted_at IS NULL AND ${incompletePredicate}
     ORDER BY
       ${overdueCase},
       CASE WHEN priority IS NULL THEN 4 ELSE priority END ASC,
       due_date ASC,
       description ASC
     LIMIT 10`,
    [productionId]
  )
  return rows.map(rowToTask)
}

export type CreateTaskData = {
  production_id: string
  description: string
  notes?: string | null
  due_date?: string | null
  assigned_department?: string | null
  priority?: 1 | 2 | 3 | null
  parent_task_id?: string | null
  section_id?: string | null
  vendor_invoice_id?: string | null
  equipment_id?: string | null
  /** Default 0. Set 1 for e.g. invoice reminder when invoice is already paid. */
  is_complete?: number
}

export async function createTask(data: CreateTaskData): Promise<ProductionTask> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const isComplete = coerceBoolean(data.is_complete, false)
  let sectionId = data.section_id ?? null
  if (data.parent_task_id && data.section_id === undefined) {
    const parentRows = await db.select<Record<string, unknown>[]>(
      `SELECT section_id FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [data.parent_task_id]
    )
    if (parentRows.length > 0) {
      sectionId = (parentRows[0]!.section_id as string | null) ?? null
    }
  }
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, description, is_complete, notes, due_date, assigned_department, priority, parent_task_id, section_id, vendor_invoice_id, equipment_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      data.production_id,
      data.description,
      isComplete,
      data.notes ?? null,
      data.due_date ?? null,
      data.assigned_department ?? null,
      data.priority ?? null,
      data.parent_task_id ?? null,
      sectionId,
      data.vendor_invoice_id ?? null,
      data.equipment_id ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToTask(rows[0]!)
}

/** Returns the active (non-deleted) task linked to this vendor invoice, if any. At most one per invoice. */
export async function getTaskByVendorInvoiceId(invoiceId: string): Promise<ProductionTask | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE vendor_invoice_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [invoiceId]
  )
  return rows.length > 0 ? rowToTask(rows[0]!) : null
}

/** Returns the active (non-deleted) task linked to this equipment item, if any. At most one per equipment. */
export async function getTaskByEquipmentId(equipmentId: string): Promise<ProductionTask | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE equipment_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [equipmentId]
  )
  return rows.length > 0 ? rowToTask(rows[0]!) : null
}

/**
 * Returns statements to create a task for use in executeBatch (e.g. with invoice create).
 * Does not include BEGIN/COMMIT. Caller must provide task id and include these in the batch.
 */
export function buildCreateTaskStatements(
  taskId: string,
  data: CreateTaskData,
  ts: string
): Array<{ sql: string; bindValues: unknown[] }> {
  const isComplete = coerceBoolean(data.is_complete, false)
  const insert = {
    sql: `INSERT INTO ${TABLE} (id, production_id, description, is_complete, notes, due_date, assigned_department, priority, parent_task_id, section_id, vendor_invoice_id, equipment_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    bindValues: [
      taskId,
      data.production_id,
      data.description,
      isComplete,
      data.notes ?? null,
      data.due_date ?? null,
      data.assigned_department ?? null,
      data.priority ?? null,
      data.parent_task_id ?? null,
      data.section_id ?? null,
      data.vendor_invoice_id ?? null,
      data.equipment_id ?? null,
      ts,
      ts,
    ],
  }
  const outbox = outboxStatementForRow({
    entity: TABLE,
    entityId: taskId,
    operation: 'create',
    payloadJson: JSON.stringify({ ...data, id: taskId }),
  })
  return [insert, outbox]
}

export type UpdateTaskPatch = Partial<{
  description: string
  is_complete: number
  notes: string | null
  due_date: string | null
  assigned_department: string | null
  priority: 1 | 2 | 3 | null
  parent_task_id: string | null
  section_id: string | null
  vendor_invoice_id: string | null
  equipment_id: string | null
}>

const UPDATE_KEYS = [
  'description',
  'is_complete',
  'notes',
  'due_date',
  'assigned_department',
  'priority',
  'parent_task_id',
  'section_id',
  'vendor_invoice_id',
  'equipment_id',
] as const

/**
 * Update a task's section and all its descendant tasks to the same section.
 * When a parent task is moved to a section, all subtasks move with it.
 * Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md.
 */
export async function updateTaskSectionWithDescendants(
  taskId: string,
  sectionId: string | null
): Promise<void> {
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const ts = now()

    const rows = await db.select<{ id: string }[]>(
      `WITH RECURSIVE descendants AS (
        SELECT id FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT t.id FROM ${TABLE} t
        INNER JOIN descendants d ON t.parent_task_id = d.id
        WHERE t.deleted_at IS NULL
      )
      SELECT id FROM descendants`,
      [taskId]
    )

    const ids = rows.map((r) => r.id)
    if (ids.length === 0) return

    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
    ]

    for (const id of ids) {
      statements.push({
        sql: `UPDATE ${TABLE} SET section_id = $1, updated_at = $2 WHERE id = $3`,
        bindValues: [sectionId, ts, id],
      })
    }

    const outboxRows = ids.map((entityId) => ({
      entity: TABLE,
      entityId,
      operation: 'update' as const,
      payloadJson: JSON.stringify({ section_id: sectionId }),
    }))
    const outboxStmt = outboxStatementForRows(outboxRows)
    if (outboxStmt) statements.push(outboxStmt)

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}

export async function updateTask(id: string, patch: UpdateTaskPatch): Promise<ProductionTask> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of UPDATE_KEYS) {
    if (patch[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      if (k === 'is_complete') {
        vals.push(coerceBoolean(patch[k], false))
      } else {
        vals.push(patch[k])
      }
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (rows.length === 0) throw new Error('Task not found')
    return rowToTask(rows[0]!)
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(TABLE, id, 'update', JSON.stringify(patch))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToTask(rows[0]!)
}

/**
 * Soft-delete a task. When deleting a parent, also soft-deletes all subtasks (recursive).
 * Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md.
 */
/**
 * Returns statements to update a task for use in executeBatch.
 * Does not include BEGIN/COMMIT.
 */
export function buildUpdateTaskStatements(
  taskId: string,
  patch: UpdateTaskPatch,
  ts: string
): Array<{ sql: string; bindValues: unknown[] }> {
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of UPDATE_KEYS) {
    if (patch[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      if (k === 'is_complete') {
        vals.push(coerceBoolean(patch[k], false))
      } else {
        vals.push(patch[k])
      }
    }
  }
  if (cols.length === 0) return []
  cols.push(`updated_at = $${i}`)
  vals.push(ts, taskId)
  const update = {
    sql: `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`,
    bindValues: vals,
  }
  const outbox = outboxStatementForRow({
    entity: TABLE,
    entityId: taskId,
    operation: 'update',
    payloadJson: JSON.stringify(patch),
  })
  return [update, outbox]
}

/**
 * Returns statements to soft-delete a single task for use in executeBatch.
 * Use for invoice reminder tasks (no descendants). Does not include BEGIN/COMMIT.
 */
export function buildSoftDeleteTaskStatements(taskId: string, ts: string): Array<{ sql: string; bindValues: unknown[] }> {
  const update = {
    sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    bindValues: [ts, ts, taskId],
  }
  const outbox = outboxStatementForRow({
    entity: TABLE,
    entityId: taskId,
    operation: 'delete',
    payloadJson: null,
  })
  return [update, outbox]
}

export async function deleteTask(id: string): Promise<void> {
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const ts = now()

    // Get task and all descendants via recursive CTE
    const rows = await db.select<{ id: string }[]>(
      `WITH RECURSIVE to_delete AS (
        SELECT id FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT t.id FROM ${TABLE} t
        INNER JOIN to_delete d ON t.parent_task_id = d.id
        WHERE t.deleted_at IS NULL
      )
      SELECT id FROM to_delete`,
      [id]
    )

    const ids = rows.map((r) => r.id)
    if (ids.length === 0) return

    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
    ]

    for (const taskId of ids) {
      statements.push({
        sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
        bindValues: [ts, ts, taskId],
      })
    }

    const outboxRows = ids.map((entityId) => ({
      entity: TABLE,
      entityId,
      operation: 'delete' as const,
      payloadJson: null as string | null,
    }))
    const outboxStmt = outboxStatementForRows(outboxRows)
    if (outboxStmt) statements.push(outboxStmt)

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}
