import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { Deliverable, TechnicalSpec } from '../types'

const DEL_TABLE = 'deliverables'
const SPEC_TABLE = 'technical_specs'

function rowToDeliverable(r: Record<string, unknown>): Deliverable {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: r.name as string,
    due_date: r.due_date as string | null,
    status: r.status as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function rowToTechnicalSpec(r: Record<string, unknown>): TechnicalSpec {
  return {
    id: r.id as string,
    deliverable_id: r.deliverable_id as string,
    resolution: r.resolution as string | null,
    codec: r.codec as string | null,
    audio: r.audio as string | null,
    captions: r.captions as string | null,
    aspect_ratio: r.aspect_ratio as string | null,
    platform: r.platform as string | null,
    notes: r.notes as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listDeliverablesByProduction(productionId: string): Promise<Deliverable[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${DEL_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY due_date, name`,
    [productionId]
  )
  return rows.map(rowToDeliverable)
}

export async function createDeliverable(data: {
  production_id: string
  name: string
  due_date?: string | null
  status?: string
}): Promise<Deliverable> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${DEL_TABLE} (id, production_id, name, due_date, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, data.production_id, data.name, data.due_date ?? null, data.status ?? 'pending', ts, ts]
  )
  await outboxPush(DEL_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${DEL_TABLE} WHERE id = $1`, [id])
  return rowToDeliverable(rows[0]!)
}

export async function updateDeliverable(
  id: string,
  data: Partial<Pick<Deliverable, 'name' | 'due_date' | 'status'>>
): Promise<Deliverable> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of ['name', 'due_date', 'status'] as const) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${DEL_TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToDeliverable(rows[0]!) : (await listDeliverablesByProduction(''))[0]!
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${DEL_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(DEL_TABLE, id, 'update', JSON.stringify(data))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${DEL_TABLE} WHERE id = $1`, [id])
  return rowToDeliverable(rows[0]!)
}

export async function deleteDeliverable(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${DEL_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(DEL_TABLE, id, 'delete', null)
}

// Technical specs
export async function getTechnicalSpecByDeliverable(deliverableId: string): Promise<TechnicalSpec | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SPEC_TABLE} WHERE deliverable_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [deliverableId]
  )
  return rows.length ? rowToTechnicalSpec(rows[0]!) : null
}

export async function upsertTechnicalSpec(
  deliverableId: string,
  data: Partial<Omit<TechnicalSpec, 'id' | 'deliverable_id' | 'created_at' | 'updated_at' | 'deleted_at'>>
): Promise<TechnicalSpec> {
  const db = await getDb()
  const existing = await getTechnicalSpecByDeliverable(deliverableId)
  const ts = now()
  if (existing) {
    const cols: string[] = []
    const vals: unknown[] = []
    let i = 1
    for (const k of ['resolution', 'codec', 'audio', 'captions', 'aspect_ratio', 'platform', 'notes'] as const) {
      if (data[k] !== undefined) {
        cols.push(`${k} = $${i++}`)
        vals.push(data[k])
      }
    }
    if (cols.length > 0) {
      cols.push(`updated_at = $${i}`)
      vals.push(ts, existing.id)
      await db.execute(`UPDATE ${SPEC_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
      await outboxPush(SPEC_TABLE, existing.id, 'update', JSON.stringify(data))
    }
    return (await getTechnicalSpecByDeliverable(deliverableId))!
  }
  const id = uuid()
  await db.execute(
    `INSERT INTO ${SPEC_TABLE} (id, deliverable_id, resolution, codec, audio, captions, aspect_ratio, platform, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      deliverableId,
      data.resolution ?? null,
      data.codec ?? null,
      data.audio ?? null,
      data.captions ?? null,
      data.aspect_ratio ?? null,
      data.platform ?? null,
      data.notes ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(SPEC_TABLE, id, 'create', JSON.stringify({ deliverable_id: deliverableId, ...data }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${SPEC_TABLE} WHERE id = $1`, [id])
  return rowToTechnicalSpec(rows[0]!)
}
