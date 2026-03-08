import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush, outboxStatementForRow } from '../outbox'
import type { EquipmentList, EquipmentListItem } from '../types'

const LISTS_TABLE = 'equipment_lists'
const ITEMS_TABLE = 'equipment_list_items'

function rowToList(r: Record<string, unknown>): EquipmentList {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shoot_day_id: (r.shoot_day_id as string | null) ?? null,
    name: r.name as string,
    department: (r.department as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function rowToItem(r: Record<string, unknown>): EquipmentListItem {
  return {
    id: r.id as string,
    equipment_list_id: r.equipment_list_id as string,
    equipment_id: r.equipment_id as string,
    sort_order: (r.sort_order as number) ?? 0,
    checked_out: (r.checked_out as number) ?? 0,
    checked_back_in: (r.checked_back_in as number) ?? 0,
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }
}

export async function listEquipmentListsByProduction(productionId: string): Promise<EquipmentList[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${LISTS_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [productionId]
  )
  return rows.map(rowToList)
}

export async function getEquipmentListById(listId: string): Promise<EquipmentList | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${LISTS_TABLE} WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [listId]
  )
  return rows.length > 0 ? rowToList(rows[0]!) : null
}

export async function createEquipmentList(data: {
  production_id: string
  name: string
  shoot_day_id?: string | null
  department?: string | null
  notes?: string | null
}): Promise<EquipmentList> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${LISTS_TABLE} (id, production_id, shoot_day_id, name, department, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      data.production_id,
      data.shoot_day_id ?? null,
      data.name,
      data.department ?? null,
      data.notes ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(LISTS_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${LISTS_TABLE} WHERE id = $1`, [id])
  return rowToList(rows[0]!)
}

export async function updateEquipmentList(
  listId: string,
  data: Partial<Pick<EquipmentList, 'name' | 'shoot_day_id' | 'department' | 'notes'>>
): Promise<EquipmentList> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['name', 'shoot_day_id', 'department', 'notes'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${LISTS_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [listId]
    )
    if (rows.length === 0) throw new Error(`Equipment list not found: ${listId}`)
    return rowToList(rows[0]!)
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, listId)
  await db.execute(
    `UPDATE ${LISTS_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1} AND deleted_at IS NULL`,
    vals
  )
  await outboxPush(LISTS_TABLE, listId, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${LISTS_TABLE} WHERE id = $1`, [listId])
  return rowToList(rows[0]!)
}

export async function deleteEquipmentList(listId: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${LISTS_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, listId]
  )
  await outboxPush(LISTS_TABLE, listId, 'delete', null)
}

export async function listEquipmentListItems(listId: string): Promise<EquipmentListItem[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${ITEMS_TABLE} WHERE equipment_list_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [listId]
  )
  return rows.map(rowToItem)
}

export async function addEquipmentItemToList(data: {
  equipment_list_id: string
  equipment_id: string
  sort_order?: number
  notes?: string | null
}): Promise<EquipmentListItem> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const sortOrder = data.sort_order ?? 0
  await db.execute(
    `INSERT INTO ${ITEMS_TABLE} (id, equipment_list_id, equipment_id, sort_order, checked_out, checked_back_in, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 0, 0, $5, $6, $7)`,
    [id, data.equipment_list_id, data.equipment_id, sortOrder, data.notes ?? null, ts, ts]
  )
  await outboxPush(ITEMS_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${ITEMS_TABLE} WHERE id = $1`, [id])
  return rowToItem(rows[0]!)
}

export async function updateEquipmentListItem(
  itemId: string,
  data: Partial<Pick<EquipmentListItem, 'sort_order' | 'checked_out' | 'checked_back_in' | 'notes'>>
): Promise<EquipmentListItem> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['sort_order', 'checked_out', 'checked_back_in', 'notes'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${ITEMS_TABLE} WHERE id = $1`, [itemId])
    if (rows.length === 0) throw new Error(`Equipment list item not found: ${itemId}`)
    return rowToItem(rows[0]!)
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, itemId)
  await db.execute(
    `UPDATE ${ITEMS_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`,
    vals
  )
  await outboxPush(ITEMS_TABLE, itemId, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${ITEMS_TABLE} WHERE id = $1`, [itemId])
  return rowToItem(rows[0]!)
}

export async function removeEquipmentItemFromList(itemId: string): Promise<void> {
  const db = await getDb()
  await db.execute(`DELETE FROM ${ITEMS_TABLE} WHERE id = $1`, [itemId])
  await outboxPush(ITEMS_TABLE, itemId, 'delete', null)
}

/** Get max sort_order for a list so new items can be appended. */
export async function getMaxSortOrderForList(listId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<{ mx: number | null }[]>(
    `SELECT COALESCE(MAX(sort_order), -1) AS mx FROM ${ITEMS_TABLE} WHERE equipment_list_id = $1`,
    [listId]
  )
  return (rows[0]?.mx ?? -1) + 1
}

/**
 * Reorder list items by assigning sort_order 0, 1, 2, ... to the given item ids in order.
 * Ids must be exactly the set of item ids on the list (no duplicates, no missing).
 */
export async function reorderEquipmentListItems(listId: string, itemIdsInOrder: string[]): Promise<void> {
  if (itemIdsInOrder.length === 0) return
  const db = await getDb()
  const ts = now()
  const statements: Array<{ sql: string; bindValues: unknown[] }> = []
  itemIdsInOrder.forEach((id, index) => {
    statements.push({
      sql: `UPDATE ${ITEMS_TABLE} SET sort_order = $1, updated_at = $2 WHERE id = $3 AND equipment_list_id = $4`,
      bindValues: [index, ts, id, listId],
    })
  })
  if (statements.length === 0) return
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      ...statements,
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}
