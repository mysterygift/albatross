/**
 * Script Supervisor lining (SS6): script elements and tramlines. Local SQLite only.
 *
 * Elements are generated lazily from `script_pages` the first time a script version is lined, inside one
 * serialized transaction (so two views can never generate twice). They are derived data, so no outbox rows
 * are written for them. Tramline writes follow DOCS/database.md with outbox rows in the same batch.
 */
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import { coerceNumber } from '../sqlValueCoercion'
import type { SlateShotType, SlatingSystem } from '../types'
import { assertScriptSupervisorLocal } from './scriptSupervisor'
import { blocksFromPageText, type ScriptElementType } from '@/lib/script-supervisor/scriptElements'
import type { LiningElement, LiningTramline, SegmentState } from '@/lib/script-supervisor/lining'
import { slateDisplayLabel } from '@/lib/script-supervisor/slateNumbering'

type Stmt = { sql: string; bindValues: unknown[] }

const ELEMENTS = 'script_elements'
const TRAMLINES = 'tramlines'
const SEGMENTS = 'tramline_segments'

const ELEMENT_COLUMNS = [
  'id', 'production_id', 'script_version_id', 'scene_id', 'script_page_id', 'sort_index', 'element_type',
  'character_name', 'text', 'page_number', 'created_at', 'updated_at',
] as const
const ELEMENT_INSERT_BATCH = 40

function rowToElement(r: Record<string, unknown>): LiningElement {
  return {
    id: r.id as string,
    scene_id: (r.scene_id as string | null) ?? null,
    sort_index: coerceNumber(r.sort_index, 0),
    element_type: r.element_type as ScriptElementType,
    character_name: (r.character_name as string | null) ?? null,
    text: (r.text as string) ?? '',
    page_number: (r.page_number as string | null) ?? null,
  }
}

// ─── Script version and elements ────────────────────────────────────────────

/** Latest live script version that contains this scene (via its pages), or null. */
export async function getScriptVersionIdForScene(productionId: string, sceneId: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<Array<{ id: string }>>(
    `SELECT v.id FROM script_versions v
     WHERE v.production_id = $1 AND v.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM script_pages p WHERE p.script_version_id = v.id AND p.scene_id = $2 AND p.deleted_at IS NULL)
     ORDER BY v.created_at DESC, v.id DESC LIMIT 1`,
    [productionId, sceneId]
  )
  return rows[0]?.id ?? null
}

/**
 * Generates elements for a script version from its pages if it has none yet. Idempotent and safe to call
 * on every view. Returns the number of elements the version has.
 */
export async function ensureScriptElements(scriptVersionId: string): Promise<number> {
  return runInSerializedTransaction(async () => {
    const db = await getDb()
    const existing = await db.select<Array<{ n: unknown }>>(
      `SELECT COUNT(*) AS n FROM ${ELEMENTS} WHERE script_version_id = $1 AND deleted_at IS NULL`,
      [scriptVersionId]
    )
    const count = coerceNumber(existing[0]?.n, 0)
    if (count > 0) return count

    const versionRows = await db.select<Array<{ production_id: string }>>(
      `SELECT production_id FROM script_versions WHERE id = $1 AND deleted_at IS NULL`,
      [scriptVersionId]
    )
    if (versionRows.length === 0) throw new Error('Script version not found')
    const productionId = versionRows[0]!.production_id

    const pages = await db.select<Record<string, unknown>[]>(
      `SELECT id, scene_id, page_number, content FROM script_pages
       WHERE script_version_id = $1 AND deleted_at IS NULL ORDER BY page_index`,
      [scriptVersionId]
    )
    const ts = now()
    const rows: unknown[][] = []
    let sort = 0
    for (const page of pages) {
      for (const block of blocksFromPageText((page.content as string | null) ?? '')) {
        rows.push([
          uuid(), productionId, scriptVersionId, (page.scene_id as string | null) ?? null, page.id as string, sort++,
          block.element_type, block.character_name, block.text, (page.page_number as string | null) ?? null, ts, ts,
        ])
      }
    }
    if (rows.length === 0) return 0

    const statements: Stmt[] = [{ sql: 'BEGIN', bindValues: [] }]
    for (let i = 0; i < rows.length; i += ELEMENT_INSERT_BATCH) {
      const chunk = rows.slice(i, i + ELEMENT_INSERT_BATCH)
      const width = ELEMENT_COLUMNS.length
      const placeholders = chunk
        .map((_, r) => `(${ELEMENT_COLUMNS.map((__, c) => `$${r * width + c + 1}`).join(', ')})`)
        .join(', ')
      statements.push({
        sql: `INSERT INTO ${ELEMENTS} (${ELEMENT_COLUMNS.join(', ')}) VALUES ${placeholders}`,
        bindValues: chunk.flat(),
      })
    }
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
    return rows.length
  })
}

export async function listScriptElementsForScene(scriptVersionId: string, sceneId: string): Promise<LiningElement[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${ELEMENTS} WHERE script_version_id = $1 AND scene_id = $2 AND deleted_at IS NULL ORDER BY sort_index`,
    [scriptVersionId, sceneId]
  )
  return rows.map(rowToElement)
}

/** Line text by element id for notes on exports: 'ELENA: There is no cutaway.' for dialogue. */
export async function getScriptElementExcerpts(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id, element_type, character_name, text FROM ${ELEMENTS} WHERE id IN (${unique.map((_, i) => `$${i + 1}`).join(', ')})`,
    unique
  )
  return new Map(
    rows.map((r) => {
      const text = ((r.text as string | null) ?? '').replace(/\s+/g, ' ').trim()
      const who = r.element_type === 'dialogue' && r.character_name ? `${r.character_name as string}: ` : ''
      return [r.id as string, `${who}${text}`]
    })
  )
}

// ─── Read model ─────────────────────────────────────────────────────────────

export type LinedScene = {
  scriptVersionId: string
  elements: LiningElement[]
  tramlines: LiningTramline[]
}

/**
 * Everything needed to draw one scene's marked-up script: its elements (generated on first view) and every
 * live tramline that overlaps them, with slate label, shot type and printed takes. Null when the scene is
 * not in any imported script.
 */
export async function loadLinedScene(productionId: string, sceneId: string): Promise<LinedScene | null> {
  const scriptVersionId = await getScriptVersionIdForScene(productionId, sceneId)
  if (!scriptVersionId) return null
  await ensureScriptElements(scriptVersionId)
  const elements = await listScriptElementsForScene(scriptVersionId, sceneId)
  if (elements.length === 0) return { scriptVersionId, elements, tramlines: [] }

  const minSort = elements[0]!.sort_index
  const maxSort = elements[elements.length - 1]!.sort_index
  const db = await getDb()
  const tRows = await db.select<Record<string, unknown>[]>(
    `SELECT t.id, t.slate_id, t.camera, t.start_element_id, t.end_element_id, es.sort_index AS start_sort, ee.sort_index AS end_sort,
            s.slating_system, s.slate_prefix, s.slate_number, s.shot_type, s.shot_code, s.description,
            s.created_at AS slate_created_at, sc.scene_number
     FROM ${TRAMLINES} t
     INNER JOIN slates s ON s.id = t.slate_id AND s.deleted_at IS NULL
     INNER JOIN ${ELEMENTS} es ON es.id = t.start_element_id
     INNER JOIN ${ELEMENTS} ee ON ee.id = t.end_element_id
     LEFT JOIN scenes sc ON sc.id = s.scene_id
     WHERE t.script_version_id = $1 AND t.deleted_at IS NULL
       AND es.sort_index <= $3 AND ee.sort_index >= $2`,
    [scriptVersionId, minSort, maxSort]
  )
  if (tRows.length === 0) return { scriptVersionId, elements, tramlines: [] }

  const ids = tRows.map((r) => r.id as string)
  const slateIds = [...new Set(tRows.map((r) => r.slate_id as string))]
  const idPlaceholders = ids.map((_, i) => `$${i + 1}`).join(', ')
  const slatePlaceholders = slateIds.map((_, i) => `$${i + 1}`).join(', ')
  const [segRows, printRows] = await Promise.all([
    db.select<Record<string, unknown>[]>(
      `SELECT tramline_id, element_id, state FROM ${SEGMENTS} WHERE tramline_id IN (${idPlaceholders})`,
      ids
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT slate_id, take_number FROM takes WHERE slate_id IN (${slatePlaceholders}) AND status = 'print' AND deleted_at IS NULL`,
      slateIds
    ),
  ])

  const segmentsByTramline = new Map<string, Map<string, SegmentState>>()
  for (const r of segRows) {
    const tId = r.tramline_id as string
    const m = segmentsByTramline.get(tId) ?? new Map<string, SegmentState>()
    m.set(r.element_id as string, r.state as SegmentState)
    segmentsByTramline.set(tId, m)
  }
  const printsBySlate = new Map<string, number[]>()
  for (const r of printRows) {
    const list = printsBySlate.get(r.slate_id as string) ?? []
    list.push(coerceNumber(r.take_number, 0))
    printsBySlate.set(r.slate_id as string, list)
  }

  const tramlines: LiningTramline[] = tRows.map((r) => ({
    id: r.id as string,
    slateId: r.slate_id as string,
    slateLabel: slateDisplayLabel(
      {
        slating_system: ((r.slating_system as SlatingSystem | null) ?? 'uk'),
        slate_prefix: (r.slate_prefix as string | null) ?? '',
        slate_number: coerceNumber(r.slate_number, 0),
      },
      (r.scene_number as string | null) ?? null
    ),
    slateCreatedAt: r.slate_created_at as string,
    shotType: (r.shot_type as SlateShotType | null) ?? null,
    shotCode: (r.shot_code as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    camera: (r.camera as string | null) ?? '',
    printTakeNumbers: (printsBySlate.get(r.slate_id as string) ?? []).sort((a, b) => a - b),
    startElementId: r.start_element_id as string,
    endElementId: r.end_element_id as string,
    startSortIndex: coerceNumber(r.start_sort, 0),
    endSortIndex: coerceNumber(r.end_sort, 0),
    segments: segmentsByTramline.get(r.id as string) ?? new Map(),
  }))
  return { scriptVersionId, elements, tramlines }
}

// ─── Tramline writes ────────────────────────────────────────────────────────

async function getElementsByIds(ids: string[]): Promise<Map<string, { script_version_id: string; sort_index: number }>> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id, script_version_id, sort_index FROM ${ELEMENTS} WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(', ')}) AND deleted_at IS NULL`,
    ids
  )
  return new Map(rows.map((r) => [r.id as string, { script_version_id: r.script_version_id as string, sort_index: coerceNumber(r.sort_index, 0) }]))
}

async function getSlateProduction(slateId: string): Promise<string> {
  const db = await getDb()
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM slates WHERE id = $1 AND deleted_at IS NULL`,
    [slateId]
  )
  if (rows.length === 0) throw new Error('Slate not found')
  return rows[0]!.production_id
}

/** Validates a run and returns [start, end] ordered by script position. */
async function orderedRun(scriptVersionId: string, a: string, b: string): Promise<[string, string]> {
  const els = await getElementsByIds([...new Set([a, b])])
  const ea = els.get(a)
  const eb = els.get(b)
  if (!ea || !eb) throw new Error('Script line not found')
  if (ea.script_version_id !== scriptVersionId || eb.script_version_id !== scriptVersionId) {
    throw new Error('Both ends of a tramline must be in the same script version')
  }
  return ea.sort_index <= eb.sort_index ? [a, b] : [b, a]
}

export type CreateTramlineInput = {
  slateId: string
  scriptVersionId: string
  startElementId: string
  endElementId: string
  /** Camera letter for multi-camera setups; '' (default) for a single camera. */
  camera?: string
}

/** Draws a tramline for a slate over a run of script elements (either end may be given first). */
export async function createTramline(input: CreateTramlineInput): Promise<string> {
  const productionId = await getSlateProduction(input.slateId)
  await assertScriptSupervisorLocal(productionId)
  const db = await getDb()
  const v = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM script_versions WHERE id = $1 AND deleted_at IS NULL`,
    [input.scriptVersionId]
  )
  if (v.length === 0) throw new Error('Script version not found')
  if (v[0]!.production_id !== productionId) throw new Error('Script version belongs to a different production')
  const [start, end] = await orderedRun(input.scriptVersionId, input.startElementId, input.endElementId)
  const camera = (input.camera ?? '').trim().toUpperCase()

  const clash = await db.select<Array<{ id: string }>>(
    `SELECT id FROM ${TRAMLINES} WHERE slate_id = $1 AND script_version_id = $2 AND camera = $3 AND deleted_at IS NULL`,
    [input.slateId, input.scriptVersionId, camera]
  )
  if (clash.length > 0) {
    throw new Error(camera ? `This slate already has a tramline for camera ${camera}` : 'This slate already has a tramline')
  }

  const id = uuid()
  const ts = now()
  const row = {
    id, production_id: productionId, slate_id: input.slateId, script_version_id: input.scriptVersionId, camera,
    start_element_id: start, end_element_id: end,
  }
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `INSERT INTO ${TRAMLINES} (id, production_id, slate_id, script_version_id, camera, start_element_id, end_element_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      bindValues: [id, productionId, input.slateId, input.scriptVersionId, camera, start, end, ts, ts],
    },
    outboxStatementForRow({ entity: TRAMLINES, entityId: id, operation: 'create', payloadJson: JSON.stringify(row) }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    await executeBatch(conn, statements)
  })
  return id
}

async function getTramline(id: string): Promise<{ production_id: string; script_version_id: string } | null> {
  const db = await getDb()
  const rows = await db.select<Array<{ production_id: string; script_version_id: string }>>(
    `SELECT production_id, script_version_id FROM ${TRAMLINES} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows[0] ?? null
}

/** Moves a tramline's ends (extend or shorten). Segment overrides outside the new run are dropped. */
export async function updateTramlineRange(id: string, startElementId: string, endElementId: string): Promise<void> {
  const t = await getTramline(id)
  if (!t) throw new Error('Tramline not found')
  await assertScriptSupervisorLocal(t.production_id)
  const [start, end] = await orderedRun(t.script_version_id, startElementId, endElementId)
  const els = await getElementsByIds([start, end])
  const ts = now()
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `UPDATE ${TRAMLINES} SET start_element_id = $1, end_element_id = $2, updated_at = $3 WHERE id = $4 AND deleted_at IS NULL`,
      bindValues: [start, end, ts, id],
    },
    {
      sql: `DELETE FROM ${SEGMENTS} WHERE tramline_id = $1 AND element_id IN (
              SELECT id FROM ${ELEMENTS} WHERE script_version_id = $2 AND (sort_index < $3 OR sort_index > $4))`,
      bindValues: [id, t.script_version_id, els.get(start)!.sort_index, els.get(end)!.sort_index],
    },
    outboxStatementForRow({
      entity: TRAMLINES, entityId: id, operation: 'update',
      payloadJson: JSON.stringify({ start_element_id: start, end_element_id: end }),
    }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}

/** Sets one element's state on a tramline: on camera (the default), off camera, or not covered. */
export async function setTramlineSegment(tramlineId: string, elementId: string, state: 'on' | SegmentState): Promise<void> {
  if (!['on', 'off', 'not_covered'].includes(state)) throw new Error('Segment must be on, off or not covered')
  const t = await getTramline(tramlineId)
  if (!t) throw new Error('Tramline not found')
  await assertScriptSupervisorLocal(t.production_id)
  const el = (await getElementsByIds([elementId])).get(elementId)
  if (!el || el.script_version_id !== t.script_version_id) throw new Error('Script line not found')

  const ts = now()
  const statements: Stmt[] = [{ sql: 'BEGIN', bindValues: [] }]
  if (state === 'on') {
    statements.push({ sql: `DELETE FROM ${SEGMENTS} WHERE tramline_id = $1 AND element_id = $2`, bindValues: [tramlineId, elementId] })
  } else {
    statements.push({
      sql: `INSERT INTO ${SEGMENTS} (id, tramline_id, element_id, state, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (tramline_id, element_id) DO UPDATE SET state = $4, updated_at = $6`,
      bindValues: [uuid(), tramlineId, elementId, state, ts, ts],
    })
  }
  statements.push(
    outboxStatementForRow({
      entity: SEGMENTS, entityId: `${tramlineId}:${elementId}`, operation: 'update',
      payloadJson: JSON.stringify({ tramline_id: tramlineId, element_id: elementId, state }),
    }),
    { sql: 'COMMIT', bindValues: [] }
  )
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}

export async function softDeleteTramline(id: string): Promise<void> {
  const t = await getTramline(id)
  if (!t) return
  await assertScriptSupervisorLocal(t.production_id)
  const ts = now()
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      { sql: `UPDATE ${TRAMLINES} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`, bindValues: [ts, ts, id] },
      outboxStatementForRow({ entity: TRAMLINES, entityId: id, operation: 'delete', payloadJson: null }),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}

/**
 * Sets several elements' states on one tramline in a single transaction (used by "off camera for this
 * character to the end of the line" and by undo).
 */
export async function setTramlineSegments(
  tramlineId: string,
  changes: ReadonlyArray<{ elementId: string; state: 'on' | SegmentState }>
): Promise<void> {
  if (changes.length === 0) return
  const t = await getTramline(tramlineId)
  if (!t) throw new Error('Tramline not found')
  await assertScriptSupervisorLocal(t.production_id)
  const els = await getElementsByIds([...new Set(changes.map((c) => c.elementId))])
  for (const c of changes) {
    if (!['on', 'off', 'not_covered'].includes(c.state)) throw new Error('Segment must be on, off or not covered')
    const el = els.get(c.elementId)
    if (!el || el.script_version_id !== t.script_version_id) throw new Error('Script line not found')
  }
  const ts = now()
  const statements: Stmt[] = [{ sql: 'BEGIN', bindValues: [] }]
  for (const c of changes) {
    statements.push(
      c.state === 'on'
        ? { sql: `DELETE FROM ${SEGMENTS} WHERE tramline_id = $1 AND element_id = $2`, bindValues: [tramlineId, c.elementId] }
        : {
            sql: `INSERT INTO ${SEGMENTS} (id, tramline_id, element_id, state, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)
                  ON CONFLICT (tramline_id, element_id) DO UPDATE SET state = $4, updated_at = $6`,
            bindValues: [uuid(), tramlineId, c.elementId, c.state, ts, ts],
          }
    )
  }
  statements.push(
    outboxStatementForRow({
      entity: SEGMENTS, entityId: tramlineId, operation: 'update',
      payloadJson: JSON.stringify({ tramline_id: tramlineId, changes }),
    }),
    { sql: 'COMMIT', bindValues: [] }
  )
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}

/** Brings back a soft-deleted tramline (undo of delete), unless the slate has been lined again since. */
export async function restoreTramline(id: string): Promise<void> {
  const db = await getDb()
  const rows = await db.select<Array<{ production_id: string; slate_id: string; script_version_id: string; camera: string }>>(
    `SELECT t.production_id, t.slate_id, t.script_version_id, t.camera FROM ${TRAMLINES} t
     INNER JOIN slates s ON s.id = t.slate_id AND s.deleted_at IS NULL
     WHERE t.id = $1 AND t.deleted_at IS NOT NULL`,
    [id]
  )
  const t = rows[0]
  if (!t) throw new Error('Nothing to restore')
  await assertScriptSupervisorLocal(t.production_id)
  const clash = await db.select<Array<{ id: string }>>(
    `SELECT id FROM ${TRAMLINES} WHERE slate_id = $1 AND script_version_id = $2 AND camera = $3 AND deleted_at IS NULL`,
    [t.slate_id, t.script_version_id, t.camera]
  )
  if (clash.length > 0) throw new Error('This slate has been lined again since, so the old tramline can’t come back')
  const ts = now()
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    await executeBatch(conn, [
      { sql: 'BEGIN', bindValues: [] },
      { sql: `UPDATE ${TRAMLINES} SET deleted_at = NULL, updated_at = $1 WHERE id = $2`, bindValues: [ts, id] },
      outboxStatementForRow({ entity: TRAMLINES, entityId: id, operation: 'update', payloadJson: JSON.stringify({ deleted_at: null }) }),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}
