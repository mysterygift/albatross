import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { ProductionTask } from '../types'

const TABLE = 'production_tasks'

function rowToTask(r: Record<string, unknown>): ProductionTask {
  const p = r.priority as number | null
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    description: r.description as string,
    is_complete: (r.is_complete as number) ?? 0,
    notes: (r.notes as string | null) ?? null,
    due_date: (r.due_date as string | null) ?? null,
    assigned_department: (r.assigned_department as string | null) ?? null,
    priority: p === 1 || p === 2 || p === 3 ? (p as 1 | 2 | 3) : null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

const DEFAULT_ORDER = `
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

export type TaskFilters = {
  search?: string
  status?: 'all' | 'incomplete' | 'complete'
  department?: string | null
  priority?: 1 | 2 | 3 | null
  dueTiming?: 'all' | 'overdue' | 'due_soon' | 'no_due_date'
}

export async function listTasksByProduction(productionId: string): Promise<ProductionTask[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY ${DEFAULT_ORDER}`,
    [productionId]
  )
  return rows.map(rowToTask)
}

export async function listTasksByProductionWithFilters(
  productionId: string,
  filters: TaskFilters
): Promise<ProductionTask[]> {
  const db = await getDb()
  const conditions: string[] = ['production_id = $1', 'deleted_at IS NULL']
  const params: unknown[] = [productionId]
  let i = 2

  if (filters.status === 'incomplete') {
    conditions.push('is_complete = 0')
  } else if (filters.status === 'complete') {
    conditions.push('is_complete = 1')
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
    conditions.push("due_date IS NOT NULL AND due_date < date('now','localtime')")
  } else if (filters.dueTiming === 'due_soon') {
    conditions.push(
      "due_date IS NOT NULL AND due_date >= date('now','localtime') AND due_date <= date('now','localtime','+7 days')"
    )
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
    `SELECT * FROM ${TABLE} WHERE ${where} ORDER BY ${DEFAULT_ORDER}`,
    params
  )
  return rows.map(rowToTask)
}

export async function listTasksDueSoonByProduction(productionId: string): Promise<ProductionTask[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE}
     WHERE production_id = $1 AND deleted_at IS NULL AND is_complete = 0
     ORDER BY
       CASE WHEN due_date IS NOT NULL AND due_date < date('now','localtime') THEN 0
            WHEN due_date IS NOT NULL AND due_date <= date('now','localtime','+7 days') THEN 1
            ELSE 2 END,
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
}

export async function createTask(data: CreateTaskData): Promise<ProductionTask> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, description, is_complete, notes, due_date, assigned_department, priority, created_at, updated_at)
     VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.production_id,
      data.description,
      data.notes ?? null,
      data.due_date ?? null,
      data.assigned_department ?? null,
      data.priority ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToTask(rows[0]!)
}

export type UpdateTaskPatch = Partial<{
  description: string
  is_complete: number
  notes: string | null
  due_date: string | null
  assigned_department: string | null
  priority: 1 | 2 | 3 | null
}>

const UPDATE_KEYS = [
  'description',
  'is_complete',
  'notes',
  'due_date',
  'assigned_department',
  'priority',
] as const

export async function updateTask(id: string, patch: UpdateTaskPatch): Promise<ProductionTask> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of UPDATE_KEYS) {
    if (patch[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(patch[k])
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

export async function deleteTask(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(`UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`, [ts, ts, id])
  await outboxPush(TABLE, id, 'delete', null)
}
