import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush, outboxStatementForRows } from '../outbox'
import type { TaskTemplate, TaskTemplateItem } from '../types'
const TEMPLATES_TABLE = 'task_templates'
const ITEMS_TABLE = 'task_template_items'
const SECTIONS_TABLE = 'production_task_sections'
const TASKS_TABLE = 'production_tasks'

function rowToTemplate(r: Record<string, unknown>): TaskTemplate {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function rowToItem(r: Record<string, unknown>): TaskTemplateItem {
  const p = r.priority as number | null
  return {
    id: r.id as string,
    task_template_id: r.task_template_id as string,
    description: r.description as string,
    notes: (r.notes as string | null) ?? null,
    due_offset_days: (r.due_offset_days as number | null) ?? null,
    assigned_department: (r.assigned_department as string | null) ?? null,
    priority: p === 1 || p === 2 || p === 3 ? (p as 1 | 2 | 3) : null,
    section_name: (r.section_name as string | null) ?? null,
    parent_template_item_id: (r.parent_template_item_id as string | null) ?? null,
    sort_order: (r.sort_order as number) ?? 0,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

export async function listTaskTemplates(): Promise<TaskTemplate[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TEMPLATES_TABLE} WHERE deleted_at IS NULL ORDER BY name ASC`
  )
  return rows.map(rowToTemplate)
}

export async function getTaskTemplateWithItems(
  taskTemplateId: string
): Promise<{ template: TaskTemplate; items: TaskTemplateItem[] }> {
  const db = await getDb()
  const [templateRows, itemRows] = await Promise.all([
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${TEMPLATES_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [taskTemplateId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${ITEMS_TABLE} WHERE task_template_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC`,
      [taskTemplateId]
    ),
  ])
  if (templateRows.length === 0) throw new Error('Task template not found')
  return {
    template: rowToTemplate(templateRows[0]!),
    items: itemRows.map(rowToItem),
  }
}

export type CreateTaskTemplateData = {
  name: string
  description?: string | null
}

export async function createTaskTemplate(
  data: CreateTaskTemplateData
): Promise<TaskTemplate> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TEMPLATES_TABLE} (id, name, description, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, data.name.trim(), data.description?.trim() ?? null, ts, ts]
  )
  await outboxPush(TEMPLATES_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TEMPLATES_TABLE} WHERE id = $1`,
    [id]
  )
  return rowToTemplate(rows[0]!)
}

export type UpdateTaskTemplatePatch = Partial<{
  name: string
  description: string | null
}>

export async function updateTaskTemplate(
  id: string,
  patch: UpdateTaskTemplatePatch
): Promise<TaskTemplate> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (patch.name !== undefined) {
    cols.push(`name = $${i++}`)
    vals.push(patch.name.trim())
  }
  if (patch.description !== undefined) {
    cols.push(`description = $${i++}`)
    vals.push(patch.description?.trim() ?? null)
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${TEMPLATES_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (rows.length === 0) throw new Error('Task template not found')
    return rowToTemplate(rows[0]!)
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(
    `UPDATE ${TEMPLATES_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`,
    vals
  )
  await outboxPush(TEMPLATES_TABLE, id, 'update', JSON.stringify(patch))
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TEMPLATES_TABLE} WHERE id = $1`,
    [id]
  )
  return rowToTemplate(rows[0]!)
}

export async function deleteTaskTemplate(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TEMPLATES_TABLE} SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
    [ts, id]
  )
  await outboxPush(TEMPLATES_TABLE, id, 'delete', null)
}

export type CreateTaskTemplateItemData = {
  task_template_id: string
  description: string
  notes?: string | null
  due_offset_days?: number | null
  assigned_department?: string | null
  priority?: 1 | 2 | 3 | null
  section_name?: string | null
  parent_template_item_id?: string | null
  sort_order?: number
}

export async function createTaskTemplateItem(
  data: CreateTaskTemplateItemData
): Promise<TaskTemplateItem> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const sortOrder = data.sort_order ?? 0
  await db.execute(
    `INSERT INTO ${ITEMS_TABLE} (id, task_template_id, description, notes, due_offset_days, assigned_department, priority, section_name, parent_template_item_id, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      data.task_template_id,
      data.description.trim(),
      data.notes?.trim() ?? null,
      data.due_offset_days ?? null,
      data.assigned_department ?? null,
      data.priority ?? null,
      data.section_name?.trim() ?? null,
      data.parent_template_item_id ?? null,
      sortOrder,
      ts,
      ts,
    ]
  )
  await outboxPush(ITEMS_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${ITEMS_TABLE} WHERE id = $1`,
    [id]
  )
  return rowToItem(rows[0]!)
}

export type UpdateTaskTemplateItemPatch = Partial<{
  description: string
  notes: string | null
  due_offset_days: number | null
  assigned_department: string | null
  priority: 1 | 2 | 3 | null
  section_name: string | null
  parent_template_item_id: string | null
  sort_order: number
}>

export async function updateTaskTemplateItem(
  id: string,
  patch: UpdateTaskTemplateItemPatch
): Promise<TaskTemplateItem> {
  const db = await getDb()
  const ts = now()
  const keys = [
    'description',
    'notes',
    'due_offset_days',
    'assigned_department',
    'priority',
    'section_name',
    'parent_template_item_id',
    'sort_order',
  ] as const
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of keys) {
    if (patch[k] !== undefined) {
      const v = patch[k]
      cols.push(`${k} = $${i++}`)
      vals.push(k === 'description' && typeof v === 'string' ? v.trim() : v)
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${ITEMS_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (rows.length === 0) throw new Error('Task template item not found')
    return rowToItem(rows[0]!)
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(
    `UPDATE ${ITEMS_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`,
    vals
  )
  await outboxPush(ITEMS_TABLE, id, 'update', JSON.stringify(patch))
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${ITEMS_TABLE} WHERE id = $1`,
    [id]
  )
  return rowToItem(rows[0]!)
}

export async function deleteTaskTemplateItem(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${ITEMS_TABLE} SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
    [ts, id]
  )
  await outboxPush(ITEMS_TABLE, id, 'delete', null)
}

export type ApplyTaskTemplateParams = {
  productionId: string
  taskTemplateId: string
  /** YYYY-MM-DD. If provided, due_offset_days are applied relative to this date. If omitted, tasks get null due_date. */
  anchorDate?: string | null
}

/**
 * Apply a task template to a production. Creates production_tasks from template items,
 * preserves parent/child structure, creates missing sections, assigns due dates from anchorDate + due_offset_days.
 * Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md.
 */
export async function applyTaskTemplateToProduction(
  params: ApplyTaskTemplateParams
): Promise<void> {
  const { productionId, taskTemplateId, anchorDate } = params

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const ts = now()

    const { items } = await getTaskTemplateWithItems(taskTemplateId)
    if (items.length === 0) return

    const itemById = new Map(items.map((i) => [i.id, i]))
    const byParent = new Map<string | null, TaskTemplateItem[]>()
    byParent.set(null, [])
    for (const i of items) {
      const pid = i.parent_template_item_id && itemById.has(i.parent_template_item_id)
        ? i.parent_template_item_id
        : null
      if (!byParent.has(pid)) byParent.set(pid, [])
      byParent.get(pid)!.push(i)
    }

    function orderedItems(parentId: string | null): TaskTemplateItem[] {
      const children = byParent.get(parentId) ?? []
      const out: TaskTemplateItem[] = []
      for (const c of children) {
        out.push(c)
        out.push(...orderedItems(c.id))
      }
      return out
    }
    const ordered = orderedItems(null)

    const sectionNameToId = new Map<string, string>()
    const existingSections = await db.select<Record<string, unknown>[]>(
      `SELECT id, name FROM ${SECTIONS_TABLE} WHERE production_id = $1 AND deleted_at IS NULL`,
      [productionId]
    )
    for (const s of existingSections) {
      const name = (s.name as string).trim()
      if (name) sectionNameToId.set(name, s.id as string)
    }

    const sectionNamesToCreate = new Set<string>()
    for (const item of ordered) {
      const name = item.section_name?.trim()
      if (name && !sectionNameToId.has(name)) sectionNamesToCreate.add(name)
    }

    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
    ]

    for (const name of sectionNamesToCreate) {
      const sectionId = uuid()
      sectionNameToId.set(name, sectionId)
      statements.push({
        sql: `INSERT INTO ${SECTIONS_TABLE} (id, production_id, name, sort_order, created_at, updated_at) VALUES ($1, $2, $3, 0, $4, $5)`,
        bindValues: [sectionId, productionId, name, ts, ts],
      })
    }

    const templateItemIdToTaskId = new Map<string, string>()
    for (const item of ordered) {
      let dueDate: string | null = null
      if (anchorDate && item.due_offset_days != null) {
        const d = new Date(anchorDate + 'T12:00:00')
        d.setDate(d.getDate() + item.due_offset_days)
        dueDate = d.toISOString().slice(0, 10)
      }
      const sectionId = item.section_name?.trim()
        ? sectionNameToId.get(item.section_name.trim()) ?? null
        : null
      const taskId = uuid()
      templateItemIdToTaskId.set(item.id, taskId)
      const parentTaskId =
        item.parent_template_item_id
          ? templateItemIdToTaskId.get(item.parent_template_item_id) ?? null
          : null
      statements.push({
        sql: `INSERT INTO ${TASKS_TABLE} (id, production_id, description, is_complete, notes, due_date, assigned_department, priority, parent_task_id, section_id, created_at, updated_at) VALUES ($1, $2, $3, FALSE, $4, $5, $6, $7, $8, $9, $10, $11)`,
        bindValues: [
          taskId,
          productionId,
          item.description,
          item.notes ?? null,
          dueDate,
          item.assigned_department ?? null,
          item.priority ?? null,
          parentTaskId,
          sectionId,
          ts,
          ts,
        ],
      })
    }

    const taskIds = Array.from(templateItemIdToTaskId.values())
    const outboxRows = taskIds.map((entityId) => ({
      entity: TASKS_TABLE,
      entityId,
      operation: 'create' as const,
      payloadJson: null as string | null,
    }))
    const outboxStmt = outboxStatementForRows(outboxRows)
    if (outboxStmt) statements.push(outboxStmt)

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}