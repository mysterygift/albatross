/**
 * Script Supervisor (SS1): slates (camera setups) and takes.
 *
 * Local SQLite only, like the SB1 script-section tables: writes refuse productions whose effective
 * data source is `remote_server`, and nothing here is published or exported yet.
 * Multi-statement writes follow DATABASE_LAYER.md §4 (runInSerializedTransaction + one executeBatch,
 * outbox rows in the same batch).
 */
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow, type OutboxRow } from '../outbox'
import { getEffectiveDataSourceForProduction } from '../projectDataSource'
import { coerceBoolean, coerceNumber } from '../sqlValueCoercion'
import type {
  Slate,
  SlateShotType,
  SlateSoundMode,
  Take,
  TakeNgReason,
  TakeStatus,
} from '../types'
import {
  formatSlateLabel,
  nextConsecutiveSlateNumber,
  nextTakeNumber,
  normaliseSlatePrefix,
} from '@/lib/script-supervisor/slateNumbering'

const SLATES = 'slates'
const TAKES = 'takes'

type Stmt = { sql: string; bindValues: unknown[] }

export const SCRIPT_SUPERVISOR_REMOTE_ERROR =
  'Script supervisor logs are stored on this device only and are not available for server-published productions.'

const SHOT_TYPES: readonly SlateShotType[] = ['master', 'single', 'multiple', 'insert', 'other']
const SOUND_MODES: readonly SlateSoundMode[] = ['sync', 'mute', 'wild_track']
const TAKE_STATUSES: readonly TakeStatus[] = ['pending', 'print', 'hold', 'ng', 'incomplete']
const NG_REASONS: readonly TakeNgReason[] = ['performance', 'camera', 'sound', 'focus', 'continuity', 'other']

// ─── Row mappers ────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (v == null ? null : (v as string))

function rowToSlate(r: Record<string, unknown>): Slate {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shoot_day_id: r.shoot_day_id as string,
    unit_id: str(r.unit_id),
    scene_id: str(r.scene_id),
    shot_id: str(r.shot_id),
    slate_prefix: (r.slate_prefix as string | null) ?? '',
    slate_number: coerceNumber(r.slate_number, 0),
    shot_type: (r.shot_type as SlateShotType | null) ?? null,
    shot_code: str(r.shot_code),
    description: str(r.description),
    camera: str(r.camera),
    lens: str(r.lens),
    stop: str(r.stop),
    filter: str(r.filter),
    sound_mode: ((r.sound_mode as SlateSoundMode | null) ?? 'sync'),
    int_ext: str(r.int_ext),
    day_night: str(r.day_night),
    camera_roll: str(r.camera_roll),
    sound_roll: str(r.sound_roll),
    notes: str(r.notes),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: str(r.deleted_at),
  }
}

function rowToTake(r: Record<string, unknown>): Take {
  return {
    id: r.id as string,
    slate_id: r.slate_id as string,
    take_number: coerceNumber(r.take_number, 0),
    status: (r.status as TakeStatus | null) ?? 'pending',
    ng_reason: (r.ng_reason as TakeNgReason | null) ?? null,
    duration_ms: r.duration_ms != null ? coerceNumber(r.duration_ms, 0) : null,
    end_board: coerceBoolean(r.end_board, false) ? 1 : 0,
    remarks: str(r.remarks),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: str(r.deleted_at),
  }
}

// ─── Validation ─────────────────────────────────────────────────────────────

async function assertLocalProduction(productionId: string): Promise<void> {
  if ((await getEffectiveDataSourceForProduction(productionId)) === 'remote_server') {
    throw new Error(SCRIPT_SUPERVISOR_REMOTE_ERROR)
  }
}

function assertOneOf<T extends string>(value: T | null | undefined, allowed: readonly T[], label: string): void {
  if (value != null && !allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(', ')}`)
  }
}

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a whole number of 1 or more`)
}

function assertDuration(value: number | null | undefined): void {
  if (value != null && (!Number.isFinite(value) || value < 0)) {
    throw new Error('Take duration must be zero or more milliseconds')
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function getSlateById(id: string): Promise<Slate | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SLATES} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows[0] ? rowToSlate(rows[0]) : null
}

/** Live slates logged on a shoot day, in slating order (series, then number). */
export async function listSlatesByShootDay(shootDayId: string): Promise<Slate[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SLATES} WHERE shoot_day_id = $1 AND deleted_at IS NULL
     ORDER BY slate_prefix, slate_number`,
    [shootDayId]
  )
  return rows.map(rowToSlate)
}

/** Live slates covering a scene across all shoot days, in slating order. */
export async function listSlatesByScene(sceneId: string): Promise<Slate[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SLATES} WHERE scene_id = $1 AND deleted_at IS NULL
     ORDER BY slate_prefix, slate_number`,
    [sceneId]
  )
  return rows.map(rowToSlate)
}

/** Live takes for several slates in one query (avoids one select per slate). */
export async function listTakesBySlateIds(slateIds: readonly string[]): Promise<Take[]> {
  if (slateIds.length === 0) return []
  const db = await getDb()
  const placeholders = slateIds.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TAKES} WHERE slate_id IN (${placeholders}) AND deleted_at IS NULL
     ORDER BY slate_id, take_number`,
    [...slateIds]
  )
  return rows.map(rowToTake)
}

/** Next consecutive slate number for a series (UK slating, SS1 default). */
export async function getNextSlateNumber(productionId: string, prefix?: string | null): Promise<number> {
  const db = await getDb()
  const rows = await db.select<Array<{ slate_number: unknown }>>(
    `SELECT slate_number FROM ${SLATES} WHERE production_id = $1 AND slate_prefix = $2 AND deleted_at IS NULL`,
    [productionId, normaliseSlatePrefix(prefix)]
  )
  return nextConsecutiveSlateNumber(rows.map((r) => coerceNumber(r.slate_number, 0)))
}

async function isSlateNumberTaken(
  productionId: string,
  prefix: string,
  slateNumber: number,
  excludeId?: string
): Promise<boolean> {
  const db = await getDb()
  const rows = await db.select<Array<{ id: string }>>(
    `SELECT id FROM ${SLATES}
     WHERE production_id = $1 AND slate_prefix = $2 AND slate_number = $3 AND deleted_at IS NULL`,
    [productionId, prefix, slateNumber]
  )
  return rows.some((r) => r.id !== excludeId)
}

// ─── Slate writes ───────────────────────────────────────────────────────────

export type SlateFields = {
  unit_id?: string | null
  scene_id?: string | null
  shot_id?: string | null
  shot_type?: SlateShotType | null
  shot_code?: string | null
  description?: string | null
  camera?: string | null
  lens?: string | null
  stop?: string | null
  filter?: string | null
  sound_mode?: SlateSoundMode
  int_ext?: string | null
  day_night?: string | null
  camera_roll?: string | null
  sound_roll?: string | null
  notes?: string | null
}

const SLATE_FIELD_KEYS: readonly (keyof SlateFields)[] = [
  'unit_id',
  'scene_id',
  'shot_id',
  'shot_type',
  'shot_code',
  'description',
  'camera',
  'lens',
  'stop',
  'filter',
  'sound_mode',
  'int_ext',
  'day_night',
  'camera_roll',
  'sound_roll',
  'notes',
]

export type CreateSlateInput = SlateFields & {
  production_id: string
  shoot_day_id: string
  /** Series prefix; '' (default) for main unit. */
  slate_prefix?: string | null
  /** Explicit number; omitted = next consecutive number in the series. */
  slate_number?: number
}

function validateSlateFields(fields: SlateFields): void {
  assertOneOf(fields.shot_type, SHOT_TYPES, 'Shot type')
  assertOneOf(fields.sound_mode, SOUND_MODES, 'Sound mode')
}

/**
 * Creates a slate on a shoot day. The number defaults to the next consecutive number in its series;
 * an explicit number is accepted (scripts sometimes skip numbers) but must not already be live.
 */
export async function createSlate(input: CreateSlateInput): Promise<Slate> {
  await assertLocalProduction(input.production_id)
  validateSlateFields(input)

  const db = await getDb()
  const dayRows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM shoot_days WHERE id = $1 AND deleted_at IS NULL`,
    [input.shoot_day_id]
  )
  if (dayRows.length === 0) throw new Error('Shoot day not found')
  if (dayRows[0]!.production_id !== input.production_id) {
    throw new Error('Shoot day belongs to a different production')
  }

  const prefix = normaliseSlatePrefix(input.slate_prefix)
  const id = uuid()

  return runInSerializedTransaction(async () => {
    let slateNumber: number
    if (input.slate_number != null) {
      assertPositiveInt(input.slate_number, 'Slate number')
      slateNumber = input.slate_number
      if (await isSlateNumberTaken(input.production_id, prefix, slateNumber)) {
        throw new Error(`Slate ${formatSlateLabel(prefix, slateNumber)} is already in use`)
      }
    } else {
      slateNumber = await getNextSlateNumber(input.production_id, prefix)
    }

    const ts = now()
    const row: Slate = {
      id,
      production_id: input.production_id,
      shoot_day_id: input.shoot_day_id,
      unit_id: input.unit_id ?? null,
      scene_id: input.scene_id ?? null,
      shot_id: input.shot_id ?? null,
      slate_prefix: prefix,
      slate_number: slateNumber,
      shot_type: input.shot_type ?? null,
      shot_code: input.shot_code ?? null,
      description: input.description ?? null,
      camera: input.camera ?? null,
      lens: input.lens ?? null,
      stop: input.stop ?? null,
      filter: input.filter ?? null,
      sound_mode: input.sound_mode ?? 'sync',
      int_ext: input.int_ext ?? null,
      day_night: input.day_night ?? null,
      camera_roll: input.camera_roll ?? null,
      sound_roll: input.sound_roll ?? null,
      notes: input.notes ?? null,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    }
    const statements: Stmt[] = [
      { sql: 'BEGIN', bindValues: [] },
      {
        sql: `INSERT INTO ${SLATES} (id, production_id, shoot_day_id, unit_id, scene_id, shot_id, slate_prefix, slate_number,
                shot_type, shot_code, description, camera, lens, stop, filter, sound_mode, int_ext, day_night,
                camera_roll, sound_roll, notes, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
        bindValues: [
          row.id, row.production_id, row.shoot_day_id, row.unit_id, row.scene_id, row.shot_id, row.slate_prefix,
          row.slate_number, row.shot_type, row.shot_code, row.description, row.camera, row.lens, row.stop, row.filter,
          row.sound_mode, row.int_ext, row.day_night, row.camera_roll, row.sound_roll, row.notes, ts, ts,
        ],
      },
      outboxStatementForRow({ entity: SLATES, entityId: id, operation: 'create', payloadJson: JSON.stringify(row) }),
      { sql: 'COMMIT', bindValues: [] },
    ]
    const conn = await getDb()
    await executeBatch(conn, statements)
    return row
  })
}

export type UpdateSlateInput = SlateFields & {
  slate_prefix?: string | null
  slate_number?: number
}

/** Updates editable slate fields; renumbering checks the new number is free in its series. */
export async function updateSlate(id: string, patch: UpdateSlateInput): Promise<Slate> {
  const existing = await getSlateById(id)
  if (!existing) throw new Error('Slate not found')
  await assertLocalProduction(existing.production_id)
  validateSlateFields(patch)

  const sets: string[] = []
  const values: unknown[] = []
  const changes: Record<string, unknown> = {}
  const push = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
    changes[column] = value
  }

  for (const key of SLATE_FIELD_KEYS) {
    if (patch[key] === undefined) continue
    // sound_mode is NOT NULL; clearing it resets to the default.
    push(key, key === 'sound_mode' ? patch.sound_mode ?? 'sync' : patch[key] ?? null)
  }

  const nextPrefix = patch.slate_prefix !== undefined ? normaliseSlatePrefix(patch.slate_prefix) : existing.slate_prefix
  const nextNumber = patch.slate_number ?? existing.slate_number
  if (patch.slate_number !== undefined) assertPositiveInt(patch.slate_number, 'Slate number')
  const renumbered = nextPrefix !== existing.slate_prefix || nextNumber !== existing.slate_number
  if (renumbered) {
    if (await isSlateNumberTaken(existing.production_id, nextPrefix, nextNumber, id)) {
      throw new Error(`Slate ${formatSlateLabel(nextPrefix, nextNumber)} is already in use`)
    }
    push('slate_prefix', nextPrefix)
    push('slate_number', nextNumber)
  }

  if (sets.length === 0) return existing

  const ts = now()
  push('updated_at', ts)
  values.push(id)
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    { sql: `UPDATE ${SLATES} SET ${sets.join(', ')} WHERE id = $${values.length} AND deleted_at IS NULL`, bindValues: values },
    outboxStatementForRow({ entity: SLATES, entityId: id, operation: 'update', payloadJson: JSON.stringify(changes) }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
  const updated = await getSlateById(id)
  if (!updated) throw new Error('Slate not found')
  return updated
}

/** Soft-deletes a slate and its live takes together. Its number becomes free for reuse. */
export async function softDeleteSlate(id: string): Promise<void> {
  const existing = await getSlateById(id)
  if (!existing) return
  await assertLocalProduction(existing.production_id)

  const takeIds = (await listTakesBySlateIds([id])).map((t) => t.id)
  const ts = now()
  const outboxRows: OutboxRow[] = [
    ...takeIds.map((takeId) => ({ entity: TAKES, entityId: takeId, operation: 'delete' as const, payloadJson: null })),
    { entity: SLATES, entityId: id, operation: 'delete' as const, payloadJson: null },
  ]
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE ${TAKES} SET deleted_at = $1, updated_at = $2 WHERE slate_id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, id],
    },
    {
      sql: `UPDATE ${SLATES} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, id],
    },
    ...outboxRows.map(outboxStatementForRow),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}

// ─── Take writes ────────────────────────────────────────────────────────────

export type TakeFields = {
  status?: TakeStatus
  ng_reason?: TakeNgReason | null
  duration_ms?: number | null
  end_board?: boolean
  remarks?: string | null
}

function validateTakeFields(fields: TakeFields): void {
  assertOneOf(fields.status, TAKE_STATUSES, 'Take status')
  assertOneOf(fields.ng_reason, NG_REASONS, 'NG reason')
  assertDuration(fields.duration_ms)
}

async function getTakeWithProduction(id: string): Promise<{ take: Take; productionId: string } | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT t.*, s.production_id AS slate_production_id FROM ${TAKES} t
     INNER JOIN ${SLATES} s ON s.id = t.slate_id AND s.deleted_at IS NULL
     WHERE t.id = $1 AND t.deleted_at IS NULL`,
    [id]
  )
  if (!rows[0]) return null
  return { take: rowToTake(rows[0]), productionId: rows[0].slate_production_id as string }
}

/** Logs the next take on a slate (Roll → Cut). The take number is always the next in sequence. */
export async function createTake(slateId: string, fields: TakeFields = {}): Promise<Take> {
  const slate = await getSlateById(slateId)
  if (!slate) throw new Error('Slate not found')
  await assertLocalProduction(slate.production_id)
  validateTakeFields(fields)

  const id = uuid()
  return runInSerializedTransaction(async () => {
    const existingNumbers = (await listTakesBySlateIds([slateId])).map((t) => t.take_number)
    const status = fields.status ?? 'pending'
    const ts = now()
    const row: Take = {
      id,
      slate_id: slateId,
      take_number: nextTakeNumber(existingNumbers),
      status,
      // An NG reason only means something on an NG take.
      ng_reason: status === 'ng' ? fields.ng_reason ?? null : null,
      duration_ms: fields.duration_ms != null ? Math.round(fields.duration_ms) : null,
      end_board: fields.end_board ? 1 : 0,
      remarks: fields.remarks ?? null,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    }
    const statements: Stmt[] = [
      { sql: 'BEGIN', bindValues: [] },
      {
        sql: `INSERT INTO ${TAKES} (id, slate_id, take_number, status, ng_reason, duration_ms, end_board, remarks, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        bindValues: [
          row.id, row.slate_id, row.take_number, row.status, row.ng_reason, row.duration_ms, row.end_board,
          row.remarks, ts, ts,
        ],
      },
      outboxStatementForRow({ entity: TAKES, entityId: id, operation: 'create', payloadJson: JSON.stringify(row) }),
      { sql: 'COMMIT', bindValues: [] },
    ]
    const db = await getDb()
    await executeBatch(db, statements)
    return row
  })
}

/**
 * Updates a take (mark Print / Hold / NG, duration, remarks). Moving a take off NG clears its
 * NG reason so stale reasons never reach the continuity sheets.
 */
export async function updateTake(id: string, patch: TakeFields): Promise<Take> {
  const found = await getTakeWithProduction(id)
  if (!found) throw new Error('Take not found')
  await assertLocalProduction(found.productionId)
  validateTakeFields(patch)

  const nextStatus = patch.status ?? found.take.status
  const changes: Record<string, unknown> = {}
  if (patch.status !== undefined) changes.status = patch.status
  if (nextStatus !== 'ng') {
    if (found.take.ng_reason !== null || patch.ng_reason != null) changes.ng_reason = null
  } else if (patch.ng_reason !== undefined) {
    changes.ng_reason = patch.ng_reason
  }
  if (patch.duration_ms !== undefined) {
    changes.duration_ms = patch.duration_ms != null ? Math.round(patch.duration_ms) : null
  }
  if (patch.end_board !== undefined) changes.end_board = patch.end_board ? 1 : 0
  if (patch.remarks !== undefined) changes.remarks = patch.remarks

  const columns = Object.keys(changes)
  if (columns.length === 0) return found.take

  const ts = now()
  const values: unknown[] = columns.map((c) => changes[c])
  const sets = columns.map((c, i) => `${c} = $${i + 1}`)
  values.push(ts)
  sets.push(`updated_at = $${values.length}`)
  values.push(id)
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    { sql: `UPDATE ${TAKES} SET ${sets.join(', ')} WHERE id = $${values.length} AND deleted_at IS NULL`, bindValues: values },
    outboxStatementForRow({ entity: TAKES, entityId: id, operation: 'update', payloadJson: JSON.stringify(changes) }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
  const updated = await getTakeWithProduction(id)
  if (!updated) throw new Error('Take not found')
  return updated.take
}

export async function softDeleteTake(id: string): Promise<void> {
  const found = await getTakeWithProduction(id)
  if (!found) return
  await assertLocalProduction(found.productionId)
  const ts = now()
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE ${TAKES} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, id],
    },
    outboxStatementForRow({ entity: TAKES, entityId: id, operation: 'delete', payloadJson: null }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}
