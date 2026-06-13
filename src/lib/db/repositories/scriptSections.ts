import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush, outboxStatementForRow, type OutboxRow } from '../outbox'
import { coerceBoolean, coerceNumber } from '../sqlValueCoercion'
import type {
  ScriptSection,
  ScriptSectionCharacter,
  ScriptSectionRange,
  ScriptSectionStatus,
  ScriptSectionType,
  Shot,
} from '../types'

const TABLE = 'script_sections'
const RANGES_TABLE = 'script_section_ranges'
const CHARACTERS_TABLE = 'script_section_characters'
const LINK_TABLE = 'shot_script_sections'
const SHOT_TABLE = 'shots'
const SCENE_TABLE = 'scenes'

type Stmt = { sql: string; bindValues: unknown[] }

// ─── Row mappers ────────────────────────────────────────────────────────────

function rowToScriptSection(r: Record<string, unknown>): ScriptSection {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    script_version_id: r.script_version_id as string,
    scene_id: r.scene_id as string,
    episode_id: (r.episode_id as string | null) ?? null,
    label: (r.label as string | null) ?? null,
    section_type: r.section_type as ScriptSectionType,
    status: (r.status as ScriptSectionStatus) ?? 'unplanned',
    notes: (r.notes as string | null) ?? null,
    is_manual: coerceBoolean(r.is_manual, false) ? 1 : 0,
    ranges_user_edited: coerceBoolean(r.ranges_user_edited, false) ? 1 : 0,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function rowToRange(r: Record<string, unknown>): ScriptSectionRange {
  return {
    id: r.id as string,
    section_id: r.section_id as string,
    start_page: (r.start_page as string | null) ?? null,
    start_eighth: r.start_eighth != null ? coerceNumber(r.start_eighth, 0) : null,
    end_page: (r.end_page as string | null) ?? null,
    end_eighth: r.end_eighth != null ? coerceNumber(r.end_eighth, 0) : null,
    start_offset: r.start_offset != null ? coerceNumber(r.start_offset, 0) : null,
    end_offset: r.end_offset != null ? coerceNumber(r.end_offset, 0) : null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function rowToCharacter(r: Record<string, unknown>): ScriptSectionCharacter {
  return {
    id: r.id as string,
    section_id: r.section_id as string,
    person_id: (r.person_id as string | null) ?? null,
    character_name: (r.character_name as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function rowToShot(r: Record<string, unknown>): Shot {
  return {
    id: r.id as string,
    scene_id: r.scene_id as string,
    shot_number: r.shot_number as string,
    description: (r.description as string | null) ?? null,
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
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

/** Builds `$n, $n+1, ...` placeholders for an IN clause starting at `start`. */
function inPlaceholders(count: number, start = 1): string {
  return Array.from({ length: count }, (_, i) => `$${start + i}`).join(', ')
}

// ─── Input types ────────────────────────────────────────────────────────────

export type CreateScriptSectionData = {
  production_id: string
  script_version_id: string
  scene_id: string
  episode_id?: string | null
  label?: string | null
  section_type: ScriptSectionType
  status?: ScriptSectionStatus
  notes?: string | null
  is_manual?: boolean
}

export type ScriptSectionRangeInput = {
  start_page?: string | null
  start_eighth?: number | null
  end_page?: string | null
  end_eighth?: number | null
  start_offset?: number | null
  end_offset?: number | null
}

export type ScriptSectionCharacterInput = {
  person_id?: string | null
  character_name?: string | null
}

// ─── Statement builders ─────────────────────────────────────────────────────

function buildSectionInsert(id: string, ts: string, data: CreateScriptSectionData): Stmt {
  return {
    sql: `INSERT INTO ${TABLE} (id, production_id, script_version_id, scene_id, episode_id, label, section_type, status, notes, is_manual, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    bindValues: [
      id,
      data.production_id,
      data.script_version_id,
      data.scene_id,
      data.episode_id ?? null,
      data.label ?? null,
      data.section_type,
      data.status ?? 'unplanned',
      data.notes ?? null,
      data.is_manual ? 1 : 0,
      ts,
      ts,
    ],
  }
}

function buildRangeInsert(id: string, sectionId: string, ts: string, range: ScriptSectionRangeInput): Stmt {
  return {
    sql: `INSERT INTO ${RANGES_TABLE} (id, section_id, start_page, start_eighth, end_page, end_eighth, start_offset, end_offset, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    bindValues: [
      id,
      sectionId,
      range.start_page ?? null,
      range.start_eighth ?? null,
      range.end_page ?? null,
      range.end_eighth ?? null,
      range.start_offset ?? null,
      range.end_offset ?? null,
      ts,
      ts,
    ],
  }
}

function buildCharacterInsert(
  id: string,
  sectionId: string,
  ts: string,
  character: ScriptSectionCharacterInput
): Stmt {
  return {
    sql: `INSERT INTO ${CHARACTERS_TABLE} (id, section_id, person_id, character_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    bindValues: [id, sectionId, character.person_id ?? null, character.character_name ?? null, ts, ts],
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function getScriptSectionById(id: string): Promise<ScriptSection | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToScriptSection(rows[0]!) : null
}

/** Batch-load sections by id (preserves input order; skips missing ids). */
export async function listSectionsByIds(ids: string[]): Promise<ScriptSection[]> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return []
  const db = await getDb()
  const placeholders = unique.map((_, i) => `$${i + 1}`).join(', ')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    unique
  )
  const byId = new Map(rows.map((r) => [r.id as string, rowToScriptSection(r)]))
  return ids.map((id) => byId.get(id)).filter((s): s is ScriptSection => s != null)
}

export async function listSectionsByScene(sceneId: string): Promise<ScriptSection[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE scene_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [sceneId]
  )
  return rows.map(rowToScriptSection)
}

export async function listSectionsByScriptVersion(scriptVersionId: string): Promise<ScriptSection[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE script_version_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [scriptVersionId]
  )
  return rows.map(rowToScriptSection)
}

export async function listSectionsByShot(shotId: string): Promise<ScriptSection[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT s.* FROM ${TABLE} s
     INNER JOIN ${LINK_TABLE} l ON l.script_section_id = s.id AND l.deleted_at IS NULL
     WHERE l.shot_id = $1 AND s.deleted_at IS NULL
     ORDER BY l.sort_index, s.created_at`,
    [shotId]
  )
  return rows.map(rowToScriptSection)
}

/**
 * Placeholder: sections linked (via shots scheduled on the shoot day) to the given shoot day.
 * Returns only existing shot<->section links; no sides derivation logic. Shots reach a shoot day
 * through stripboard_strips (SHOT strips reference shot_id and shoot_day_id).
 */
export async function listSectionsForShootDay(shootDayId: string): Promise<ScriptSection[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT DISTINCT s.* FROM ${TABLE} s
     INNER JOIN ${LINK_TABLE} l ON l.script_section_id = s.id AND l.deleted_at IS NULL
     INNER JOIN stripboard_strips strip ON strip.shot_id = l.shot_id AND strip.deleted_at IS NULL
     WHERE strip.shoot_day_id = $1 AND s.deleted_at IS NULL
     ORDER BY s.created_at`,
    [shootDayId]
  )
  return rows.map(rowToScriptSection)
}

export async function listRangesBySection(sectionId: string): Promise<ScriptSectionRange[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${RANGES_TABLE} WHERE section_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [sectionId]
  )
  return rows.map(rowToRange)
}

export async function listCharactersBySection(sectionId: string): Promise<ScriptSectionCharacter[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${CHARACTERS_TABLE} WHERE section_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [sectionId]
  )
  return rows.map(rowToCharacter)
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export async function createScriptSection(data: CreateScriptSectionData): Promise<ScriptSection> {
  const id = uuid()
  const ts = now()
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      buildSectionInsert(id, ts, data),
      outboxStatementForRow({
        entity: TABLE,
        entityId: id,
        operation: 'create',
        payloadJson: JSON.stringify({ ...data, id }),
      }),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
  return (await getScriptSectionById(id))!
}

export type CreateSectionWithDetailsData = CreateScriptSectionData & {
  ranges?: ScriptSectionRangeInput[]
  characters?: ScriptSectionCharacterInput[]
}

/**
 * Returns the data + outbox statements to create a section together with its ranges and
 * characters, for composition into a larger executeBatch. Does NOT include BEGIN/COMMIT.
 * Caller provides the section id and timestamp. No per-row async loops.
 */
export function buildCreateSectionWithDetailsStatements(
  sectionId: string,
  ts: string,
  data: CreateSectionWithDetailsData
): Stmt[] {
  const { ranges = [], characters = [], ...sectionData } = data

  const statements: Stmt[] = [buildSectionInsert(sectionId, ts, sectionData)]
  const outboxRows: OutboxRow[] = [
    {
      entity: TABLE,
      entityId: sectionId,
      operation: 'create',
      payloadJson: JSON.stringify({ ...sectionData, id: sectionId }),
    },
  ]

  for (const range of ranges) {
    const rangeId = uuid()
    statements.push(buildRangeInsert(rangeId, sectionId, ts, range))
    outboxRows.push({
      entity: RANGES_TABLE,
      entityId: rangeId,
      operation: 'create',
      payloadJson: JSON.stringify({ ...range, id: rangeId, section_id: sectionId }),
    })
  }

  for (const character of characters) {
    const characterId = uuid()
    statements.push(buildCharacterInsert(characterId, sectionId, ts, character))
    outboxRows.push({
      entity: CHARACTERS_TABLE,
      entityId: characterId,
      operation: 'create',
      payloadJson: JSON.stringify({ ...character, id: characterId, section_id: sectionId }),
    })
  }

  for (const row of outboxRows) statements.push(outboxStatementForRow(row))
  return statements
}

/**
 * Soft-deletes all generated (non-manual) sections for a script version, along with their
 * ranges and characters, for composition into a larger executeBatch. Manual sections
 * (is_manual = 1) are never touched. Does NOT include BEGIN/COMMIT.
 *
 * `sectionIds` is the list of non-manual section ids the caller intends to remove; it is used
 * to emit row-level outbox deletes. The UPDATE statements themselves are scoped by
 * script_version_id + is_manual = 0 so they remain correct even if the list is stale.
 */
export function buildSoftDeleteNonManualSectionsStatements(
  scriptVersionId: string,
  sectionIds: string[],
  ts: string
): Stmt[] {
  const statements: Stmt[] = [
    {
      sql: `UPDATE ${RANGES_TABLE} SET deleted_at = $1, updated_at = $2
       WHERE deleted_at IS NULL AND section_id IN (
         SELECT id FROM ${TABLE} WHERE script_version_id = $3 AND is_manual = 0
       )`,
      bindValues: [ts, ts, scriptVersionId],
    },
    {
      sql: `UPDATE ${CHARACTERS_TABLE} SET deleted_at = $1, updated_at = $2
       WHERE deleted_at IS NULL AND section_id IN (
         SELECT id FROM ${TABLE} WHERE script_version_id = $3 AND is_manual = 0
       )`,
      bindValues: [ts, ts, scriptVersionId],
    },
    {
      sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2
       WHERE deleted_at IS NULL AND script_version_id = $3 AND is_manual = 0`,
      bindValues: [ts, ts, scriptVersionId],
    },
  ]
  for (const sectionId of sectionIds) {
    statements.push(
      outboxStatementForRow({ entity: TABLE, entityId: sectionId, operation: 'delete', payloadJson: null })
    )
  }
  return statements
}

/**
 * Creates a section together with its ranges and characters in a single transaction.
 * Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md; no per-row async loops.
 */
export async function createSectionWithRangesAndCharacters(
  data: CreateSectionWithDetailsData
): Promise<ScriptSection> {
  const sectionId = uuid()
  const ts = now()

  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildCreateSectionWithDetailsStatements(sectionId, ts, data),
    { sql: 'COMMIT', bindValues: [] },
  ]

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })

  return (await getScriptSectionById(sectionId))!
}

const SECTION_EDITABLE_KEYS = [
  'scene_id',
  'episode_id',
  'label',
  'section_type',
  'status',
  'notes',
  'is_manual',
  'ranges_user_edited',
] as const

export type UpdateScriptSectionPatch = {
  scene_id?: string
  episode_id?: string | null
  label?: string | null
  section_type?: ScriptSectionType
  status?: ScriptSectionStatus
  notes?: string | null
  is_manual?: boolean
  ranges_user_edited?: boolean
}

export async function updateScriptSection(
  id: string,
  patch: UpdateScriptSectionPatch
): Promise<ScriptSection> {
  const db = await getDb()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of SECTION_EDITABLE_KEYS) {
    if (patch[k] !== undefined) {
      cols.push(`${k} = $${i++}`)
      vals.push(k === 'is_manual' || k === 'ranges_user_edited' ? (patch[k] ? 1 : 0) : patch[k])
    }
  }
  if (cols.length === 0) {
    const existing = await getScriptSectionById(id)
    if (!existing) throw new Error(`Script section not found: ${id}`)
    return existing
  }
  const ts = now()
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(
    `UPDATE ${TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1} AND deleted_at IS NULL`,
    vals
  )
  await outboxPush(TABLE, id, 'update', JSON.stringify(patch))
  return (await getScriptSectionById(id))!
}

export async function softDeleteScriptSection(id: string): Promise<void> {
  await softDeleteSectionWithChildren(id)
}

/**
 * Soft-deletes a section together with its ranges and characters in one transaction.
 * The SB1 schema only cascades on hard DELETE; the app uses soft deletes, so child
 * ranges/characters must be marked explicitly here. Emits matching outbox rows.
 */
export async function softDeleteSectionWithChildren(sectionId: string): Promise<void> {
  const ts = now()
  const db = await getDb()
  const rangeIds = (await listRangesBySection(sectionId)).map((r) => r.id)
  const characterIds = (await listCharactersBySection(sectionId)).map((c) => c.id)
  const linkRows = await db.select<Array<{ id: string }>>(
    `SELECT id FROM ${LINK_TABLE} WHERE script_section_id = $1 AND deleted_at IS NULL`,
    [sectionId]
  )

  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE ${RANGES_TABLE} SET deleted_at = $1, updated_at = $2 WHERE section_id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, sectionId],
    },
    {
      sql: `UPDATE ${CHARACTERS_TABLE} SET deleted_at = $1, updated_at = $2 WHERE section_id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, sectionId],
    },
    ...linkRows.map((row) => ({
      sql: `UPDATE ${LINK_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, row.id],
    })),
    {
      sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, sectionId],
    },
  ]

  const outboxRows: OutboxRow[] = [
    ...rangeIds.map((id) => ({ entity: RANGES_TABLE, entityId: id, operation: 'delete' as const, payloadJson: null })),
    ...characterIds.map((id) => ({
      entity: CHARACTERS_TABLE,
      entityId: id,
      operation: 'delete' as const,
      payloadJson: null,
    })),
    ...linkRows.map((row) => ({
      entity: LINK_TABLE,
      entityId: row.id,
      operation: 'delete' as const,
      payloadJson: null,
    })),
    { entity: TABLE, entityId: sectionId, operation: 'delete' as const, payloadJson: null },
  ]
  for (const row of outboxRows) statements.push(outboxStatementForRow(row))
  statements.push({ sql: 'COMMIT', bindValues: [] })

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}

/**
 * Builds the statements to replace all ranges for a section (soft-delete existing, insert new),
 * for composition into a larger executeBatch. Does NOT include BEGIN/COMMIT.
 */
export function buildReplaceSectionRangesStatements(
  sectionId: string,
  ts: string,
  ranges: ScriptSectionRangeInput[]
): Stmt[] {
  const statements: Stmt[] = [
    {
      sql: `UPDATE ${RANGES_TABLE} SET deleted_at = $1, updated_at = $2 WHERE section_id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, sectionId],
    },
  ]
  const outboxRows: OutboxRow[] = [
    { entity: RANGES_TABLE, entityId: sectionId, operation: 'delete', payloadJson: null },
  ]
  for (const range of ranges) {
    const rangeId = uuid()
    statements.push(buildRangeInsert(rangeId, sectionId, ts, range))
    outboxRows.push({
      entity: RANGES_TABLE,
      entityId: rangeId,
      operation: 'create',
      payloadJson: JSON.stringify({ ...range, id: rangeId, section_id: sectionId }),
    })
  }
  for (const row of outboxRows) statements.push(outboxStatementForRow(row))
  return statements
}

/**
 * Builds the statements to replace all characters for a section (soft-delete existing, insert new),
 * for composition into a larger executeBatch. Does NOT include BEGIN/COMMIT.
 */
export function buildReplaceSectionCharactersStatements(
  sectionId: string,
  ts: string,
  characters: ScriptSectionCharacterInput[]
): Stmt[] {
  const statements: Stmt[] = [
    {
      sql: `UPDATE ${CHARACTERS_TABLE} SET deleted_at = $1, updated_at = $2 WHERE section_id = $3 AND deleted_at IS NULL`,
      bindValues: [ts, ts, sectionId],
    },
  ]
  const outboxRows: OutboxRow[] = [
    { entity: CHARACTERS_TABLE, entityId: sectionId, operation: 'delete', payloadJson: null },
  ]
  for (const character of characters) {
    const characterId = uuid()
    statements.push(buildCharacterInsert(characterId, sectionId, ts, character))
    outboxRows.push({
      entity: CHARACTERS_TABLE,
      entityId: characterId,
      operation: 'create',
      payloadJson: JSON.stringify({ ...character, id: characterId, section_id: sectionId }),
    })
  }
  for (const row of outboxRows) statements.push(outboxStatementForRow(row))
  return statements
}

/**
 * Replaces all ranges for a section in one transaction (soft-delete existing, insert new).
 * When `markUserEdited` is true, sets `ranges_user_edited` on the parent section.
 */
export async function replaceSectionRanges(
  sectionId: string,
  ranges: ScriptSectionRangeInput[],
  options?: { markUserEdited?: boolean }
): Promise<ScriptSectionRange[]> {
  const ts = now()
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    ...buildReplaceSectionRangesStatements(sectionId, ts, ranges),
  ]
  if (options?.markUserEdited) {
    statements.push({
      sql: `UPDATE ${TABLE} SET ranges_user_edited = 1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`,
      bindValues: [ts, sectionId],
    })
    statements.push(outboxStatementForRow({ entity: TABLE, entityId: sectionId, operation: 'update', payloadJson: null }))
  }
  statements.push({ sql: 'COMMIT', bindValues: [] })

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
  return listRangesBySection(sectionId)
}

/**
 * Replaces all characters for a section in one transaction (soft-delete existing, insert new).
 */
export async function replaceSectionCharacters(
  sectionId: string,
  characters: ScriptSectionCharacterInput[]
): Promise<ScriptSectionCharacter[]> {
  const ts = now()
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      ...buildReplaceSectionCharactersStatements(sectionId, ts, characters),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
  return listCharactersBySection(sectionId)
}

// ─── Shot <-> section links ─────────────────────────────────────────────────

export type LinkShotToSectionData = {
  coverage_notes?: string | null
  sort_index?: number
}

/**
 * Resolves a shot's production (via its scene) and a section's production, and throws when
 * they differ or either is missing. Shots carry no production_id, so the shot is scoped through
 * `scenes.production_id`. Used to keep every shot<->section link production-scoped.
 */
export async function assertShotAndSectionSameProduction(
  shotId: string,
  scriptSectionId: string
): Promise<void> {
  await assertShotAndSectionsSameProduction(shotId, [scriptSectionId])
}

/** Validates that a shot and every target section share the same production (single read round-trip). */
export async function assertShotAndSectionsSameProduction(
  shotId: string,
  scriptSectionIds: string[]
): Promise<void> {
  const unique = [...new Set(scriptSectionIds)]
  if (unique.length === 0) return
  const db = await getDb()
  const shotRows = await db.select<Array<{ production_id: string }>>(
    `SELECT sc.production_id AS production_id
     FROM ${SHOT_TABLE} sh
     INNER JOIN ${SCENE_TABLE} sc ON sc.id = sh.scene_id AND sc.deleted_at IS NULL
     WHERE sh.id = $1 AND sh.deleted_at IS NULL`,
    [shotId]
  )
  if (!shotRows.length) throw new Error(`Shot not found: ${shotId}`)
  const shotProductionId = shotRows[0]!.production_id
  const placeholders = unique.map((_, i) => `$${i + 1}`).join(', ')
  const sectionRows = await db.select<Array<{ id: string; production_id: string }>>(
    `SELECT id, production_id FROM ${TABLE} WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    unique
  )
  if (sectionRows.length !== unique.length) {
    const found = new Set(sectionRows.map((r) => r.id))
    const missing = unique.find((id) => !found.has(id))
    throw new Error(`Script section not found: ${missing}`)
  }
  for (const row of sectionRows) {
    if (row.production_id !== shotProductionId) {
      throw new Error(
        `Cannot link shot ${shotId} to section ${row.id}: different productions`
      )
    }
  }
}

/** Returns existing link rows (active and soft-deleted) for a shot, keyed by section id. */
async function getExistingLinkRowsByShot(
  shotId: string
): Promise<Map<string, { id: string; deleted_at: string | null }>> {
  const db = await getDb()
  const rows = await db.select<Array<{ id: string; script_section_id: string; deleted_at: string | null }>>(
    `SELECT id, script_section_id, deleted_at FROM ${LINK_TABLE} WHERE shot_id = $1`,
    [shotId]
  )
  const map = new Map<string, { id: string; deleted_at: string | null }>()
  for (const r of rows) map.set(r.script_section_id, { id: r.id, deleted_at: r.deleted_at ?? null })
  return map
}

function buildLinkUpsert(
  id: string,
  shotId: string,
  scriptSectionId: string,
  coverageNotes: string | null,
  sortIndex: number,
  ts: string
): Stmt {
  return {
    sql: `INSERT INTO ${LINK_TABLE} (id, shot_id, script_section_id, coverage_notes, sort_index, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(shot_id, script_section_id) DO UPDATE SET
       coverage_notes = excluded.coverage_notes,
       sort_index = excluded.sort_index,
       deleted_at = NULL,
       updated_at = excluded.updated_at`,
    bindValues: [id, shotId, scriptSectionId, coverageNotes, sortIndex, ts, ts],
  }
}

/**
 * Links a shot to a script section. Idempotent: re-linking a previously unlinked pair
 * revives the row (UNIQUE(shot_id, script_section_id)). Validates same-production scope.
 */
export async function linkShotToSection(
  shotId: string,
  scriptSectionId: string,
  data: LinkShotToSectionData = {}
): Promise<void> {
  await assertShotAndSectionSameProduction(shotId, scriptSectionId)
  const existing = await getExistingLinkRowsByShot(shotId)
  const id = existing.get(scriptSectionId)?.id ?? uuid()
  const ts = now()
  const coverageNotes = data.coverage_notes ?? null
  const sortIndex = data.sort_index ?? 0
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      buildLinkUpsert(id, shotId, scriptSectionId, coverageNotes, sortIndex, ts),
      outboxStatementForRow({
        entity: LINK_TABLE,
        entityId: id,
        operation: 'create',
        payloadJson: JSON.stringify({
          shot_id: shotId,
          script_section_id: scriptSectionId,
          coverage_notes: coverageNotes,
          sort_index: sortIndex,
        }),
      }),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}

/**
 * Links a shot to several sections at once. Input is de-duplicated; existing links are revived
 * (UNIQUE(shot_id, script_section_id) prevents duplicates). Sections are assigned an incrementing
 * sort_index in the order given. Validates that every section shares the shot's production.
 */
export async function linkShotToSections(
  shotId: string,
  scriptSectionIds: string[],
  data: LinkShotToSectionData = {}
): Promise<void> {
  const unique = [...new Set(scriptSectionIds)]
  if (unique.length === 0) return
  await assertShotAndSectionsSameProduction(shotId, unique)
  const existing = await getExistingLinkRowsByShot(shotId)
  const ts = now()
  const coverageNotes = data.coverage_notes ?? null
  const baseSortIndex = data.sort_index ?? 0
  const statements: Stmt[] = [{ sql: 'BEGIN', bindValues: [] }]
  const outboxRows: OutboxRow[] = []
  unique.forEach((sectionId, index) => {
    const id = existing.get(sectionId)?.id ?? uuid()
    const sortIndex = baseSortIndex + index
    statements.push(buildLinkUpsert(id, shotId, sectionId, coverageNotes, sortIndex, ts))
    outboxRows.push({
      entity: LINK_TABLE,
      entityId: id,
      operation: 'create',
      payloadJson: JSON.stringify({
        shot_id: shotId,
        script_section_id: sectionId,
        coverage_notes: coverageNotes,
        sort_index: sortIndex,
      }),
    })
  })
  for (const row of outboxRows) statements.push(outboxStatementForRow(row))
  statements.push({ sql: 'COMMIT', bindValues: [] })
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}

/**
 * Replaces the full set of section links for a shot in one transaction: links not in the new set
 * are soft-deleted, links in the set are upserted/revived with sort_index matching the given order.
 * Validates that every target section shares the shot's production.
 */
export async function replaceShotSectionLinks(
  shotId: string,
  scriptSectionIds: string[]
): Promise<void> {
  const unique = [...new Set(scriptSectionIds)]
  if (unique.length > 0) {
    await assertShotAndSectionsSameProduction(shotId, unique)
  }
  const existing = await getExistingLinkRowsByShot(shotId)
  const ts = now()
  const targetSet = new Set(unique)

  const statements: Stmt[] = [{ sql: 'BEGIN', bindValues: [] }]
  const outboxRows: OutboxRow[] = []

  // Soft-delete active links whose section is no longer in the target set.
  for (const [sectionId, row] of existing) {
    if (!targetSet.has(sectionId) && row.deleted_at == null) {
      statements.push({
        sql: `UPDATE ${LINK_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
        bindValues: [ts, ts, row.id],
      })
      outboxRows.push({ entity: LINK_TABLE, entityId: row.id, operation: 'delete', payloadJson: null })
    }
  }

  // Upsert/revive links in the target set, preserving order via sort_index.
  unique.forEach((sectionId, index) => {
    const id = existing.get(sectionId)?.id ?? uuid()
    statements.push(buildLinkUpsert(id, shotId, sectionId, null, index, ts))
    outboxRows.push({
      entity: LINK_TABLE,
      entityId: id,
      operation: 'create',
      payloadJson: JSON.stringify({
        shot_id: shotId,
        script_section_id: sectionId,
        coverage_notes: null,
        sort_index: index,
      }),
    })
  })

  for (const row of outboxRows) statements.push(outboxStatementForRow(row))
  statements.push({ sql: 'COMMIT', bindValues: [] })

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}

async function getLinkId(shotId: string, scriptSectionId: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<Array<{ id: string }>>(
    `SELECT id FROM ${LINK_TABLE} WHERE shot_id = $1 AND script_section_id = $2 LIMIT 1`,
    [shotId, scriptSectionId]
  )
  return rows.length ? rows[0]!.id : null
}

export async function unlinkShotFromSection(shotId: string, scriptSectionId: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  const linkId = await getLinkId(shotId, scriptSectionId)
  await db.execute(
    `UPDATE ${LINK_TABLE} SET deleted_at = $1, updated_at = $2 WHERE shot_id = $3 AND script_section_id = $4 AND deleted_at IS NULL`,
    [ts, ts, shotId, scriptSectionId]
  )
  if (linkId) await outboxPush(LINK_TABLE, linkId, 'delete', null)
}

/** Reverse lookup: shots linked (active links) to a given section, ordered by shot number. */
export async function listShotsBySection(scriptSectionId: string): Promise<Shot[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT sh.* FROM ${SHOT_TABLE} sh
     INNER JOIN ${LINK_TABLE} l ON l.shot_id = sh.id AND l.deleted_at IS NULL
     WHERE l.script_section_id = $1 AND sh.deleted_at IS NULL
     ORDER BY l.sort_index, sh.shot_number`,
    [scriptSectionId]
  )
  return rows.map(rowToShot)
}

// ─── Coverage batch reads ─────────────────────────────────────────────────────

/** Number of active section links per shot. Shots with no links are omitted from the map. */
export async function getLinkedSectionCountsByShotIds(
  shotIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (shotIds.length === 0) return result
  const db = await getDb()
  const rows = await db.select<Array<{ shot_id: string; count: number }>>(
    `SELECT shot_id, COUNT(*) AS count FROM ${LINK_TABLE}
     WHERE deleted_at IS NULL AND shot_id IN (${inPlaceholders(shotIds.length)})
     GROUP BY shot_id`,
    shotIds
  )
  for (const r of rows) result.set(r.shot_id, coerceNumber(r.count, 0))
  return result
}

/** Number of active shot links per section. Sections with no links are omitted from the map. */
export async function getLinkedShotCountsBySectionIds(
  sectionIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (sectionIds.length === 0) return result
  const db = await getDb()
  const rows = await db.select<Array<{ script_section_id: string; count: number }>>(
    `SELECT script_section_id, COUNT(*) AS count FROM ${LINK_TABLE}
     WHERE deleted_at IS NULL AND script_section_id IN (${inPlaceholders(sectionIds.length)})
     GROUP BY script_section_id`,
    sectionIds
  )
  for (const r of rows) result.set(r.script_section_id, coerceNumber(r.count, 0))
  return result
}

/** Active ranges for many sections at once, keyed by section id. */
export async function listRangesBySectionIds(
  sectionIds: string[]
): Promise<Map<string, ScriptSectionRange[]>> {
  const result = new Map<string, ScriptSectionRange[]>()
  if (sectionIds.length === 0) return result
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${RANGES_TABLE}
     WHERE deleted_at IS NULL AND section_id IN (${inPlaceholders(sectionIds.length)})
     ORDER BY created_at`,
    sectionIds
  )
  for (const r of rows) {
    const range = rowToRange(r)
    const list = result.get(range.section_id) ?? []
    list.push(range)
    result.set(range.section_id, list)
  }
  return result
}

/** Active characters for many sections at once, keyed by section id. */
export async function listCharactersBySectionIds(
  sectionIds: string[]
): Promise<Map<string, ScriptSectionCharacter[]>> {
  const result = new Map<string, ScriptSectionCharacter[]>()
  if (sectionIds.length === 0) return result
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${CHARACTERS_TABLE}
     WHERE deleted_at IS NULL AND section_id IN (${inPlaceholders(sectionIds.length)})
     ORDER BY created_at`,
    sectionIds
  )
  for (const r of rows) {
    const character = rowToCharacter(r)
    const list = result.get(character.section_id) ?? []
    list.push(character)
    result.set(character.section_id, list)
  }
  return result
}

/**
 * Active sections linked to many shots at once, keyed by shot id. Sections are ordered by the
 * link's sort_index then section created_at, matching listSectionsByShot. Shots with no active
 * links are omitted from the map.
 */
export async function listSectionsByShotIds(
  shotIds: string[]
): Promise<Map<string, ScriptSection[]>> {
  const result = new Map<string, ScriptSection[]>()
  if (shotIds.length === 0) return result
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT l.shot_id AS link_shot_id, s.* FROM ${TABLE} s
     INNER JOIN ${LINK_TABLE} l ON l.script_section_id = s.id AND l.deleted_at IS NULL
     WHERE s.deleted_at IS NULL AND l.shot_id IN (${inPlaceholders(shotIds.length)})
     ORDER BY l.sort_index, s.created_at`,
    shotIds
  )
  for (const r of rows) {
    const shotId = r.link_shot_id as string
    const section = rowToScriptSection(r)
    const list = result.get(shotId) ?? []
    list.push(section)
    result.set(shotId, list)
  }
  return result
}
