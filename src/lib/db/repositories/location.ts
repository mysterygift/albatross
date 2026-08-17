import { getDb, now, uuid } from '../client'
import { outboxPush } from '../outbox'
import type { Location } from '../types'
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
    permit_fee: r.permit_fee as number | null,
    location_fee: r.location_fee as number | null,
    notes: fields.notes as string | null,
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
      'address' | 'what3words' | 'parking_info' | 'availability_constraints' | 'permit_fee' | 'location_fee' | 'notes'
    >
  >

export async function createLocation(data: LocationInsert): Promise<Location> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const stored: Record<string, unknown> = await isClientEncryptionEnabled(db) ? await encryptLocationFields(data) : data
  await db.execute(
    `INSERT INTO ${TABLE} (id, production_id, name, name_sort_key, booked_status, address, what3words, parking_info, availability_constraints, permit_fee, location_fee, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
      data.permit_fee ?? null,
      data.location_fee ?? null,
      stored.notes ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(TABLE, id, 'create', JSON.stringify({ ...stored, id }))
  return (await getLocationById(id))!
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
    'permit_fee',
    'location_fee',
    'notes',
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
      if (k === 'permit_fee' || k === 'location_fee') {
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

export async function deleteLocation(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TABLE, id, 'delete', null)
}
