import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { getEffectiveDataSourceForProduction, resolveServerPublishContext } from '@/lib/db/projectDataSource'
import {
  remoteGetScene,
  remoteGetShootDay,
  remoteGetShot,
  remoteListScenes,
  remoteListShootDays,
  remoteListShotsByProduction,
  remoteListShotsByScene,
} from '@/lib/server/remote/scheduleRemote'
import { serverRuntimeMutate } from '@/lib/server/serverClient'
import { ServerRequestError } from '@/lib/server/serverErrors'
import { enqueueServerOutbox } from '@/lib/server/serverOutboxRepository'
import { updateLinkedProjectState } from '@/lib/server/linkedProjectRepository'
import { OptimisticConcurrencyConflictError } from '../concurrency'
import {
  outboxPush,
  outboxStatementForRow,
  outboxStatementForRows,
  type OutboxRow,
} from '../outbox'
import type { ShootDay, Scene, Shot, ShotCast, StripboardItem } from '../types'
import { CAMERA_MOVEMENT_VALUES, SHOT_SIZE_VALUES } from '../types'
import {
  getActiveEpisodeByIdForProduction,
} from './episodes'
import { getProductionById } from './production'
import { getPersonById } from './person'
import { getShootDayUnitById, listShootDayUnitsByShootDay } from './shoot-day-units'
import { ensureMainUnit } from './units'
import {
  cleanupStoryboardImagesForDeletedScene,
  cleanupStoryboardImagesForDeletedShot,
  updateStoryboardSceneForMovedShot,
} from './storyboard'
import {
  findShootingBlocIdForProductionDate,
  persistShootDayShootingBlocId,
} from '../shootingBlocAssociation'

const DAY_TABLE = 'shoot_days'
const SDU_TABLE = 'shoot_day_units'
const STRIPBOARD_STRIPS_TABLE = 'stripboard_strips'
const SCENE_TABLE = 'scenes'
const SHOT_TABLE = 'shots'
const STRIP_TABLE = 'stripboard_items'
const SCENE_CAST_TABLE = 'scene_cast'
const SHOT_CAST_TABLE = 'shot_cast'
const DEFAULT_CALL_SORT_INDEX = 1000
const DEFAULT_WRAP_SORT_INDEX = 2000

async function syncMainUnitCallWrapStripsFromShootDay(args: {
  shootDayId: string
  callTime?: string | null
  wrapTime?: string | null
}): Promise<void> {
  const db = await getDb()
  const ts = now()

  if (args.callTime !== undefined) {
    const callRows = await db.select<Record<string, unknown>[]>(
      `
      SELECT s.id
      FROM ${STRIPBOARD_STRIPS_TABLE} s
      INNER JOIN ${SDU_TABLE} sdu ON sdu.id = s.shoot_day_unit_id AND sdu.deleted_at IS NULL
      INNER JOIN units u ON u.id = sdu.unit_id AND u.deleted_at IS NULL
      WHERE s.shoot_day_id = $1
        AND s.strip_type = 'CALL'
        AND s.strip_status = 'SCHEDULED'
        AND s.deleted_at IS NULL
        AND LOWER(u.name) LIKE '%main%'
      `,
      [args.shootDayId]
    )
    const callTitle = args.callTime ? `Call ${args.callTime}` : null
    for (const row of callRows) {
      const stripId = row.id as string
      await db.execute(
        `UPDATE ${STRIPBOARD_STRIPS_TABLE} SET title = $1, description = NULL, updated_at = $2 WHERE id = $3`,
        [callTitle, ts, stripId]
      )
      await outboxPush(
        STRIPBOARD_STRIPS_TABLE,
        stripId,
        'update',
        JSON.stringify({ title: callTitle, description: null })
      )
    }
  }

  if (args.wrapTime !== undefined) {
    const wrapRows = await db.select<Record<string, unknown>[]>(
      `
      SELECT s.id
      FROM ${STRIPBOARD_STRIPS_TABLE} s
      INNER JOIN ${SDU_TABLE} sdu ON sdu.id = s.shoot_day_unit_id AND sdu.deleted_at IS NULL
      INNER JOIN units u ON u.id = sdu.unit_id AND u.deleted_at IS NULL
      WHERE s.shoot_day_id = $1
        AND s.strip_type = 'WRAP'
        AND s.strip_status = 'SCHEDULED'
        AND s.deleted_at IS NULL
        AND LOWER(u.name) LIKE '%main%'
      `,
      [args.shootDayId]
    )
    const wrapTitle = args.wrapTime ? `Wrap ${args.wrapTime}` : null
    for (const row of wrapRows) {
      const stripId = row.id as string
      await db.execute(
        `UPDATE ${STRIPBOARD_STRIPS_TABLE} SET title = $1, description = NULL, updated_at = $2 WHERE id = $3`,
        [wrapTitle, ts, stripId]
      )
      await outboxPush(
        STRIPBOARD_STRIPS_TABLE,
        stripId,
        'update',
        JSON.stringify({ title: wrapTitle, description: null })
      )
    }
  }
}

function rowToShootDay(r: Record<string, unknown>): ShootDay {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shooting_bloc_id: (r.shooting_bloc_id as string | null) ?? null,
    shoot_date: r.shoot_date as string,
    day_number: r.day_number as number | null,
    call_time: r.call_time as string | null,
    wrap_time: (r.wrap_time as string | null) ?? null,
    notes: r.notes as string | null,
    weather_manual: r.weather_manual as string | null,
    meal_times_json: (r.meal_times_json as string | null) ?? null,
    weather_json: (r.weather_json as string | null) ?? null,
    parking_base_address: (r.parking_base_address as string | null) ?? null,
    special_notes: (r.special_notes as string | null) ?? null,
    hospital_name: (r.hospital_name as string | null) ?? null,
    hospital_address: (r.hospital_address as string | null) ?? null,
    police_station_name: (r.police_station_name as string | null) ?? null,
    police_station_address: (r.police_station_address as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function rowToScene(r: Record<string, unknown>): Scene {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    episode_id: (r.episode_id as string | null) ?? null,
    scene_number: r.scene_number as string,
    heading: r.heading as string | null,
    title: (r.title as string | null) ?? null,
    description: r.description as string | null,
    int_ext: (r.int_ext as Scene['int_ext']) ?? null,
    day_night: (r.day_night as Scene['day_night']) ?? null,
    page_eighths: (r.page_eighths as number | null) ?? null,
    location_id: (r.location_id as string | null) ?? null,
    duration_minutes: (r.duration_minutes as number | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function rowToShot(r: Record<string, unknown>): Shot {
  return {
    id: r.id as string,
    scene_id: r.scene_id as string,
    shot_number: r.shot_number as string,
    description: r.description as string | null,
    shot_description: (r.shot_description as string | null) ?? null,
    subject: (r.subject as string | null) ?? null,
    action_description: (r.action_description as string | null) ?? null,
    shot_size: (r.shot_size as Shot['shot_size']) ?? null,
    support: (r.support as string | null) ?? null,
    lens: (r.lens as string | null) ?? null,
    duration_seconds: (r.duration_seconds as number | null) ?? null,
    estimated_shoot_minutes: (r.estimated_shoot_minutes as number | null) ?? null,
    camera_movement: (r.camera_movement as Shot['camera_movement']) ?? null,
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

function rowToStripboardItem(r: Record<string, unknown>): StripboardItem {
  return {
    id: r.id as string,
    shoot_day_id: r.shoot_day_id as string,
    scene_id: r.scene_id as string,
    sort_order: r.sort_order as number,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

/**
 * Returns the next upcoming shoot day (shoot_date >= today) for the production.
 * Used by Dashboard and other read-only consumers. Returns null if none.
 */
export async function getNextShootDayForProduction(productionId: string): Promise<ShootDay | null> {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const days = await listShootDaysByProduction(productionId)
  const next = days.find((d) => d.shoot_date >= today)
  return next ?? null
}

// Shoot days. Order by shoot_date (YYYY-MM-DD string) then id for stable order; no Date parsing to avoid UTC edge cases.
export async function listShootDaysByProduction(productionId: string): Promise<ShootDay[]> {
  const ctx = await resolveServerPublishContext(productionId)
  if (ctx && (await getEffectiveDataSourceForProduction(productionId)) === 'remote_server') {
    return remoteListShootDays(ctx)
  }
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${DAY_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY shoot_date ASC, id ASC`,
    [productionId]
  )
  return rows.map(rowToShootDay)
}

export async function getShootDayById(id: string): Promise<ShootDay | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${DAY_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  if (rows.length) {
    const local = rowToShootDay(rows[0]!)
    const ctx = await resolveServerPublishContext(local.production_id)
    if (ctx && (await getEffectiveDataSourceForProduction(local.production_id)) === 'remote_server') {
      return (await remoteGetShootDay(ctx, id)) ?? local
    }
    return local
  }
  return null
}

export async function createShootDay(data: {
  production_id: string
  shoot_date: string
  day_number?: number | null
  call_time?: string | null
  wrap_time?: string | null
  notes?: string | null
  weather_manual?: string | null
  meal_times_json?: string | null
  weather_json?: string | null
  parking_base_address?: string | null
  special_notes?: string | null
  hospital_name?: string | null
  hospital_address?: string | null
  police_station_name?: string | null
  police_station_address?: string | null
}): Promise<ShootDay> {
  const day = await createShootDayWithDefaultMainUnit({
    productionId: data.production_id,
    shootDate: data.shoot_date,
    callTime: data.call_time ?? null,
    wrapTime: data.wrap_time ?? null,
    notes: data.notes ?? null,
    weatherManual: data.weather_manual ?? null,
  })
  if (data.day_number != null || data.meal_times_json != null || data.weather_json != null ||
      data.parking_base_address != null || data.special_notes != null || data.hospital_name != null ||
      data.hospital_address != null || data.police_station_name != null || data.police_station_address != null) {
    await updateShootDay(day.shootDay.id, {
      day_number: data.day_number ?? undefined,
      meal_times_json: data.meal_times_json ?? undefined,
      weather_json: data.weather_json ?? undefined,
      parking_base_address: data.parking_base_address ?? undefined,
      special_notes: data.special_notes ?? undefined,
      hospital_name: data.hospital_name ?? undefined,
      hospital_address: data.hospital_address ?? undefined,
      police_station_name: data.police_station_name ?? undefined,
      police_station_address: data.police_station_address ?? undefined,
    })
  }
  const createdDay = await getShootDayById(day.shootDay.id)
  if (!createdDay) throw new Error('Shoot day not found after create')
  return createdDay
}

const SHOOT_DAY_UPDATE_KEYS = [
  'shoot_date', 'day_number', 'call_time', 'wrap_time', 'notes', 'weather_manual',
  'meal_times_json', 'weather_json', 'parking_base_address', 'special_notes',
  'hospital_name', 'hospital_address', 'police_station_name', 'police_station_address',
] as const

export async function updateShootDay(
  id: string,
  data: Partial<Pick<ShootDay, (typeof SHOOT_DAY_UPDATE_KEYS)[number]>>,
  options?: { expectedUpdatedAt?: string }
): Promise<ShootDay> {
  const before = await getShootDayById(id)
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of SHOOT_DAY_UPDATE_KEYS) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) return (await getShootDayById(id))!
  cols.push(`updated_at = $${i++}`)
  vals.push(ts)
  let whereSql = `id = $${i++}`
  vals.push(id)
  if (options?.expectedUpdatedAt) {
    whereSql += ` AND updated_at = $${i++}`
    vals.push(options.expectedUpdatedAt)
  }
  const result = await db.execute(`UPDATE ${DAY_TABLE} SET ${cols.join(', ')} WHERE ${whereSql}`, vals)
  if ((result.rowsAffected ?? 0) === 0 && options?.expectedUpdatedAt) {
    throw new OptimisticConcurrencyConflictError({
      entity: DAY_TABLE,
      entityId: id,
      expectedUpdatedAt: options.expectedUpdatedAt,
    })
  }
  await outboxPush(DAY_TABLE, id, 'update', JSON.stringify(data))
  if (data.call_time !== undefined || data.wrap_time !== undefined) {
    await syncMainUnitCallWrapStripsFromShootDay({
      shootDayId: id,
      callTime: data.call_time,
      wrapTime: data.wrap_time,
    })
  }
  if (data.shoot_date !== undefined && before) {
    await persistShootDayShootingBlocId(id, before.production_id, data.shoot_date)
  }
  return (await getShootDayById(id))!
}

export async function deleteShootDay(id: string): Promise<void> {
  const day = await getShootDayById(id)
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${DAY_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(DAY_TABLE, id, 'delete', null)
  if (day) await resequenceShootDays(day.production_id)
}

/**
 * Resequence day_number for all shoot days in a production so that numbering
 * reflects chronological order by shoot_date. Use after any change that reorders
 * dates (move, swap, create, delete). shoot_date is DATE-only "YYYY-MM-DD"
 * (local calendar); sorting by string ASC is safe and avoids timezone/UTC edge cases.
 * Tie-breaker: id ASC for stable order when two days share the same date.
 */
export async function resequenceShootDays(productionId: string): Promise<void> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${DAY_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY shoot_date ASC, id ASC`,
    [productionId]
  )
  if (rows.length === 0) return
  const ts = now()
  const statements: Array<{ sql: string; bindValues: unknown[] }> = [
    { sql: 'BEGIN', bindValues: [] },
  ]
  for (let i = 0; i < rows.length; i++) {
    const id = rows[i]!.id as string
    const dayNumber = i + 1
    statements.push({
      sql: `UPDATE ${DAY_TABLE} SET day_number = $1, updated_at = $2 WHERE id = $3`,
      bindValues: [dayNumber, ts, id],
    })
    statements.push(
      outboxStatementForRow({
        entity: DAY_TABLE,
        entityId: id,
        operation: 'update',
        payloadJson: JSON.stringify({ day_number: dayNumber }),
      })
    )
  }
  statements.push({ sql: 'COMMIT', bindValues: [] })
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    await executeBatch(conn, statements)
  })
}

/**
 * Move a shoot day to a new date. Transactional: if target date already has
 * a shoot day for this production, no change is made and returns { success: false, existingShootDayId }.
 * On success, updates shoot_date and pushes to outbox.
 */
export async function moveShootDayToDate(
  shootDayId: string,
  newDate: string
): Promise<{ success: true } | { success: false; existingShootDayId?: string }> {
  const day = await getShootDayById(shootDayId)
  if (!day) return { success: false }
  if (day.shoot_date === newDate) return { success: true }

  const db = await getDb()
  const ts = now()

  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${DAY_TABLE} WHERE production_id = $1 AND shoot_date = $2 AND deleted_at IS NULL`,
    [day.production_id, newDate]
  )
  if (existing.length > 0) {
    return { success: false, existingShootDayId: existing[0]!.id as string }
  }

  const result = await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements = [
      { sql: 'BEGIN', bindValues: [] as unknown[] },
      {
        sql: `UPDATE ${DAY_TABLE} SET shoot_date = $1, updated_at = $2 WHERE id = $3`,
        bindValues: [newDate, ts, shootDayId],
      },
      outboxStatementForRow({
        entity: DAY_TABLE,
        entityId: shootDayId,
        operation: 'update',
        payloadJson: JSON.stringify({ shoot_date: newDate }),
      }),
      { sql: 'COMMIT', bindValues: [] as unknown[] },
    ]
    await executeBatch(db, statements)
    return { success: true } as const
  })
  if (result.success) {
    await resequenceShootDays(day.production_id)
    await persistShootDayShootingBlocId(shootDayId, day.production_id, newDate)
  }
  return result
}

/**
 * Batch `shoot_date` updates for a shooting-bloc **pure calendar shift**. Does not resolve `shooting_bloc_id`
 * per row; caller must update the bloc row and run `reassignShootDaysAfterShootingBlocRangeChange`.
 */
export async function setShootDayDatesForBlocShiftBatch(
  productionId: string,
  orderedUpdates: { shootDayId: string; newDate: string }[]
): Promise<void> {
  if (orderedUpdates.length === 0) return
  const ts = now()
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [{ sql: 'BEGIN', bindValues: [] }]
    for (const u of orderedUpdates) {
      statements.push({
        sql: `UPDATE ${DAY_TABLE} SET shoot_date = $1, updated_at = $2 WHERE id = $3 AND production_id = $4 AND deleted_at IS NULL`,
        bindValues: [u.newDate, ts, u.shootDayId, productionId],
      })
      statements.push(
        outboxStatementForRow({
          entity: DAY_TABLE,
          entityId: u.shootDayId,
          operation: 'update',
          payloadJson: JSON.stringify({ shoot_date: u.newDate }),
        })
      )
    }
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(conn, statements)
  })
  await resequenceShootDays(productionId)
}

type CreateShootDayWithDefaultMainUnitArgs = {
  productionId: string
  shootDate: string
  callTime?: string | null
  wrapTime?: string | null
  notes?: string | null
  weatherManual?: string | null
  mainUnitId?: string
}

/**
 * Create a new shoot day for the given production and attach a default Main Unit.
 * Also seeds default CALL + WRAP strips so calendar-day call/wrap always map to stripboard.
 */
export async function createShootDayWithDefaultMainUnit(args: CreateShootDayWithDefaultMainUnitArgs): Promise<{ shootDay: ShootDay; mainUnitId: string; shootDayUnitId: string }> {
  const { productionId, shootDate } = args
  if (!productionId) throw new Error('productionId is required')
  if (!shootDate) throw new Error('shootDate is required')

  const mainUnit = args.mainUnitId
    ? { id: args.mainUnitId }
    : await ensureMainUnit(productionId)
  const shootDayId = uuid()
  const shootDayUnitId = uuid()
  const callStripId = uuid()
  const wrapStripId = uuid()
  const ts = now()
  const shootingBlocId = await findShootingBlocIdForProductionDate(productionId, shootDate)

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
      {
        sql: `INSERT INTO ${DAY_TABLE} (id, production_id, shoot_date, day_number, call_time, wrap_time, notes, weather_manual, shooting_bloc_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        bindValues: [
          shootDayId,
          productionId,
          shootDate,
          null,
          args.callTime ?? null,
          args.wrapTime ?? null,
          args.notes ?? null,
          args.weatherManual ?? null,
          shootingBlocId,
          ts,
          ts,
        ],
      },
      outboxStatementForRow({
        entity: DAY_TABLE,
        entityId: shootDayId,
        operation: 'create',
        payloadJson: JSON.stringify({
          production_id: productionId,
          shoot_date: shootDate,
          day_number: null,
          call_time: args.callTime ?? null,
          wrap_time: args.wrapTime ?? null,
          notes: args.notes ?? null,
          weather_manual: args.weatherManual ?? null,
          shooting_bloc_id: shootingBlocId,
          id: shootDayId,
        }),
      }),
      {
        sql: `INSERT INTO ${SDU_TABLE} (id, shoot_day_id, unit_id, is_locked, created_at, updated_at)
             VALUES ($1, $2, $3, FALSE, $4, $5)`,
        bindValues: [shootDayUnitId, shootDayId, mainUnit.id, ts, ts],
      },
      outboxStatementForRow({
        entity: SDU_TABLE,
        entityId: shootDayUnitId,
        operation: 'create',
        payloadJson: JSON.stringify({ shoot_day_id: shootDayId, unit_id: mainUnit.id }),
      }),
      {
        sql: `INSERT INTO ${STRIPBOARD_STRIPS_TABLE} (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, shot_id, title, description, estimated_minutes, sort_index, color_tag, strip_status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'CALL', NULL, NULL, NULL, NULL, NULL, $5, NULL, 'SCHEDULED', $6, $7)`,
        bindValues: [callStripId, productionId, shootDayId, shootDayUnitId, DEFAULT_CALL_SORT_INDEX, ts, ts],
      },
      outboxStatementForRow({
        entity: STRIPBOARD_STRIPS_TABLE,
        entityId: callStripId,
        operation: 'create',
        payloadJson: JSON.stringify({
          id: callStripId,
          production_id: productionId,
          shoot_day_id: shootDayId,
          shoot_day_unit_id: shootDayUnitId,
          strip_type: 'CALL',
          sort_index: DEFAULT_CALL_SORT_INDEX,
          strip_status: 'SCHEDULED',
        }),
      }),
      {
        sql: `INSERT INTO ${STRIPBOARD_STRIPS_TABLE} (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, shot_id, title, description, estimated_minutes, sort_index, color_tag, strip_status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'WRAP', NULL, NULL, NULL, NULL, NULL, $5, NULL, 'SCHEDULED', $6, $7)`,
        bindValues: [wrapStripId, productionId, shootDayId, shootDayUnitId, DEFAULT_WRAP_SORT_INDEX, ts, ts],
      },
      outboxStatementForRow({
        entity: STRIPBOARD_STRIPS_TABLE,
        entityId: wrapStripId,
        operation: 'create',
        payloadJson: JSON.stringify({
          id: wrapStripId,
          production_id: productionId,
          shoot_day_id: shootDayId,
          shoot_day_unit_id: shootDayUnitId,
          strip_type: 'WRAP',
          sort_index: DEFAULT_WRAP_SORT_INDEX,
          strip_status: 'SCHEDULED',
        }),
      }),
      { sql: 'COMMIT', bindValues: [] },
    ]
    await executeBatch(db, statements)
  })

  await resequenceShootDays(productionId)
  const shootDay = await getShootDayById(shootDayId)
  if (!shootDay) throw new Error('Shoot day not found after create')

  return { shootDay, mainUnitId: mainUnit.id, shootDayUnitId }
}

/**
 * Legacy schedule migration: ensure every shoot day unit has both CALL and WRAP strips.
 * Safe to run repeatedly; inserts only missing strips.
 */
export async function ensureCallWrapStripsForProduction(productionId: string): Promise<void> {
  if (!productionId) return
  const db = await getDb()
  const ts = now()
  const dayUnits = await db.select<Record<string, unknown>[]>(
    `SELECT sdu.id AS shoot_day_unit_id, sdu.shoot_day_id
     FROM ${SDU_TABLE} sdu
     INNER JOIN ${DAY_TABLE} sd ON sd.id = sdu.shoot_day_id
     WHERE sd.production_id = $1
       AND sd.deleted_at IS NULL
       AND sdu.deleted_at IS NULL`,
    [productionId]
  )
  if (dayUnits.length === 0) return

  const existingRows = await db.select<Record<string, unknown>[]>(
    `SELECT shoot_day_unit_id, strip_type
     FROM ${STRIPBOARD_STRIPS_TABLE}
     WHERE production_id = $1
       AND deleted_at IS NULL
       AND strip_status = 'SCHEDULED'
       AND strip_type IN ('CALL', 'WRAP')
       AND shoot_day_unit_id IS NOT NULL`,
    [productionId]
  )
  const existingByDayUnit = new Map<string, Set<string>>()
  for (const row of existingRows) {
    const dayUnitId = row.shoot_day_unit_id as string
    const stripType = row.strip_type as string
    const set = existingByDayUnit.get(dayUnitId) ?? new Set<string>()
    set.add(stripType)
    existingByDayUnit.set(dayUnitId, set)
  }

  const statements: Array<{ sql: string; bindValues: unknown[] }> = [{ sql: 'BEGIN', bindValues: [] }]
  for (const du of dayUnits) {
    const shootDayUnitId = du.shoot_day_unit_id as string
    const shootDayId = du.shoot_day_id as string
    const existing = existingByDayUnit.get(shootDayUnitId) ?? new Set<string>()
    if (!existing.has('CALL')) {
      const callStripId = uuid()
      statements.push(
        {
          sql: `INSERT INTO ${STRIPBOARD_STRIPS_TABLE} (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, shot_id, title, description, estimated_minutes, sort_index, color_tag, strip_status, created_at, updated_at)
                VALUES ($1, $2, $3, $4, 'CALL', NULL, NULL, NULL, NULL, NULL, $5, NULL, 'SCHEDULED', $6, $7)`,
          bindValues: [callStripId, productionId, shootDayId, shootDayUnitId, DEFAULT_CALL_SORT_INDEX, ts, ts],
        },
        outboxStatementForRow({
          entity: STRIPBOARD_STRIPS_TABLE,
          entityId: callStripId,
          operation: 'create',
          payloadJson: JSON.stringify({
            id: callStripId,
            production_id: productionId,
            shoot_day_id: shootDayId,
            shoot_day_unit_id: shootDayUnitId,
            strip_type: 'CALL',
            sort_index: DEFAULT_CALL_SORT_INDEX,
            strip_status: 'SCHEDULED',
          }),
        })
      )
    }
    if (!existing.has('WRAP')) {
      const wrapStripId = uuid()
      statements.push(
        {
          sql: `INSERT INTO ${STRIPBOARD_STRIPS_TABLE} (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, shot_id, title, description, estimated_minutes, sort_index, color_tag, strip_status, created_at, updated_at)
                VALUES ($1, $2, $3, $4, 'WRAP', NULL, NULL, NULL, NULL, NULL, $5, NULL, 'SCHEDULED', $6, $7)`,
          bindValues: [wrapStripId, productionId, shootDayId, shootDayUnitId, DEFAULT_WRAP_SORT_INDEX, ts, ts],
        },
        outboxStatementForRow({
          entity: STRIPBOARD_STRIPS_TABLE,
          entityId: wrapStripId,
          operation: 'create',
          payloadJson: JSON.stringify({
            id: wrapStripId,
            production_id: productionId,
            shoot_day_id: shootDayId,
            shoot_day_unit_id: shootDayUnitId,
            strip_type: 'WRAP',
            sort_index: DEFAULT_WRAP_SORT_INDEX,
            strip_status: 'SCHEDULED',
          }),
        })
      )
    }
  }
  statements.push({ sql: 'COMMIT', bindValues: [] })
  if (statements.length <= 2) return
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    await executeBatch(conn, statements)
  })
}

export type MoveShootDayUnitResult =
  | { success: true }
  | { success: false; reason: 'not_found' }
  | { success: false; reason: 'conflict'; existingShootDayId: string }

/**
 * Move a single shoot day unit to a new date. If the shoot day has only one unit,
 * updates the shoot_day date. If it has multiple units, creates a new shoot_day
 * on newDate and moves only this unit (and its strips) there.
 * Returns { success: false, reason: 'conflict', existingShootDayId } if newDate already has a shoot.
 */
export async function moveShootDayUnitToDate(
  shootDayUnitId: string,
  newDate: string
): Promise<MoveShootDayUnitResult> {
  const unit = await getShootDayUnitById(shootDayUnitId)
  if (!unit) return { success: false, reason: 'not_found' }

  const day = await getShootDayById(unit.shoot_day_id)
  if (!day) return { success: false, reason: 'not_found' }
  if (day.shoot_date === newDate) return { success: true }

  const db = await getDb()
  const ts = now()

  const unitsOnDay = await listShootDayUnitsByShootDay(day.id)
  const isSingleUnit = unitsOnDay.length === 1

  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${DAY_TABLE} WHERE production_id = $1 AND shoot_date = $2 AND deleted_at IS NULL`,
    [day.production_id, newDate]
  )
  if (existing.length > 0) {
    return { success: false, reason: 'conflict', existingShootDayId: existing[0]!.id as string }
  }

  const shootingBlocIdForNewDay = await findShootingBlocIdForProductionDate(day.production_id, newDate)

  const result = await runInSerializedTransaction(async () => {
    const db = await getDb()
    if (isSingleUnit) {
      const statements = [
        { sql: 'BEGIN', bindValues: [] as unknown[] },
        {
          sql: `UPDATE ${DAY_TABLE} SET shoot_date = $1, updated_at = $2 WHERE id = $3`,
          bindValues: [newDate, ts, day.id],
        },
        outboxStatementForRow({
          entity: DAY_TABLE,
          entityId: day.id,
          operation: 'update',
          payloadJson: JSON.stringify({ shoot_date: newDate }),
        }),
        { sql: 'COMMIT', bindValues: [] as unknown[] },
      ]
      await executeBatch(db, statements)
    } else {
      const newShootDayId = uuid()
      const stripsToMove = await db.select<Record<string, unknown>[]>(
        `SELECT id FROM ${STRIPBOARD_STRIPS_TABLE} WHERE shoot_day_unit_id = $1 AND deleted_at IS NULL`,
        [shootDayUnitId]
      )
      const unitsLeft = await db.select<Record<string, unknown>[]>(
        `SELECT id FROM ${SDU_TABLE} WHERE shoot_day_id = $1 AND deleted_at IS NULL`,
        [day.id]
      )
      const stripOutboxRows: OutboxRow[] = stripsToMove.map((row) => ({
        entity: STRIPBOARD_STRIPS_TABLE,
        entityId: row.id as string,
        operation: 'update' as const,
        payloadJson: JSON.stringify({ shoot_day_id: newShootDayId }),
      }))
      const stripOutboxStmt = outboxStatementForRows(stripOutboxRows)
      const statements: Array<{ sql: string; bindValues: unknown[] }> = [
        { sql: 'BEGIN', bindValues: [] },
        {
          sql: `INSERT INTO ${DAY_TABLE} (id, production_id, shoot_date, day_number, call_time, wrap_time, notes, weather_manual, meal_times_json, shooting_bloc_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          bindValues: [
            newShootDayId,
            day.production_id,
            newDate,
            day.day_number ?? null,
            day.call_time ?? null,
            day.wrap_time ?? null,
            day.notes ?? null,
            day.weather_manual ?? null,
            day.meal_times_json ?? null,
            shootingBlocIdForNewDay,
            ts,
            ts,
          ],
        },
        outboxStatementForRow({
          entity: DAY_TABLE,
          entityId: newShootDayId,
          operation: 'create',
          payloadJson: JSON.stringify({
            production_id: day.production_id,
            shoot_date: newDate,
            day_number: day.day_number,
            call_time: day.call_time,
            wrap_time: day.wrap_time,
            notes: day.notes,
            weather_manual: day.weather_manual,
            meal_times_json: day.meal_times_json,
            shooting_bloc_id: shootingBlocIdForNewDay,
            id: newShootDayId,
          }),
        }),
        {
          sql: `UPDATE ${SDU_TABLE} SET shoot_day_id = $1, updated_at = $2 WHERE id = $3`,
          bindValues: [newShootDayId, ts, shootDayUnitId],
        },
        outboxStatementForRow({
          entity: SDU_TABLE,
          entityId: shootDayUnitId,
          operation: 'update',
          payloadJson: JSON.stringify({ shoot_day_id: newShootDayId }),
        }),
        {
          sql: `UPDATE ${STRIPBOARD_STRIPS_TABLE} SET shoot_day_id = $1, updated_at = $2 WHERE shoot_day_unit_id = $3 AND deleted_at IS NULL`,
          bindValues: [newShootDayId, ts, shootDayUnitId],
        },
      ]
      if (stripOutboxStmt) statements.push(stripOutboxStmt)
      // unitsLeft is queried before we move the unit; the only unit on the source day is the one we're moving.
      if (unitsLeft.length === 1) {
        statements.push(
          {
            sql: `UPDATE ${DAY_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
            bindValues: [ts, ts, day.id],
          },
          outboxStatementForRow({
            entity: DAY_TABLE,
            entityId: day.id,
            operation: 'delete',
            payloadJson: null,
          })
        )
      }
      statements.push({ sql: 'COMMIT', bindValues: [] })
      await executeBatch(db, statements)
    }
    return { success: true } as const
  })
  if (result.success) {
    await resequenceShootDays(day.production_id)
    if (isSingleUnit) {
      await persistShootDayShootingBlocId(day.id, day.production_id, newDate)
    }
  }
  return result
}

/**
 * Merge the dragged unit (and its strips) into the existing shoot day.
 * Existing day's call/lunch/wrap times are preserved. If existing day has a unit
 * with the same unit_id, strips are moved to that unit and the dragged unit is deleted.
 * Otherwise the dragged unit is reassigned to the existing day. Source day is
 * soft-deleted if it has no units left.
 */
export async function mergeShootDayUnitIntoDay(
  shootDayUnitId: string,
  existingShootDayId: string
): Promise<void> {
  const unit = await getShootDayUnitById(shootDayUnitId)
  if (!unit) throw new Error('Shoot day unit not found')
  const sourceShootDayId = unit.shoot_day_id
  if (sourceShootDayId === existingShootDayId) return

  const existingUnits = await listShootDayUnitsByShootDay(existingShootDayId)
  const existingByUnitId = new Map(existingUnits.map((u) => [u.unit_id, u]))
  const ts = now()

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const existingUnit = existingByUnitId.get(unit.unit_id)
    const strips = await db.select<Record<string, unknown>[]>(
      `SELECT id FROM ${STRIPBOARD_STRIPS_TABLE} WHERE shoot_day_unit_id = $1 AND deleted_at IS NULL`,
      [shootDayUnitId]
    )
    const unitsLeft = await db.select<Record<string, unknown>[]>(
      `SELECT id FROM ${SDU_TABLE} WHERE shoot_day_id = $1 AND deleted_at IS NULL`,
      [sourceShootDayId]
    )
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [{ sql: 'BEGIN', bindValues: [] }]
    if (existingUnit) {
      const stripOutboxRowsA: OutboxRow[] = strips.map((row) => ({
        entity: STRIPBOARD_STRIPS_TABLE,
        entityId: row.id as string,
        operation: 'update' as const,
        payloadJson: JSON.stringify({ shoot_day_id: existingShootDayId, shoot_day_unit_id: existingUnit.id }),
      }))
      statements.push(
        {
          sql: `UPDATE ${STRIPBOARD_STRIPS_TABLE} SET shoot_day_id = $1, shoot_day_unit_id = $2, updated_at = $3 WHERE shoot_day_unit_id = $4 AND deleted_at IS NULL`,
          bindValues: [existingShootDayId, existingUnit.id, ts, shootDayUnitId],
        }
      )
      const stripStmtA = outboxStatementForRows(stripOutboxRowsA)
      if (stripStmtA) statements.push(stripStmtA)
      statements.push(
        {
          sql: `UPDATE ${SDU_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
          bindValues: [ts, ts, shootDayUnitId],
        },
        outboxStatementForRow({
          entity: SDU_TABLE,
          entityId: shootDayUnitId,
          operation: 'delete',
          payloadJson: null,
        })
      )
    } else {
      statements.push(
        {
          sql: `UPDATE ${SDU_TABLE} SET shoot_day_id = $1, updated_at = $2 WHERE id = $3`,
          bindValues: [existingShootDayId, ts, shootDayUnitId],
        },
        outboxStatementForRow({
          entity: SDU_TABLE,
          entityId: shootDayUnitId,
          operation: 'update',
          payloadJson: JSON.stringify({ shoot_day_id: existingShootDayId }),
        }),
        {
          sql: `UPDATE ${STRIPBOARD_STRIPS_TABLE} SET shoot_day_id = $1, updated_at = $2 WHERE shoot_day_unit_id = $3 AND deleted_at IS NULL`,
          bindValues: [existingShootDayId, ts, shootDayUnitId],
        }
      )
      const stripStmt = outboxStatementForRows(
        strips.map((row) => ({
          entity: STRIPBOARD_STRIPS_TABLE,
          entityId: row.id as string,
          operation: 'update' as const,
          payloadJson: JSON.stringify({ shoot_day_id: existingShootDayId }),
        }))
      )
      if (stripStmt) statements.push(stripStmt)
    }
    // unitsLeft is queried before we move/delete the unit; the only unit on the source day is the one we're merging.
    if (unitsLeft.length === 1) {
      statements.push(
        {
          sql: `UPDATE ${DAY_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
          bindValues: [ts, ts, sourceShootDayId],
        },
        outboxStatementForRow({
          entity: DAY_TABLE,
          entityId: sourceShootDayId,
          operation: 'delete',
          payloadJson: null,
        })
      )
    }
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
  const existingDay = await getShootDayById(existingShootDayId)
  if (existingDay) await resequenceShootDays(existingDay.production_id)
}

/**
 * Swap shoot_date of two shoot days. Each day's call/lunch/wrap times are preserved.
 */
export async function swapShootDays(shootDayIdA: string, shootDayIdB: string): Promise<void> {
  if (shootDayIdA === shootDayIdB) return
  const dayA = await getShootDayById(shootDayIdA)
  const dayB = await getShootDayById(shootDayIdB)
  if (!dayA || !dayB) throw new Error('Shoot day not found')
  const dateA = dayA.shoot_date
  const dateB = dayB.shoot_date
  if (dateA === dateB) return

  const ts = now()
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const statements = [
      { sql: 'BEGIN', bindValues: [] as unknown[] },
      {
        sql: `UPDATE ${DAY_TABLE} SET shoot_date = $1, updated_at = $2 WHERE id = $3`,
        bindValues: [dateB, ts, shootDayIdA],
      },
      outboxStatementForRow({
        entity: DAY_TABLE,
        entityId: shootDayIdA,
        operation: 'update',
        payloadJson: JSON.stringify({ shoot_date: dateB }),
      }),
      {
        sql: `UPDATE ${DAY_TABLE} SET shoot_date = $1, updated_at = $2 WHERE id = $3`,
        bindValues: [dateA, ts, shootDayIdB],
      },
      outboxStatementForRow({
        entity: DAY_TABLE,
        entityId: shootDayIdB,
        operation: 'update',
        payloadJson: JSON.stringify({ shoot_date: dateA }),
      }),
      { sql: 'COMMIT', bindValues: [] as unknown[] },
    ]
    await executeBatch(db, statements)
  })
  await resequenceShootDays(dayA.production_id)
  await persistShootDayShootingBlocId(shootDayIdA, dayA.production_id, dateB)
  await persistShootDayShootingBlocId(shootDayIdB, dayB.production_id, dateA)
}

// Scenes
export async function listScenesByProduction(productionId: string): Promise<Scene[]> {
  const ctx = await resolveServerPublishContext(productionId)
  if (ctx && (await getEffectiveDataSourceForProduction(productionId)) === 'remote_server') {
    return remoteListScenes(ctx)
  }
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SCENE_TABLE} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY scene_number`,
    [productionId]
  )
  return rows.map(rowToScene)
}

export async function getSceneById(id: string, opts?: { productionId?: string }): Promise<Scene | null> {
  let productionId = opts?.productionId
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SCENE_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  if (rows.length) {
    const local = rowToScene(rows[0]!)
    productionId = productionId ?? local.production_id
    const ctx = productionId ? await resolveServerPublishContext(productionId) : null
    if (ctx && productionId && (await getEffectiveDataSourceForProduction(productionId)) === 'remote_server') {
      return (await remoteGetScene(ctx, id)) ?? local
    }
    return local
  }
  if (productionId) {
    const ctx = await resolveServerPublishContext(productionId)
    if (ctx && (await getEffectiveDataSourceForProduction(productionId)) === 'remote_server') {
      return remoteGetScene(ctx, id)
    }
  }
  return null
}

export async function createScene(data: {
  production_id: string
  scene_number: string
  heading?: string | null
  title?: string | null
  description?: string | null
  int_ext?: Scene['int_ext']
  day_night?: Scene['day_night']
  page_eighths?: number | null
  location_id?: string | null
  duration_minutes?: number | null
  episode_id?: string | null
}): Promise<Scene> {
  const prod = await getProductionById(data.production_id)
  if (!prod) throw new Error('Production not found')

  let episodeId: string | null = null
  if (prod.is_episodic) {
    const raw = data.episode_id?.trim() ?? ''
    if (!raw) throw new Error('Episodic productions require an episode for each scene.')
    const ep = await getActiveEpisodeByIdForProduction(data.production_id, raw)
    if (!ep) throw new Error('Episode not found or archived.')
    episodeId = raw
  } else if (data.episode_id != null && String(data.episode_id).trim() !== '') {
    throw new Error('Episode cannot be set for non-episodic productions.')
  }

  const rctx = await resolveServerPublishContext(data.production_id)
  if (rctx && (await getEffectiveDataSourceForProduction(data.production_id)) === 'remote_server') {
    const remoteId = uuid()
    const ts = now()
    const body = {
      id: remoteId,
      production_id: data.production_id,
      scene_number: data.scene_number,
      heading: data.heading ?? null,
      description: data.description ?? null,
      title: data.title ?? null,
      int_ext: data.int_ext ?? null,
      day_night: data.day_night ?? null,
      page_eighths: data.page_eighths ?? null,
      location_id: data.location_id ?? null,
      duration_minutes: data.duration_minutes ?? null,
      episode_id: episodeId,
      created_at: ts,
      updated_at: ts,
    }
    try {
      const row = await serverRuntimeMutate(
        rctx.baseUrl,
        rctx.token,
        rctx.remoteProjectId,
        'POST',
        'scenes',
        null,
        body,
        null,
      )
      return rowToScene(row as Record<string, unknown>)
    } catch (e) {
      if (e instanceof ServerRequestError) {
        if (e.kind === 'network') {
          await updateLinkedProjectState(data.production_id, 'offline')
          await enqueueServerOutbox({
            production_id: data.production_id,
            entity_table: SCENE_TABLE,
            entity_id: remoteId,
            operation: 'create',
            payload_json: JSON.stringify(body),
            expected_updated_at: null,
          })
        }
        if (e.kind === 'conflict') {
          await updateLinkedProjectState(data.production_id, 'conflict', new Date().toISOString())
        }
      }
      throw e
    }
  }

  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${SCENE_TABLE} (id, production_id, scene_number, heading, description, title, int_ext, day_night, page_eighths, location_id, duration_minutes, episode_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      data.production_id,
      data.scene_number,
      data.heading ?? null,
      data.description ?? null,
      data.title ?? null,
      data.int_ext ?? null,
      data.day_night ?? null,
      data.page_eighths ?? null,
      data.location_id ?? null,
      data.duration_minutes ?? null,
      episodeId,
      ts,
      ts,
    ]
  )
  await outboxPush(SCENE_TABLE, id, 'create', JSON.stringify({ ...data, id, episode_id: episodeId }))
  return (await getSceneById(id))!
}

const SCENE_UPDATE_KEYS = [
  'scene_number',
  'heading',
  'title',
  'description',
  'int_ext',
  'day_night',
  'page_eighths',
  'location_id',
  'duration_minutes',
  'episode_id',
] as const

export async function updateScene(
  id: string,
  data: Partial<Pick<Scene, (typeof SCENE_UPDATE_KEYS)[number]>>,
  options?: { expectedUpdatedAt?: string }
): Promise<Scene> {
  const existing = await getSceneById(id)
  if (!existing) throw new Error('Scene not found')
  const prod = await getProductionById(existing.production_id)
  if (!prod) throw new Error('Production not found')

  if (data.episode_id !== undefined) {
    if (!prod.is_episodic) {
      throw new Error('Episode cannot be set for non-episodic productions.')
    }
    if (data.episode_id === null) {
      throw new Error('Episodic scenes must stay assigned to an episode.')
    }
    if (data.episode_id !== existing.episode_id) {
      const ep = await getActiveEpisodeByIdForProduction(existing.production_id, data.episode_id)
      if (!ep) throw new Error('Episode not found or archived.')
    }
  }

  const rctx = await resolveServerPublishContext(existing.production_id)
  if (rctx && (await getEffectiveDataSourceForProduction(existing.production_id)) === 'remote_server') {
    const keys = SCENE_UPDATE_KEYS.filter((k) => data[k] !== undefined)
    if (keys.length === 0) return existing
    const patch = Object.fromEntries(keys.map((k) => [k, data[k]]))
    try {
      const row = await serverRuntimeMutate(
        rctx.baseUrl,
        rctx.token,
        rctx.remoteProjectId,
        'PATCH',
        'scenes',
        id,
        patch,
        options?.expectedUpdatedAt ?? existing.updated_at,
      )
      return rowToScene(row as Record<string, unknown>)
    } catch (e) {
      if (e instanceof ServerRequestError) {
        if (e.kind === 'network') {
          await updateLinkedProjectState(existing.production_id, 'offline')
          await enqueueServerOutbox({
            production_id: existing.production_id,
            entity_table: SCENE_TABLE,
            entity_id: id,
            operation: 'update',
            payload_json: JSON.stringify({ ...patch }),
            expected_updated_at: options?.expectedUpdatedAt ?? existing.updated_at,
          })
        }
        if (e.kind === 'conflict') {
          await updateLinkedProjectState(existing.production_id, 'conflict', new Date().toISOString())
        }
      }
      throw e
    }
  }

  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of SCENE_UPDATE_KEYS) {
    if (data[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(data[k])
    }
  }
  if (cols.length === 0) return existing
  cols.push(`updated_at = $${i++}`)
  vals.push(ts)
  let whereSql = `id = $${i++}`
  vals.push(id)
  if (options?.expectedUpdatedAt) {
    whereSql += ` AND updated_at = $${i++}`
    vals.push(options.expectedUpdatedAt)
  }
  const result = await db.execute(`UPDATE ${SCENE_TABLE} SET ${cols.join(', ')} WHERE ${whereSql}`, vals)
  if ((result.rowsAffected ?? 0) === 0 && options?.expectedUpdatedAt) {
    throw new OptimisticConcurrencyConflictError({
      entity: SCENE_TABLE,
      entityId: id,
      expectedUpdatedAt: options.expectedUpdatedAt,
    })
  }
  await outboxPush(SCENE_TABLE, id, 'update', JSON.stringify(data))
  return (await getSceneById(id))!
}

export async function deleteScene(id: string): Promise<void> {
  const existing = await getSceneById(id)
  const rctx = existing ? await resolveServerPublishContext(existing.production_id) : null
  if (
    existing &&
    rctx &&
    (await getEffectiveDataSourceForProduction(existing.production_id)) === 'remote_server'
  ) {
    try {
      await serverRuntimeMutate(
        rctx.baseUrl,
        rctx.token,
        rctx.remoteProjectId,
        'DELETE',
        'scenes',
        id,
        null,
        existing.updated_at,
      )
    } catch (e) {
      if (e instanceof ServerRequestError) {
        if (e.kind === 'network') {
          await updateLinkedProjectState(existing.production_id, 'offline')
          await enqueueServerOutbox({
            production_id: existing.production_id,
            entity_table: SCENE_TABLE,
            entity_id: id,
            operation: 'delete',
            payload_json: null,
            expected_updated_at: existing.updated_at,
          })
        }
        if (e.kind === 'conflict') {
          await updateLinkedProjectState(existing.production_id, 'conflict', new Date().toISOString())
        }
      }
      throw e
    }
    await cleanupStoryboardImagesForDeletedScene(id)
    return
  }

  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${SCENE_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(SCENE_TABLE, id, 'delete', null)
  await cleanupStoryboardImagesForDeletedScene(id)
}

const EPISODES_TABLE = 'episodes'

/**
 * Episode context for a shot is always derived from the parent scene (`scenes.episode_id`).
 * Shots do not store episode_id; do not add a separate shot-level assignment path.
 */
export type ShotEpisodeContext = {
  shot_id: string
  scene_id: string
  episode_id: string | null
  episode_name: string | null
  episode_deleted_at: string | null
}

export async function getShotEpisodeContext(shotId: string): Promise<ShotEpisodeContext | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT sh.id AS shot_id, sh.scene_id AS scene_id, sc.episode_id AS episode_id,
            e.name AS episode_name, e.deleted_at AS episode_deleted_at
     FROM ${SHOT_TABLE} sh
     INNER JOIN ${SCENE_TABLE} sc ON sc.id = sh.scene_id AND sc.deleted_at IS NULL
     LEFT JOIN ${EPISODES_TABLE} e ON e.id = sc.episode_id AND e.production_id = sc.production_id
     WHERE sh.id = $1 AND sh.deleted_at IS NULL`,
    [shotId]
  )
  if (!rows.length) return null
  const r = rows[0]!
  return {
    shot_id: r.shot_id as string,
    scene_id: r.scene_id as string,
    episode_id: (r.episode_id as string | null) ?? null,
    episode_name: (r.episode_name as string | null) ?? null,
    episode_deleted_at: (r.episode_deleted_at as string | null) ?? null,
  }
}

// Shots
export async function listShotsByScene(sceneId: string, opts?: { productionId?: string }): Promise<Shot[]> {
  const scene = opts?.productionId
    ? await getSceneById(sceneId, { productionId: opts.productionId })
    : await getSceneById(sceneId)
  const ctx = scene ? await resolveServerPublishContext(scene.production_id) : null
  if (scene && ctx && (await getEffectiveDataSourceForProduction(scene.production_id)) === 'remote_server') {
    return remoteListShotsByScene(ctx, sceneId)
  }
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SHOT_TABLE} WHERE scene_id = $1 AND deleted_at IS NULL ORDER BY shot_number`,
    [sceneId]
  )
  return rows.map(rowToShot)
}

/** All shots for a production (for Shot List and stripboard unscheduled). */
export async function listShotsByProduction(productionId: string): Promise<Shot[]> {
  const rctx = await resolveServerPublishContext(productionId)
  if (rctx && (await getEffectiveDataSourceForProduction(productionId)) === 'remote_server') {
    return remoteListShotsByProduction(rctx)
  }
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT s.* FROM ${SHOT_TABLE} s INNER JOIN ${SCENE_TABLE} sc ON sc.id = s.scene_id AND sc.production_id = $1 AND sc.deleted_at IS NULL WHERE s.deleted_at IS NULL ORDER BY sc.scene_number, s.shot_number`,
    [productionId]
  )
  return rows.map(rowToShot)
}

export async function getShotById(id: string, opts?: { productionId?: string }): Promise<Shot | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SHOT_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  if (rows.length) {
    const local = rowToShot(rows[0]!)
    const scene = await getSceneById(local.scene_id, opts?.productionId ? { productionId: opts.productionId } : undefined)
    const prodId = scene?.production_id ?? opts?.productionId
    const ctx = prodId ? await resolveServerPublishContext(prodId) : null
    if (ctx && prodId && (await getEffectiveDataSourceForProduction(prodId)) === 'remote_server') {
      return (await remoteGetShot(ctx, id)) ?? local
    }
    return local
  }
  if (opts?.productionId) {
    const ctx = await resolveServerPublishContext(opts.productionId)
    if (ctx && (await getEffectiveDataSourceForProduction(opts.productionId)) === 'remote_server') {
      return remoteGetShot(ctx, id)
    }
  }
  return null
}

/** Per-shot estimated minutes (shot.estimated_shoot_minutes). Used for stripboard day totals. */
export async function getEstimatedShootMinutesByShotIds(shotIds: string[]): Promise<Map<string, number>> {
  if (shotIds.length === 0) return new Map()
  const db = await getDb()
  const placeholders = shotIds.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id, COALESCE(estimated_shoot_minutes, 0) AS mins FROM ${SHOT_TABLE} WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    shotIds
  )
  const map = new Map<string, number>()
  for (const r of rows) {
    const id = r.id as string
    const mins = Number(r.mins) || 0
    map.set(id, mins)
  }
  return map
}

/** Sum of estimated_shoot_minutes per scene (time to get shots in practice). Used for stripboard day duration. */
export async function getEstimatedShootMinutesBySceneIds(sceneIds: string[]): Promise<Map<string, number>> {
  if (sceneIds.length === 0) return new Map()
  const db = await getDb()
  const placeholders = sceneIds.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT scene_id, COALESCE(SUM(estimated_shoot_minutes), 0) AS total FROM ${SHOT_TABLE}
     WHERE scene_id IN (${placeholders}) AND deleted_at IS NULL GROUP BY scene_id`,
    sceneIds
  )
  const map = new Map<string, number>()
  for (const r of rows) {
    const id = r.scene_id as string
    const total = Number(r.total) || 0
    map.set(id, total)
  }
  return map
}

function rowToShotCast(r: Record<string, unknown>): ShotCast {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shot_id: r.shot_id as string,
    person_id: r.person_id as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

/** Input for {@link createShot}. Cast is optional; when provided, rows are written to `shot_cast` (and `scene_cast` when needed). */
export type CreateShotInput = {
  scene_id: string
  shot_number: string
  description?: string | null
  shot_description?: string | null
  subject?: string | null
  action_description?: string | null
  shot_size?: Shot['shot_size']
  support?: string | null
  lens?: string | null
  duration_seconds?: number | null
  estimated_shoot_minutes?: number | null
  camera_movement?: Shot['camera_movement']
  notes?: string | null
  /** People (cast) to attach via `shot_cast`; must belong to the scene’s production. Scene cast is ensured automatically. */
  person_ids?: string[]
}

export type CreateShotResult = {
  shot: Shot
  /** `shot_cast` rows created in the same operation as the shot (empty if `person_ids` omitted or empty). */
  shotCast: ShotCast[]
}

function validateShotFieldEnums(data: Pick<CreateShotInput, 'shot_size' | 'camera_movement'>): void {
  if (data.shot_size != null && !(SHOT_SIZE_VALUES as readonly string[]).includes(data.shot_size)) {
    throw new Error(`Invalid shot_size: ${String(data.shot_size)}`)
  }
  if (
    data.camera_movement != null &&
    !(CAMERA_MOVEMENT_VALUES as readonly string[]).includes(data.camera_movement)
  ) {
    throw new Error(`Invalid camera_movement: ${String(data.camera_movement)}`)
  }
}

/**
 * Create a shot in a scene. Validates scene existence, shot number (required), optional enums and
 * integers, duplicate shot_number within the scene (application rule), and optional cast people.
 * When `person_ids` is non-empty, inserts `shot_cast` rows and any missing `scene_cast` rows in one
 * serialized transaction (per DATABASE_LAYER.md).
 */
export async function createShot(data: CreateShotInput): Promise<CreateShotResult> {
  const sceneId = typeof data.scene_id === 'string' ? data.scene_id.trim() : ''
  if (!sceneId) {
    throw new Error('scene_id is required')
  }

  const shotNumber = typeof data.shot_number === 'string' ? data.shot_number.trim() : ''
  if (!shotNumber) {
    throw new Error('shot_number is required')
  }

  const scene = await getSceneById(sceneId)
  if (!scene) {
    throw new Error('Scene not found or deleted')
  }

  validateShotFieldEnums(data)

  if (data.duration_seconds != null) {
    if (!Number.isInteger(data.duration_seconds) || data.duration_seconds < 0) {
      throw new Error('duration_seconds must be a non-negative integer')
    }
  }
  if (data.estimated_shoot_minutes != null) {
    if (!Number.isInteger(data.estimated_shoot_minutes) || data.estimated_shoot_minutes < 0) {
      throw new Error('estimated_shoot_minutes must be a non-negative integer')
    }
  }

  const personIds = [...new Set((data.person_ids ?? []).filter((id) => typeof id === 'string' && id.trim()))]

  for (const personId of personIds) {
    const person = await getPersonById(personId)
    if (!person) {
      throw new Error(`Person not found or deleted: ${personId}`)
    }
    if (person.production_id !== scene.production_id) {
      throw new Error(`Person ${personId} does not belong to this production`)
    }
    if (!person.is_cast) {
      throw new Error(`Person ${personId} is not cast (is_cast)`)
    }
  }

  const db = await getDb()
  const dup = await db.select<Record<string, unknown>[]>(
    `SELECT 1 AS n FROM ${SHOT_TABLE} WHERE scene_id = $1 AND shot_number = $2 AND deleted_at IS NULL LIMIT 1`,
    [sceneId, shotNumber]
  )
  if (dup.length > 0) {
    throw new Error(`A shot with number "${shotNumber}" already exists in this scene`)
  }

  const id = uuid()
  const ts = now()
  const insertBinds: unknown[] = [
    id,
    sceneId,
    shotNumber,
    data.description ?? null,
    data.shot_description ?? null,
    data.subject ?? null,
    data.action_description ?? null,
    data.shot_size ?? null,
    data.support ?? null,
    data.lens ?? null,
    data.duration_seconds ?? null,
    data.estimated_shoot_minutes ?? null,
    data.camera_movement ?? null,
    data.notes ?? null,
    ts,
    ts,
  ]

  const shotOutboxPayload = {
    id,
    scene_id: sceneId,
    shot_number: shotNumber,
    description: data.description ?? null,
    shot_description: data.shot_description ?? null,
    subject: data.subject ?? null,
    action_description: data.action_description ?? null,
    shot_size: data.shot_size ?? null,
    support: data.support ?? null,
    lens: data.lens ?? null,
    duration_seconds: data.duration_seconds ?? null,
    estimated_shoot_minutes: data.estimated_shoot_minutes ?? null,
    camera_movement: data.camera_movement ?? null,
    notes: data.notes ?? null,
  }

  const insertSql = `INSERT INTO ${SHOT_TABLE} (id, scene_id, shot_number, description, shot_description, subject, action_description, shot_size, support, lens, duration_seconds, estimated_shoot_minutes, camera_movement, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`

  if (personIds.length === 0) {
    await db.execute(insertSql, insertBinds)
    await outboxPush(SHOT_TABLE, id, 'create', JSON.stringify(shotOutboxPayload))
    const shot = await getShotById(id)
    if (!shot) {
      throw new Error('Shot not found after create')
    }
    return { shot, shotCast: [] }
  }

  const sceneCastRows = await db.select<Record<string, unknown>[]>(
    `SELECT person_id FROM ${SCENE_CAST_TABLE} WHERE scene_id = $1 AND deleted_at IS NULL`,
    [sceneId]
  )
  const sceneCastPersonIds = new Set(sceneCastRows.map((r) => r.person_id as string))

  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
      { sql: insertSql, bindValues: insertBinds },
      outboxStatementForRow({
        entity: SHOT_TABLE,
        entityId: id,
        operation: 'create',
        payloadJson: JSON.stringify(shotOutboxPayload),
      }),
    ]

    for (const personId of personIds) {
      if (!sceneCastPersonIds.has(personId)) {
        const sceneCastId = uuid()
        statements.push({
          sql: `INSERT INTO ${SCENE_CAST_TABLE} (id, production_id, scene_id, person_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          bindValues: [sceneCastId, scene.production_id, sceneId, personId, ts, ts],
        })
        statements.push(
          outboxStatementForRow({
            entity: SCENE_CAST_TABLE,
            entityId: sceneCastId,
            operation: 'create',
            payloadJson: JSON.stringify({
              id: sceneCastId,
              production_id: scene.production_id,
              scene_id: sceneId,
              person_id: personId,
            }),
          })
        )
        sceneCastPersonIds.add(personId)
      }

      const shotCastId = uuid()
      statements.push({
        sql: `INSERT INTO ${SHOT_CAST_TABLE} (id, production_id, shot_id, person_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        bindValues: [shotCastId, scene.production_id, id, personId, ts, ts],
      })
      statements.push(
        outboxStatementForRow({
          entity: SHOT_CAST_TABLE,
          entityId: shotCastId,
          operation: 'create',
          payloadJson: JSON.stringify({
            id: shotCastId,
            production_id: scene.production_id,
            shot_id: id,
            person_id: personId,
          }),
        })
      )
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(conn, statements)
  })

  const shot = await getShotById(id)
  if (!shot) {
    throw new Error('Shot not found after create')
  }
  const castRows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SHOT_CAST_TABLE} WHERE shot_id = $1 AND deleted_at IS NULL ORDER BY person_id`,
    [id]
  )
  return { shot, shotCast: castRows.map(rowToShotCast) }
}

const SHOT_UPDATE_KEYS = [
  'shot_number', 'description', 'shot_description', 'subject', 'action_description', 'shot_size',
  'support', 'lens', 'duration_seconds', 'estimated_shoot_minutes', 'camera_movement', 'notes',
] as const

export async function updateShot(
  id: string,
  data: Partial<Pick<Shot, (typeof SHOT_UPDATE_KEYS)[number]>>,
  options?: { expectedUpdatedAt?: string }
): Promise<Shot> {
  const existing = await getShotById(id)
  if (!existing) {
    throw new Error('Shot not found or deleted')
  }

  const db = await getDb()
  let payload: Partial<Pick<Shot, (typeof SHOT_UPDATE_KEYS)[number]>> = data
  if (data.shot_number !== undefined) {
    const shotNumber =
      typeof data.shot_number === 'string'
        ? data.shot_number.trim()
        : String(data.shot_number ?? '').trim()
    if (!shotNumber) {
      throw new Error('shot_number is required')
    }
    const dup = await db.select<Record<string, unknown>[]>(
      `SELECT 1 AS n FROM ${SHOT_TABLE} WHERE scene_id = $1 AND shot_number = $2 AND deleted_at IS NULL AND id != $3 LIMIT 1`,
      [existing.scene_id, shotNumber, id]
    )
    if (dup.length > 0) {
      throw new Error(`A shot with number "${shotNumber}" already exists in this scene`)
    }
    payload = { ...data, shot_number: shotNumber }
  }
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of SHOT_UPDATE_KEYS) {
    if (payload[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(payload[k])
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${SHOT_TABLE} WHERE id = $1 AND deleted_at IS NULL`, [id])
    return rows.length ? rowToShot(rows[0]!) : (await listShotsByScene(''))[0]!
  }
  cols.push(`updated_at = $${i++}`)
  vals.push(ts)
  let whereSql = `id = $${i++}`
  vals.push(id)
  if (options?.expectedUpdatedAt) {
    whereSql += ` AND updated_at = $${i++}`
    vals.push(options.expectedUpdatedAt)
  }
  const result = await db.execute(`UPDATE ${SHOT_TABLE} SET ${cols.join(', ')} WHERE ${whereSql}`, vals)
  if ((result.rowsAffected ?? 0) === 0 && options?.expectedUpdatedAt) {
    throw new OptimisticConcurrencyConflictError({
      entity: SHOT_TABLE,
      entityId: id,
      expectedUpdatedAt: options.expectedUpdatedAt,
    })
  }
  await outboxPush(SHOT_TABLE, id, 'update', JSON.stringify(payload))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${SHOT_TABLE} WHERE id = $1`, [id])
  return rowToShot(rows[0]!)
}

export async function deleteShot(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${SHOT_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(SHOT_TABLE, id, 'delete', null)
  await cleanupStoryboardImagesForDeletedShot(id)
}

/**
 * Move a shot between scenes in the same production. Storyboard image rows remain attached
 * to the shot and have scene_id synchronized to the new parent scene.
 */
export async function moveShotToScene(shotId: string, toSceneId: string): Promise<Shot> {
  const existing = await getShotById(shotId)
  if (!existing) throw new Error('Shot not found or deleted')

  const targetScene = await getSceneById(toSceneId)
  if (!targetScene) throw new Error('Target scene not found or deleted')

  const currentScene = await getSceneById(existing.scene_id)
  if (!currentScene) throw new Error('Current scene not found or deleted')

  if (currentScene.production_id !== targetScene.production_id) {
    throw new Error('Cannot move a shot across productions')
  }
  if (existing.scene_id === toSceneId) return existing

  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${SHOT_TABLE} SET scene_id = $1, updated_at = $2 WHERE id = $3`,
    [toSceneId, ts, shotId]
  )
  await outboxPush(SHOT_TABLE, shotId, 'update', JSON.stringify({ scene_id: toSceneId }))
  await updateStoryboardSceneForMovedShot(shotId, toSceneId)
  return (await getShotById(shotId))!
}

// Stripboard
export async function listStripboardByShootDay(shootDayId: string): Promise<StripboardItem[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${STRIP_TABLE} WHERE shoot_day_id = $1 AND deleted_at IS NULL ORDER BY sort_order`,
    [shootDayId]
  )
  return rows.map(rowToStripboardItem)
}

export async function setStripboardOrder(
  shootDayId: string,
  sceneIdsInOrder: string[]
): Promise<void> {
  const db = await getDb()
  const ts = now()
  for (let i = 0; i < sceneIdsInOrder.length; i++) {
    const sceneId = sceneIdsInOrder[i]!
    const existing = await db.select<Record<string, unknown>[]>(
      `SELECT id FROM ${STRIP_TABLE} WHERE shoot_day_id = $1 AND scene_id = $2 AND deleted_at IS NULL`,
      [shootDayId, sceneId]
    )
    if (existing.length > 0) {
      await db.execute(
        `UPDATE ${STRIP_TABLE} SET sort_order = $1, updated_at = $2 WHERE id = $3`,
        [i, ts, existing[0]!.id]
      )
    } else {
      const id = uuid()
      await db.execute(
        `INSERT INTO ${STRIP_TABLE} (id, shoot_day_id, scene_id, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, shootDayId, sceneId, i, ts, ts]
      )
      await outboxPush(STRIP_TABLE, id, 'create', JSON.stringify({ shoot_day_id: shootDayId, scene_id: sceneId, sort_order: i }))
    }
  }
}

export async function addSceneToStripboard(shootDayId: string, sceneId: string, sortOrder: number): Promise<StripboardItem> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${STRIP_TABLE} (id, shoot_day_id, scene_id, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, shootDayId, sceneId, sortOrder, ts, ts]
  )
  await outboxPush(STRIP_TABLE, id, 'create', JSON.stringify({ shoot_day_id: shootDayId, scene_id: sceneId, sort_order: sortOrder }))
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${STRIP_TABLE} WHERE id = $1`, [id])
  return rowToStripboardItem(rows[0]!)
}

export async function removeSceneFromStripboard(shootDayId: string, sceneId: string): Promise<void> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${STRIP_TABLE} WHERE shoot_day_id = $1 AND scene_id = $2 AND deleted_at IS NULL`,
    [shootDayId, sceneId]
  )
  if (rows.length === 0) return
  const ts = now()
  await db.execute(
    `UPDATE ${STRIP_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, rows[0]!.id]
  )
  await outboxPush(STRIP_TABLE, rows[0]!.id as string, 'delete', null)
}
