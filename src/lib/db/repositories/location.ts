import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { tutorialEmitted } from '@/features/tutorial/engine/events'
import { outboxPush, outboxStatementForRow } from '../outbox'
import type { Location } from '../types'
import { buildDeleteDocumentStatements, listDocumentsByEntity } from './document'
import { isClientEncryptionEnabled } from '@/lib/security/dataEncryptionContext'
import { requireSensitiveDataAccess } from '@/lib/security/sensitiveDataAccess'
import {
  decryptLocationFields,
  encryptLocationFields,
  LOCATION_PROTECTED_FIELDS,
} from '@/lib/security/sensitiveEntityFieldCrypto'

const TABLE = 'locations'

async function rowToLocation(r: Record<string, unknown>, encryptionEnabled: boolean): Promise<Location> {
  const fields = encryptionEnabled ? await decryptLocationFields(r) : r
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    name: fields.name as string,
    booked_status: (r.booked_status as Location['booked_status']) ?? 'unbooked',
    address: fields.address as string | null,
    what3words: fields.what3words as string | null,
    parking_info: fields.parking_info as string | null,
    availability_constraints: fields.availability_constraints as string | null,
    location_fee: r.location_fee as number | null,
    notes: fields.notes as string | null,
    contact_name: fields.contact_name as string | null,
    contact_email: fields.contact_email as string | null,
    contact_phone: fields.contact_phone as string | null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listLocationsByProduction(productionId: string): Promise<Location[]> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND deleted_at IS NULL`,
    [productionId]
  )
  const locations = await Promise.all(rows.map((row) => rowToLocation(row, encryptionEnabled)))
  return locations.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getLocationById(id: string): Promise<Location | null> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? await rowToLocation(rows[0]!, encryptionEnabled) : null
}

type LocationInsert = Pick<Location, 'production_id' | 'name' | 'booked_status'> &
  Partial<
    Pick<
      Location,
      'address' | 'what3words' | 'parking_info' | 'availability_constraints' | 'location_fee' | 'notes' | 'contact_name' | 'contact_email' | 'contact_phone'
    >
  >

export async function createLocation(data: LocationInsert): Promise<Location> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const stored: Record<string, unknown> = await isClientEncryptionEnabled(db) ? await encryptLocationFields(data) : data
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, name, name_sort_key, booked_status, address, what3words, parking_info, availability_constraints, location_fee, notes, contact_name, contact_email, contact_phone, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      data.production_id,
      stored.name,
      stored.name_sort_key ?? null,
      data.booked_status ?? 'unbooked',
      stored.address ?? null,
      stored.what3words ?? null,
      stored.parking_info ?? null,
      stored.availability_constraints ?? null,
      data.location_fee ?? null,
      stored.notes ?? null,
      stored.contact_name ?? null,
      stored.contact_email ?? null,
      stored.contact_phone ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...stored, id }))
  return tutorialEmitted('location.created', data.production_id, (await getLocationById(id))!)
}

export async function updateLocation(
  id: string,
  data: Partial<Omit<Location, 'id' | 'production_id' | 'created_at' | 'updated_at' | 'deleted_at'>>
): Promise<Location> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  const allowed = [
    'name',
    'booked_status',
    'address',
    'what3words',
    'parking_info',
    'availability_constraints',
    'location_fee',
    'notes',
    'contact_name',
    'contact_email',
    'contact_phone',
  ] as const
  const protectedUpdates = Object.fromEntries(
    LOCATION_PROTECTED_FIELDS.filter((field) => data[field] !== undefined).map((field) => [field, data[field]])
  )
  const encryptedAll = Object.keys(protectedUpdates).length > 0 && await isClientEncryptionEnabled(db)
    ? await encryptLocationFields({ name: data.name ?? (await getLocationById(id))?.name ?? '', ...protectedUpdates })
    : protectedUpdates
  const encryptedUpdates: Record<string, unknown> = Object.fromEntries(
    Object.keys(protectedUpdates).map((field) => [field, encryptedAll[field]])
  )
  if (data.name !== undefined && encryptedAll.name_sort_key !== undefined) {
    encryptedUpdates.name_sort_key = encryptedAll.name_sort_key
  }
  for (const k of allowed) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      const raw = data[k]
      if (k === 'location_fee') {
        const n = raw === '' || raw == null ? null : Number(raw)
        vals.push(n == null || Number.isNaN(n) ? null : n)
      } else if ((LOCATION_PROTECTED_FIELDS as readonly string[]).includes(k)) {
        vals.push(encryptedUpdates[k])
      } else {
        vals.push(raw)
      }
    }
  }
  if (data.name !== undefined && encryptedUpdates.name_sort_key !== undefined) {
    cols.push(`name_sort_key = $${i++}`)
    vals.push(encryptedUpdates.name_sort_key)
  }
  if (cols.length === 0) return (await getLocationById(id))!
  cols.push(`updated_at = $${i}`)
  vals.push(ts)
  vals.push(id)
  await db.execute(
    `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`,
    vals
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify({ ...data, ...encryptedUpdates }))
  return (await getLocationById(id))!
}

/** Entity types of documents attached to a location (entity_id = location id). */
const LOCATION_DOCUMENT_ENTITY_TYPES = ['permit', 'location_release'] as const

/**
 * Soft-deletes a location. Because the row is only flagged, the schema's ON DELETE SET NULL never fires,
 * so references are cleared here, in the same transaction: scenes.location_id and
 * stripboard_strips.origin_location_id / destination_location_id. Attached permit and release documents
 * are soft-deleted too. Everything (with outbox rows) commits or rolls back together.
 */
export async function deleteLocation(id: string): Promise<void> {
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const ts = now()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [{ sql: 'BEGIN', bindValues: [] }]

    for (const entityType of LOCATION_DOCUMENT_ENTITY_TYPES) {
      const docs = await listDocumentsByEntity(entityType, id)
      for (const doc of docs) statements.push(...buildDeleteDocumentStatements(doc.id, ts))
    }

    const scenes = await db.select<{ id: string }[]>(
      'SELECT id FROM scenes WHERE location_id = $1',
      [id]
    )
    if (scenes.length > 0) {
      statements.push({
        sql: 'UPDATE scenes SET location_id = NULL, updated_at = $1 WHERE location_id = $2',
        bindValues: [ts, id],
      })
      for (const r of scenes) {
        statements.push(
          outboxStatementForRow({
            entity: 'scenes',
            entityId: r.id,
            operation: 'update',
            payloadJson: JSON.stringify({ location_id: null }),
          })
        )
      }
    }

    const strips = await db.select<{
      id: string
      origin_location_id: string | null
      destination_location_id: string | null
    }[]>(
      'SELECT id, origin_location_id, destination_location_id FROM stripboard_strips WHERE origin_location_id = $1 OR destination_location_id = $1',
      [id]
    )
    if (strips.length > 0) {
      statements.push({
        sql: `UPDATE stripboard_strips
              SET origin_location_id = CASE WHEN origin_location_id = $2 THEN NULL ELSE origin_location_id END,
                  destination_location_id = CASE WHEN destination_location_id = $2 THEN NULL ELSE destination_location_id END,
                  updated_at = $1
              WHERE origin_location_id = $2 OR destination_location_id = $2`,
        bindValues: [ts, id],
      })
      for (const r of strips) {
        const payload: Record<string, null> = {}
        if (r.origin_location_id === id) payload.origin_location_id = null
        if (r.destination_location_id === id) payload.destination_location_id = null
        statements.push(
          outboxStatementForRow({
            entity: 'stripboard_strips',
            entityId: r.id,
            operation: 'update',
            payloadJson: JSON.stringify(payload),
          })
        )
      }
    }

    statements.push({
      sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
      bindValues: [ts, ts, id],
    })
    statements.push(
      outboxStatementForRow({ entity: TABLE, entityId: id, operation: 'delete', payloadJson: null })
    )
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}
