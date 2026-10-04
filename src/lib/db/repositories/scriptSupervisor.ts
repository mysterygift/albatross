/**
 * Script Supervisor: slates (camera setups), takes, and the per-production slating setting.
 *
 * Local SQLite only, like the SB1 script-section tables: writes refuse productions whose effective
 * data source is `remote_server`, and nothing here is published or exported yet.
 * Multi-statement writes follow DATABASE_LAYER.md §4 (runInSerializedTransaction + one executeBatch,
 * outbox rows in the same batch).
 *
 * Slating (SS2): UK consecutive numbers per unit series (default) or US scene + setup letter, chosen per
 * production. Each slate stores the system it was created under. See `slateNumbering.ts`.
 */
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow, type OutboxRow } from '../outbox'
import { getEffectiveDataSourceForProduction } from '../projectDataSource'
import { coerceBoolean, coerceNumber } from '../sqlValueCoercion'
import type {
  ProductionScriptSupervisorSettings,
  Slate,
  SlateShotType,
  SlateSoundMode,
  SlatingSystem,
  Take,
  TakeNgReason,
  TakeStatus,
} from '../types'
import {
  DEFAULT_SLATING_SYSTEM,
  nextConsecutiveSlateNumber,
  nextTakeNumber,
  normaliseSlatePrefix,
  slateDisplayLabel,
  usOrdinalForSetupLetter,
} from '@/lib/script-supervisor/slateNumbering'

const SLATES = 'slates'
const TAKES = 'takes'
const SETTINGS = 'production_script_supervisor_settings'

type Stmt = { sql: string; bindValues: unknown[] }

export const SCRIPT_SUPERVISOR_REMOTE_ERROR =
  'Script supervisor logs are stored on this device only and are not available for server-published productions.'

export const SLATING_SYSTEM_LOCKED_ERROR =
  'The slating system can’t be changed once slates are logged. Delete this production’s slates first.'

const SLATING_SYSTEMS: readonly SlatingSystem[] = ['uk', 'us']
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
    slating_system: (r.slating_system as SlatingSystem | null) ?? 'uk',
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
    sound_mode: (r.sound_mode as SlateSoundMode | null) ?? 'sync',
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

/** Throws the local-only error for server-published productions (shared with the lining repository). */
export async function assertScriptSupervisorLocal(productionId: string): Promise<void> {
  return assertLocalProduction(productionId)
}

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

function ordinalForLetterOrThrow(letter: string): number {
  const ordinal = usOrdinalForSetupLetter(letter)
  if (ordinal == null) {
    throw new Error(`“${letter.trim()}” is not a setup letter. Use A–Z without I or O (or leave blank for the master).`)
  }
  return ordinal
}

// ─── Slating setting (SS2) ──────────────────────────────────────────────────

/** The production's slating system; UK when nothing has been saved. */
export async function getScriptSupervisorSettings(productionId: string): Promise<ProductionScriptSupervisorSettings> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${SETTINGS} WHERE production_id = $1`, [
    productionId,
  ])
  const row = rows[0]
  if (row) {
    return {
      production_id: row.production_id as string,
      slating_system: (row.slating_system as SlatingSystem | null) ?? DEFAULT_SLATING_SYSTEM,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    }
  }
  const ts = now()
  return { production_id: productionId, slating_system: DEFAULT_SLATING_SYSTEM, created_at: ts, updated_at: ts }
}

export async function getSlatingSystem(productionId: string): Promise<SlatingSystem> {
  return (await getScriptSupervisorSettings(productionId)).slating_system
}

export async function countLiveSlates(productionId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<Array<{ n: unknown }>>(
    `SELECT COUNT(*) AS n FROM ${SLATES} WHERE production_id = $1 AND deleted_at IS NULL`,
    [productionId]
  )
  return coerceNumber(rows[0]?.n, 0)
}

/**
 * Sets the production's slating system. Locked once any live slate exists, so a shoot never mixes
 * systems by accident; setting the current value again is a no-op.
 */
export async function setSlatingSystem(
  productionId: string,
  system: SlatingSystem
): Promise<ProductionScriptSupervisorSettings> {
  assertOneOf(system, SLATING_SYSTEMS, 'Slating system')
  await assertLocalProduction(productionId)
  const current = await getScriptSupervisorSettings(productionId)
  if (current.slating_system === system) return current
  if ((await countLiveSlates(productionId)) > 0) throw new Error(SLATING_SYSTEM_LOCKED_ERROR)

  const ts = now()
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `INSERT INTO ${SETTINGS} (production_id, slating_system, created_at, updated_at) VALUES ($1, $2, $3, $4)
            ON CONFLICT (production_id) DO UPDATE SET slating_system = $2, updated_at = $4`,
      bindValues: [productionId, system, ts, ts],
    },
    outboxStatementForRow({
      entity: SETTINGS,
      entityId: productionId,
      operation: 'update',
      payloadJson: JSON.stringify({ slating_system: system }),
    }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
  return getScriptSupervisorSettings(productionId)
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

/** Live slates logged on a shoot day, in the order they were created. */
export async function listSlatesByShootDay(shootDayId: string): Promise<Slate[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SLATES} WHERE shoot_day_id = $1 AND deleted_at IS NULL
     ORDER BY created_at, slate_prefix, slate_number`,
    [shootDayId]
  )
  return rows.map(rowToSlate)
}

/** Live slates covering a scene across all shoot days, in the order they were created. */
export async function listSlatesByScene(sceneId: string): Promise<Slate[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${SLATES} WHERE scene_id = $1 AND deleted_at IS NULL
     ORDER BY created_at, slate_prefix, slate_number`,
    [sceneId]
  )
  return rows.map(rowToSlate)
}

/** A scene on a shoot day's stripboard, in strip order. */
export type ShootDayScene = {
  id: string
  scene_number: string
  title: string | null
  int_ext: string | null
  day_night: string | null
  page_eighths: number | null
}

/**
 * Scenes scheduled on a shoot day: SCENE strips directly, SHOT strips through their planned shot's scene.
 * Ordered by the first strip that brings each scene onto the day.
 */
export async function listScenesForShootDay(shootDayId: string): Promise<ShootDayScene[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT sc.id, sc.scene_number, sc.title, sc.int_ext, sc.day_night, sc.page_eighths, MIN(st.sort_index) AS first_sort
     FROM stripboard_strips st
     LEFT JOIN shots sh ON sh.id = st.shot_id AND sh.deleted_at IS NULL
     INNER JOIN scenes sc ON sc.id = CASE
         WHEN st.strip_type = 'SCENE' THEN st.scene_id
         WHEN st.strip_type = 'SHOT' THEN sh.scene_id
       END
     WHERE st.shoot_day_id = $1 AND st.deleted_at IS NULL AND sc.deleted_at IS NULL
     GROUP BY sc.id, sc.scene_number, sc.title, sc.int_ext, sc.day_night, sc.page_eighths
     ORDER BY first_sort, sc.scene_number`,
    [shootDayId]
  )
  return rows.map((r) => ({
    id: r.id as string,
    scene_number: r.scene_number as string,
    title: str(r.title),
    int_ext: str(r.int_ext),
    day_night: str(r.day_night),
    page_eighths: r.page_eighths != null ? coerceNumber(r.page_eighths, 0) : null,
  }))
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

async function getSceneNumber(sceneId: string, productionId: string): Promise<string> {
  const db = await getDb()
  const rows = await db.select<Array<{ scene_number: string; production_id: string }>>(
    `SELECT scene_number, production_id FROM scenes WHERE id = $1 AND deleted_at IS NULL`,
    [sceneId]
  )
  if (rows.length === 0) throw new Error('Scene not found')
  if (rows[0]!.production_id !== productionId) throw new Error('Scene belongs to a different production')
  return rows[0]!.scene_number
}

/** Next UK consecutive slate number in a series. */
export async function getNextSlateNumber(productionId: string, prefix?: string | null): Promise<number> {
  const db = await getDb()
  const rows = await db.select<Array<{ slate_number: unknown }>>(
    `SELECT slate_number FROM ${SLATES}
     WHERE production_id = $1 AND slating_system = 'uk' AND slate_prefix = $2 AND deleted_at IS NULL`,
    [productionId, normaliseSlatePrefix(prefix)]
  )
  return nextConsecutiveSlateNumber(rows.map((r) => coerceNumber(r.slate_number, 0)))
}

/** Next US setup ordinal for a scene (1 = scene number alone, 2 = A…). */
export async function getNextUsSetupOrdinal(sceneId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<Array<{ slate_number: unknown }>>(
    `SELECT slate_number FROM ${SLATES} WHERE scene_id = $1 AND slating_system = 'us' AND deleted_at IS NULL`,
    [sceneId]
  )
  return nextConsecutiveSlateNumber(rows.map((r) => coerceNumber(r.slate_number, 0)))
}

export type NextSlatePreview = { slating_system: SlatingSystem; slate_number: number; label: string }

/**
 * What the "New slate" button will create, for showing the number before it exists.
 * US needs a scene; without one it returns null.
 */
export async function getNextSlatePreview(
  productionId: string,
  opts: { prefix?: string | null; sceneId?: string | null } = {}
): Promise<NextSlatePreview | null> {
  const system = await getSlatingSystem(productionId)
  if (system === 'us') {
    if (!opts.sceneId) return null
    const sceneNumber = await getSceneNumber(opts.sceneId, productionId)
    const ordinal = await getNextUsSetupOrdinal(opts.sceneId)
    return {
      slating_system: 'us',
      slate_number: ordinal,
      label: slateDisplayLabel({ slating_system: 'us', slate_prefix: '', slate_number: ordinal }, sceneNumber),
    }
  }
  const prefix = normaliseSlatePrefix(opts.prefix)
  const n = await getNextSlateNumber(productionId, prefix)
  return { slating_system: 'uk', slate_number: n, label: slateDisplayLabel({ slating_system: 'uk', slate_prefix: prefix, slate_number: n }, null) }
}

/** Is this number/setup already used by another live slate under the same system's uniqueness rule? */
async function isSlateNumberTaken(
  slate: { production_id: string; slating_system: SlatingSystem; slate_prefix: string; scene_id: string | null; slate_number: number },
  excludeId?: string
): Promise<boolean> {
  const db = await getDb()
  const rows =
    slate.slating_system === 'us'
      ? await db.select<Array<{ id: string }>>(
          `SELECT id FROM ${SLATES} WHERE scene_id = $1 AND slating_system = 'us' AND slate_number = $2 AND deleted_at IS NULL`,
          [slate.scene_id, slate.slate_number]
        )
      : await db.select<Array<{ id: string }>>(
          `SELECT id FROM ${SLATES}
           WHERE production_id = $1 AND slating_system = 'uk' AND slate_prefix = $2 AND slate_number = $3 AND deleted_at IS NULL`,
          [slate.production_id, slate.slate_prefix, slate.slate_number]
        )
  return rows.some((r) => r.id !== excludeId)
}

async function labelFor(slate: { slating_system: SlatingSystem; slate_prefix: string; slate_number: number; scene_id: string | null; production_id: string }): Promise<string> {
  const sceneNumber =
    slate.slating_system === 'us' && slate.scene_id ? await getSceneNumber(slate.scene_id, slate.production_id) : null
  return slateDisplayLabel(slate, sceneNumber)
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
  /** UK only: series prefix; '' (default) for main unit. Ignored for US. */
  slate_prefix?: string | null
  /** UK only: explicit number; omitted = next consecutive number in the series. */
  slate_number?: number
  /** US only: explicit setup letter ('' = master, 'A', 'B'…); omitted = next setup in the scene. */
  setup_letter?: string
}

function validateSlateFields(fields: SlateFields): void {
  assertOneOf(fields.shot_type, SHOT_TYPES, 'Shot type')
  assertOneOf(fields.sound_mode, SOUND_MODES, 'Sound mode')
}

/**
 * Creates a slate on a shoot day using the production's slating system.
 * UK: next consecutive number in its series unless an explicit free number is given.
 * US: needs a scene; next setup letter in that scene unless an explicit free letter is given.
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

  const system = await getSlatingSystem(input.production_id)
  const sceneId = input.scene_id ?? null
  if (system === 'us' && !sceneId) throw new Error('US slating needs a scene for every slate')
  if (sceneId) await getSceneNumber(sceneId, input.production_id)
  const prefix = system === 'us' ? '' : normaliseSlatePrefix(input.slate_prefix)
  const id = uuid()

  return runInSerializedTransaction(async () => {
    let slateNumber: number
    const explicit =
      system === 'us'
        ? input.setup_letter !== undefined
          ? ordinalForLetterOrThrow(input.setup_letter)
          : null
        : input.slate_number ?? null
    if (explicit != null) {
      assertPositiveInt(explicit, 'Slate number')
      slateNumber = explicit
      const candidate = { production_id: input.production_id, slating_system: system, slate_prefix: prefix, scene_id: sceneId, slate_number: slateNumber }
      if (await isSlateNumberTaken(candidate)) {
        throw new Error(`Slate ${await labelFor(candidate)} is already in use`)
      }
    } else {
      slateNumber =
        system === 'us' ? await getNextUsSetupOrdinal(sceneId!) : await getNextSlateNumber(input.production_id, prefix)
    }

    const ts = now()
    const row: Slate = {
      id,
      production_id: input.production_id,
      slating_system: system,
      shoot_day_id: input.shoot_day_id,
      unit_id: input.unit_id ?? null,
      scene_id: sceneId,
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
        sql: `INSERT INTO ${SLATES} (id, production_id, slating_system, shoot_day_id, unit_id, scene_id, shot_id, slate_prefix,
                slate_number, shot_type, shot_code, description, camera, lens, stop, filter, sound_mode, int_ext, day_night,
                camera_roll, sound_roll, notes, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
        bindValues: [
          row.id, row.production_id, row.slating_system, row.shoot_day_id, row.unit_id, row.scene_id, row.shot_id,
          row.slate_prefix, row.slate_number, row.shot_type, row.shot_code, row.description, row.camera, row.lens,
          row.stop, row.filter, row.sound_mode, row.int_ext, row.day_night, row.camera_roll, row.sound_roll, row.notes,
          ts, ts,
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
  /** UK only. */
  slate_prefix?: string | null
  /** UK only. */
  slate_number?: number
  /** US only: '' = master, 'A', 'B'… */
  setup_letter?: string
}

/**
 * Updates editable slate fields. Renumbering (or, for US, moving to another scene or letter) checks the
 * result is free under the slate's own system. The slate's system never changes.
 */
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

  const isUs = existing.slating_system === 'us'
  const nextSceneId = patch.scene_id !== undefined ? patch.scene_id ?? null : existing.scene_id
  if (isUs && !nextSceneId) throw new Error('US slating needs a scene for every slate')
  if (patch.scene_id) await getSceneNumber(patch.scene_id, existing.production_id)

  const nextPrefix = isUs
    ? ''
    : patch.slate_prefix !== undefined
      ? normaliseSlatePrefix(patch.slate_prefix)
      : existing.slate_prefix
  let nextNumber = existing.slate_number
  if (isUs) {
    if (patch.setup_letter !== undefined) nextNumber = ordinalForLetterOrThrow(patch.setup_letter)
  } else if (patch.slate_number !== undefined) {
    assertPositiveInt(patch.slate_number, 'Slate number')
    nextNumber = patch.slate_number
  }

  const identityChanged =
    nextPrefix !== existing.slate_prefix ||
    nextNumber !== existing.slate_number ||
    (isUs && nextSceneId !== existing.scene_id)
  if (identityChanged) {
    const candidate = { ...existing, slate_prefix: nextPrefix, slate_number: nextNumber, scene_id: nextSceneId }
    if (await isSlateNumberTaken(candidate, id)) {
      throw new Error(`Slate ${await labelFor(candidate)} is already in use`)
    }
    if (nextPrefix !== existing.slate_prefix) push('slate_prefix', nextPrefix)
    if (nextNumber !== existing.slate_number) push('slate_number', nextNumber)
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
    ...outboxRows.map((row) => outboxStatementForRow(row)),
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

// ─── Scene progress marks (SS4, SS5) ────────────────────────────────────────

const SCENE_PROGRESS = 'script_supervisor_scene_progress'

/**
 * A patch: fields left undefined keep their saved value.
 * `marked_status`: 'complete', 'omitted', or null to clear the mark (status falls back to not shot / part shot).
 */
export type SceneProgressInput = {
  marked_status?: 'complete' | 'omitted' | null
  /** Day the scene was completed; required when marking complete. */
  completed_shoot_day_id?: string | null
  /** Part-shot page credit in eighths. */
  credited_eighths?: number | null
  /** Screen time timed by the script supervisor, in seconds. */
  timed_seconds?: number | null
  notes?: string | null
}

type SceneProgressRowDb = {
  marked_status: 'complete' | 'omitted' | null
  completed_shoot_day_id: string | null
  credited_eighths: number | null
  timed_seconds: number | null
  notes: string | null
}

async function getSceneProgressRow(sceneId: string): Promise<SceneProgressRowDb | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT marked_status, completed_shoot_day_id, credited_eighths, timed_seconds, notes FROM ${SCENE_PROGRESS} WHERE scene_id = $1`,
    [sceneId]
  )
  const r = rows[0]
  if (!r) return null
  return {
    marked_status: (r.marked_status as SceneProgressRowDb['marked_status']) ?? null,
    completed_shoot_day_id: str(r.completed_shoot_day_id),
    credited_eighths: r.credited_eighths != null ? coerceNumber(r.credited_eighths, 0) : null,
    timed_seconds: r.timed_seconds != null ? coerceNumber(r.timed_seconds, 0) : null,
    notes: str(r.notes),
  }
}

async function assertShootDayInProduction(shootDayId: string, productionId: string): Promise<void> {
  const db = await getDb()
  const dayRows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM shoot_days WHERE id = $1 AND deleted_at IS NULL`,
    [shootDayId]
  )
  if (dayRows.length === 0) throw new Error('Shoot day not found')
  if (dayRows[0]!.production_id !== productionId) throw new Error('Shoot day belongs to a different production')
}

function assertWholeNonNegative(value: number | null | undefined, message: string): void {
  if (value != null && (!Number.isInteger(value) || value < 0)) throw new Error(message)
}

/**
 * Records the script supervisor's marks for a scene (one row per scene, upserted as a patch): complete on a
 * shoot day, omitted or cleared; a part-shot page credit; timed screen time; notes.
 */
export async function setSceneProgress(productionId: string, sceneId: string, input: SceneProgressInput): Promise<void> {
  await assertLocalProduction(productionId)
  if (input.marked_status != null && !['complete', 'omitted'].includes(input.marked_status)) {
    throw new Error('Scene mark must be complete, omitted or cleared')
  }
  assertWholeNonNegative(input.credited_eighths, 'Pages credited must be a whole number of eighths, zero or more')
  assertWholeNonNegative(input.timed_seconds, 'Screen time must be a whole number of seconds, zero or more')
  await getSceneNumber(sceneId, productionId)

  const existing = await getSceneProgressRow(sceneId)
  const pick = <K extends keyof SceneProgressRowDb>(key: K): SceneProgressRowDb[K] =>
    (input[key] !== undefined ? input[key] : existing?.[key] ?? null) as SceneProgressRowDb[K]

  const markedStatus = pick('marked_status')
  let completedDayId = markedStatus === 'complete' ? pick('completed_shoot_day_id') : null
  if (markedStatus === 'complete') {
    if (!completedDayId) throw new Error('Choose the shoot day the scene was completed on')
    await assertShootDayInProduction(completedDayId, productionId)
  } else {
    completedDayId = null
  }

  const ts = now()
  const row = {
    scene_id: sceneId,
    production_id: productionId,
    marked_status: markedStatus,
    completed_shoot_day_id: completedDayId,
    credited_eighths: pick('credited_eighths'),
    timed_seconds: pick('timed_seconds'),
    notes: pick('notes'),
  }
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `INSERT INTO ${SCENE_PROGRESS} (scene_id, production_id, marked_status, completed_shoot_day_id, credited_eighths, timed_seconds, notes, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (scene_id) DO UPDATE SET marked_status = $3, completed_shoot_day_id = $4,
              credited_eighths = $5, timed_seconds = $6, notes = $7, updated_at = $9`,
      bindValues: [
        row.scene_id, row.production_id, row.marked_status, row.completed_shoot_day_id, row.credited_eighths,
        row.timed_seconds, row.notes, ts, ts,
      ],
    },
    outboxStatementForRow({ entity: SCENE_PROGRESS, entityId: sceneId, operation: 'update', payloadJson: JSON.stringify(row) }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}

// ─── Day log: actual times and remarks (SS5) ────────────────────────────────

const DAY_LOGS = 'script_supervisor_day_logs'

export const DAY_LOG_TIME_FIELDS = [
  'call_time',
  'first_shot_time',
  'lunch_start_time',
  'lunch_end_time',
  'first_shot_after_lunch_time',
  'camera_wrap_time',
  'wrap_time',
] as const

export type DayLogTimeField = (typeof DAY_LOG_TIME_FIELDS)[number]

export type ScriptSupervisorDayLog = { shoot_day_id: string; production_id: string; remarks: string | null } & Record<
  DayLogTimeField,
  string | null
>

export type DayLogPatch = Partial<Record<DayLogTimeField, string | null>> & { remarks?: string | null }

/** HH:MM (24-hour); accepts 'H:MM' and 'HMM'/'HHMM'. Returns null for blank input; throws on anything else. */
export function normaliseDayLogTime(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  const m = raw.match(/^(\d{1,2}):?(\d{2})$/)
  if (!m) throw new Error(`“${raw}” is not a time. Use 24-hour HH:MM, for example 08:15.`)
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) throw new Error(`“${raw}” is not a time. Use 24-hour HH:MM, for example 08:15.`)
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** The day's actual times and remarks; all null when nothing has been logged. */
export async function getDayLog(shootDayId: string): Promise<ScriptSupervisorDayLog | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${DAY_LOGS} WHERE shoot_day_id = $1`, [shootDayId])
  const r = rows[0]
  if (!r) return null
  const log: Record<string, unknown> = {
    shoot_day_id: r.shoot_day_id as string,
    production_id: r.production_id as string,
    remarks: str(r.remarks),
  }
  for (const f of DAY_LOG_TIME_FIELDS) log[f] = str(r[f])
  return log as ScriptSupervisorDayLog
}

/** Saves actual times / remarks for a shoot day as a patch (undefined fields keep their saved value). */
export async function saveDayLog(productionId: string, shootDayId: string, patch: DayLogPatch): Promise<ScriptSupervisorDayLog> {
  await assertLocalProduction(productionId)
  await assertShootDayInProduction(shootDayId, productionId)
  const existing = await getDayLog(shootDayId)
  const next: Record<string, string | null> = {}
  for (const f of DAY_LOG_TIME_FIELDS) {
    next[f] = patch[f] !== undefined ? normaliseDayLogTime(patch[f]) : existing?.[f] ?? null
  }
  const remarks = patch.remarks !== undefined ? (patch.remarks?.trim() || null) : existing?.remarks ?? null

  const ts = now()
  const cols = [...DAY_LOG_TIME_FIELDS, 'remarks'] as const
  const values = [...DAY_LOG_TIME_FIELDS.map((f) => next[f]), remarks]
  // $1 shoot_day_id, $2 production_id, $3..$10 fields, $11 created, $12 updated
  const placeholders = cols.map((_, i) => `$${i + 3}`).join(', ')
  const updates = cols.map((c, i) => `${c} = $${i + 3}`).join(', ')
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `INSERT INTO ${DAY_LOGS} (shoot_day_id, production_id, ${cols.join(', ')}, created_at, updated_at)
            VALUES ($1, $2, ${placeholders}, $${cols.length + 3}, $${cols.length + 4})
            ON CONFLICT (shoot_day_id) DO UPDATE SET ${updates}, updated_at = $${cols.length + 4}`,
      bindValues: [shootDayId, productionId, ...values, ts, ts],
    },
    outboxStatementForRow({
      entity: DAY_LOGS,
      entityId: shootDayId,
      operation: 'update',
      payloadJson: JSON.stringify({ ...next, remarks }),
    }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
  return (await getDayLog(shootDayId))!
}
