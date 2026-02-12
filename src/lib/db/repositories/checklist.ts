import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { ChecklistItem } from '../types'

const TABLE = 'checklist_items'

function rowToChecklistItem(r: Record<string, unknown>): ChecklistItem {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    title: r.title as string,
    is_required: (r.is_required as number) ?? 1,
    status: (r.status as ChecklistItem['status']) ?? 'pending',
    sort_order: (r.sort_order as number) ?? 0,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listChecklistByProduction(productionId: string): Promise<ChecklistItem[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY sort_order, title`,
    [productionId]
  )
  return rows.map(rowToChecklistItem)
}

export async function createChecklistItem(data: {
  production_id: string
  title: string
  is_required?: number
  status?: ChecklistItem['status']
  sort_order?: number
}): Promise<ChecklistItem> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, title, is_required, status, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      data.production_id,
      data.title,
      data.is_required ?? 1,
      data.status ?? 'pending',
      data.sort_order ?? 0,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToChecklistItem(rows[0]!)
}

export async function updateChecklistItem(
  id: string,
  data: Partial<Pick<ChecklistItem, 'title' | 'is_required' | 'status' | 'sort_order'>>
): Promise<ChecklistItem> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['title', 'is_required', 'status', 'sort_order'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToChecklistItem(rows[0]!) : (await listChecklistByProduction(''))[0]!
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToChecklistItem(rows[0]!)
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}
