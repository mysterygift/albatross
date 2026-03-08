import { getDb, now, uuid } from '../client'
import { outboxPush, outboxStatementForRow } from '../outbox'
import type { Equipment, EquipmentCategory, EquipmentStatus } from '../types'
import { EQUIPMENT_CATEGORY_LEGACY_MAP, EQUIPMENT_CATEGORY_VALUES } from '../types'

const TABLE = 'equipment'

function normaliseCategory(value: unknown): EquipmentCategory {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!s) return 'other'
  const legacy = EQUIPMENT_CATEGORY_LEGACY_MAP[s]
  if (legacy) return legacy
  if (EQUIPMENT_CATEGORY_VALUES.includes(s as EquipmentCategory)) return s as EquipmentCategory
  return 'other'
}

/** Data shape for creating equipment. Used by buildCreateEquipmentStatements for batch create. */
export type CreateEquipmentData = {
  production_id: string
  name: string
  /** Count of identical units. Defaults to 1 if omitted. */
  quantity?: number
  source_type?: Equipment['source_type']
  vendor?: string | null
  shoot_day_id?: string | null
  notes?: string | null
  category?: EquipmentCategory
  status?: EquipmentStatus
  department?: string | null
  vendor_id?: string | null
  invoice_id?: string | null
  rental_start_date?: string | null
  return_due_date?: string | null
  returned_at?: string | null
  replacement_value?: number | null
  serial_number?: string | null
}

function rowToEquipment(r: Record<string, unknown>): Equipment {
  const q = r.quantity
  const quantity = typeof q === 'number' && Number.isInteger(q) && q >= 1 ? q : 1
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    quantity,
    source_type: (r.source_type as Equipment['source_type']) ?? 'rented',
    vendor: r.vendor as string | null,
    shoot_day_id: r.shoot_day_id as string | null,
    notes: r.notes as string | null,
    item_uuid: r.item_uuid as string,
    category: normaliseCategory(r.category),
    status: (r.status as EquipmentStatus) ?? 'planned',
    department: r.department as string | null,
    vendor_id: r.vendor_id as string | null,
    invoice_id: r.invoice_id as string | null,
    rental_start_date: r.rental_start_date as string | null,
    return_due_date: r.return_due_date as string | null,
    returned_at: r.returned_at as string | null,
    replacement_value: r.replacement_value as number | null,
    serial_number: r.serial_number as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listEquipmentByProduction(productionId: string): Promise<Equipment[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY name`,
    [productionId]
  )
  return rows.map(rowToEquipment)
}

export async function createEquipment(data: {
  production_id: string
  name: string
  quantity?: number
  source_type?: Equipment['source_type']
  vendor?: string | null
  shoot_day_id?: string | null
  notes?: string | null
  category?: EquipmentCategory
  status?: EquipmentStatus
  department?: string | null
  vendor_id?: string | null
  invoice_id?: string | null
  rental_start_date?: string | null
  return_due_date?: string | null
  returned_at?: string | null
  replacement_value?: number | null
  serial_number?: string | null
}): Promise<Equipment> {
  const db = await getDb()
  const id = uuid()
  const itemUuid = uuid()
  const ts = now()
  const quantity = (data.quantity != null && Number.isInteger(data.quantity) && data.quantity >= 1) ? data.quantity : 1
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, name, quantity, source_type, vendor, shoot_day_id, notes, item_uuid, category, status, department, vendor_id, invoice_id, rental_start_date, return_due_date, returned_at, replacement_value, serial_number, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    [
      id,
      data.production_id,
      data.name,
      quantity,
      data.source_type ?? 'rented',
      data.vendor ?? null,
      data.shoot_day_id ?? null,
      data.notes ?? null,
      itemUuid,
      data.category ?? 'other',
      data.status ?? 'planned',
      data.department ?? null,
      data.vendor_id ?? null,
      data.invoice_id ?? null,
      data.rental_start_date ?? null,
      data.return_due_date ?? null,
      data.returned_at ?? null,
      data.replacement_value ?? null,
      data.serial_number ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
  return (await listEquipmentByProduction(data.production_id)).find((e) => e.id === id)!
}

export async function updateEquipment(
  id: string,
  data: Partial<Omit<Equipment, 'id' | 'production_id' | 'created_at' | 'updated_at' | 'deleted_at'>>
): Promise<Equipment> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  const updatableKeys = [
    'name',
    'quantity',
    'source_type',
    'vendor',
    'shoot_day_id',
    'notes',
    'category',
    'status',
    'department',
    'vendor_id',
    'invoice_id',
    'rental_start_date',
    'return_due_date',
    'returned_at',
    'replacement_value',
    'serial_number',
  ] as const
  for (const k of updatableKeys) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      let val = data[k]
      if (k === 'quantity' && (typeof val !== 'number' || !Number.isInteger(val) || val < 1)) val = 1
      vals.push(val)
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToEquipment(rows[0]!) : (await listEquipmentByProduction(''))[0]!
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id])
  return rowToEquipment(rows[0]!)
}

export async function deleteEquipment(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}

/** Get a single equipment item by id (active only). Returns null if not found or soft-deleted. */
export async function getEquipmentById(equipmentId: string): Promise<Equipment | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [equipmentId]
  )
  return rows.length > 0 ? rowToEquipment(rows[0]!) : null
}

const UPDATABLE_KEYS = [
  'name',
  'quantity',
  'source_type',
  'vendor',
  'shoot_day_id',
  'notes',
  'category',
  'status',
  'department',
  'vendor_id',
  'invoice_id',
  'rental_start_date',
  'return_due_date',
  'returned_at',
  'replacement_value',
  'serial_number',
] as const

export type UpdateEquipmentPatch = Partial<
  Omit<Equipment, 'id' | 'production_id' | 'created_at' | 'updated_at' | 'deleted_at'>
>

/**
 * Returns statements to create equipment for use in executeBatch (e.g. with reminder task).
 * Does not include BEGIN/COMMIT. Caller provides id, itemUuid, and ts.
 */
export function buildCreateEquipmentStatements(
  id: string,
  itemUuid: string,
  ts: string,
  data: CreateEquipmentData
): Array<{ sql: string; bindValues: unknown[] }> {
  const quantity = (data.quantity != null && Number.isInteger(data.quantity) && data.quantity >= 1) ? data.quantity : 1
  const insert = {
    sql: `INSERT INTO ${TABLE} (id, production_id, name, quantity, source_type, vendor, shoot_day_id, notes, item_uuid, category, status, department, vendor_id, invoice_id, rental_start_date, return_due_date, returned_at, replacement_value, serial_number, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    bindValues: [
      id,
      data.production_id,
      data.name,
      quantity,
      data.source_type ?? 'rented',
      data.vendor ?? null,
      data.shoot_day_id ?? null,
      data.notes ?? null,
      itemUuid,
      data.category ?? 'other',
      data.status ?? 'planned',
      data.department ?? null,
      data.vendor_id ?? null,
      data.invoice_id ?? null,
      data.rental_start_date ?? null,
      data.return_due_date ?? null,
      data.returned_at ?? null,
      data.replacement_value ?? null,
      data.serial_number ?? null,
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

/**
 * Returns statements to update equipment for use in executeBatch.
 * Does not include BEGIN/COMMIT. Only includes SET for keys present in patch.
 */
export function buildUpdateEquipmentStatements(
  equipmentId: string,
  patch: UpdateEquipmentPatch,
  ts: string
): Array<{ sql: string; bindValues: unknown[] }> {
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of UPDATABLE_KEYS) {
    if (patch[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      let val = patch[k]
      if (k === 'quantity' && (typeof val !== 'number' || !Number.isInteger(val) || val < 1)) val = 1
      vals.push(val)
    }
  }
  if (cols.length === 0) return []
  cols.push(`updated_at = $${i++}`)
  vals.push(ts, equipmentId)
  const update = {
    sql: `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i}`,
    bindValues: vals,
  }
  const outbox = outboxStatementForRow({
    entity: TABLE,
    entityId: equipmentId,
    operation: 'update',
    payloadJson: JSON.stringify(patch),
  })
  return [update, outbox]
}

/**
 * Returns statements to soft-delete equipment for use in executeBatch.
 * Does not include BEGIN/COMMIT.
 */
export function buildSoftDeleteEquipmentStatements(
  equipmentId: string,
  ts: string
): Array<{ sql: string; bindValues: unknown[] }> {
  const update = {
    sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    bindValues: [ts, ts, equipmentId],
  }
  const outbox = outboxStatementForRow({
    entity: TABLE,
    entityId: equipmentId,
    operation: 'delete',
    payloadJson: null,
  })
  return [update, outbox]
}
