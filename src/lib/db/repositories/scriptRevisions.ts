/**
 * Script Supervisor revision handling (SS10). Local SQLite only.
 *
 * When a scene is in a newer script version than its tramlines and notes, `carryForwardScene` re-creates them on
 * the new version's elements (matched by line text, see revisionRemap.ts) and records one `script_revision_items`
 * row per earlier tramline or note. Moved and unmatched items form the review list; nothing is dropped without a
 * record. Earlier rows stay on their version untouched.
 *
 * The carry runs inside one serialized transaction per scene and is idempotent: an item already carried (it has
 * a child row) or already recorded for the target version is skipped. It is triggered lazily by
 * `loadLinedSceneWithRevisions`, so it covers drafts imported before SS10 too.
 */
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import { coerceNumber } from '../sqlValueCoercion'
import type { SlatingSystem } from '../types'
import { assertScriptSupervisorLocal } from './scriptSupervisor'
import {
  ensureScriptElements,
  getScriptVersionIdForScene,
  listScriptElementsForScene,
  loadLinedScene,
  type LinedScene,
} from './scriptLining'
import { ANNOTATION_KIND_LABEL, type AnnotationKind } from '@/lib/script-supervisor/annotations'
import type { LiningElement, SegmentState } from '@/lib/script-supervisor/lining'
import { matchElements, remapAnnotation, remapTramline, type ElementMatch } from '@/lib/script-supervisor/revisionRemap'
import { formatTramlineLabel, slateDisplayLabel } from '@/lib/script-supervisor/slateNumbering'

type Stmt = { sql: string; bindValues: unknown[] }

const ITEMS = 'script_revision_items'

export type RevisionOutcome = 'carried' | 'moved' | 'unmatched' | 'already_lined'

export type CarrySummary = {
  toVersionId: string
  tramlines: Record<RevisionOutcome, number>
  annotations: Record<RevisionOutcome, number>
}

function emptyCounts(): Record<RevisionOutcome, number> {
  return { carried: 0, moved: 0, unmatched: 0, already_lined: 0 }
}

type SourceTramline = {
  id: string
  slate_id: string
  camera: string
  script_version_id: string
  version_created_at: string
  start_sort: number
  end_sort: number
}

type SourceAnnotation = {
  id: string
  element_id: string
  slate_id: string | null
  kind: AnnotationKind
  text: string
  script_version_id: string
  version_created_at: string
}

/** Live earlier-version items for the scene that have not been carried or recorded for `toVersionId`. */
const PENDING_FILTER = (alias: string, itemType: 'tramline' | 'annotation', table: string) => `
  AND NOT EXISTS (SELECT 1 FROM ${table} c WHERE c.carried_from_id = ${alias}.id)
  AND NOT EXISTS (SELECT 1 FROM ${ITEMS} r WHERE r.item_type = '${itemType}' AND r.item_id = ${alias}.id
                  AND r.deleted_at IS NULL
                  AND (r.to_script_version_id = $2 OR (r.outcome = 'unmatched' AND r.reviewed_at IS NOT NULL)))`

async function pendingSources(productionId: string, toVersionId: string, sceneId: string) {
  const db = await getDb()
  const [tRows, aRows] = await Promise.all([
    db.select<Record<string, unknown>[]>(
      `SELECT t.id, t.slate_id, t.camera, t.script_version_id, v.created_at AS version_created_at,
              es.sort_index AS start_sort, ee.sort_index AS end_sort
       FROM tramlines t
       INNER JOIN script_versions v ON v.id = t.script_version_id AND v.deleted_at IS NULL
       INNER JOIN slates s ON s.id = t.slate_id AND s.deleted_at IS NULL
       INNER JOIN script_elements es ON es.id = t.start_element_id
       INNER JOIN script_elements ee ON ee.id = t.end_element_id
       WHERE t.production_id = $1 AND t.script_version_id <> $2 AND es.scene_id = $3 AND t.deleted_at IS NULL
       ${PENDING_FILTER('t', 'tramline', 'tramlines')}
       ORDER BY v.created_at DESC, t.created_at`,
      [productionId, toVersionId, sceneId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT a.id, a.element_id, a.slate_id, a.kind, a.text, a.script_version_id, v.created_at AS version_created_at
       FROM script_annotations a
       INNER JOIN script_versions v ON v.id = a.script_version_id AND v.deleted_at IS NULL
       INNER JOIN script_elements e ON e.id = a.element_id
       LEFT JOIN slates s ON s.id = a.slate_id
       WHERE a.production_id = $1 AND a.script_version_id <> $2 AND e.scene_id = $3 AND a.deleted_at IS NULL
         AND (a.slate_id IS NULL OR s.deleted_at IS NULL)
       ${PENDING_FILTER('a', 'annotation', 'script_annotations')}
       ORDER BY v.created_at DESC, a.created_at`,
      [productionId, toVersionId, sceneId]
    ),
  ])
  const tramlines: SourceTramline[] = tRows.map((r) => ({
    id: r.id as string,
    slate_id: r.slate_id as string,
    camera: (r.camera as string | null) ?? '',
    script_version_id: r.script_version_id as string,
    version_created_at: r.version_created_at as string,
    start_sort: coerceNumber(r.start_sort, 0),
    end_sort: coerceNumber(r.end_sort, 0),
  }))
  const annotations: SourceAnnotation[] = aRows.map((r) => ({
    id: r.id as string,
    element_id: r.element_id as string,
    slate_id: (r.slate_id as string | null) ?? null,
    kind: r.kind as AnnotationKind,
    text: r.text as string,
    script_version_id: r.script_version_id as string,
    version_created_at: r.version_created_at as string,
  }))
  return { tramlines, annotations }
}

function itemStatement(args: {
  productionId: string
  sceneId: string
  fromVersionId: string
  toVersionId: string
  itemType: 'tramline' | 'annotation'
  itemId: string
  outcome: RevisionOutcome
  newItemId: string | null
  notes: string[]
  ts: string
}): Stmt[] {
  const id = uuid()
  return [
    {
      sql: `INSERT INTO ${ITEMS} (id, production_id, scene_id, from_script_version_id, to_script_version_id, item_type, item_id, outcome, new_item_id, detail, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
      bindValues: [
        id, args.productionId, args.sceneId, args.fromVersionId, args.toVersionId, args.itemType, args.itemId, args.outcome,
        args.newItemId, args.notes.length > 0 ? args.notes.join('\n') : null, args.ts,
      ],
    },
    outboxStatementForRow({
      entity: ITEMS, entityId: id, operation: 'create',
      payloadJson: JSON.stringify({ item_type: args.itemType, item_id: args.itemId, outcome: args.outcome, new_item_id: args.newItemId }),
    }),
  ]
}

/**
 * Carries the scene's earlier tramlines and notes onto its latest script version. Returns what this call did
 * (all zeros when there was nothing to carry), or null when the scene is in no script.
 */
export async function carryForwardScene(productionId: string, sceneId: string): Promise<CarrySummary | null> {
  await assertScriptSupervisorLocal(productionId)
  const toVersionId = await getScriptVersionIdForScene(productionId, sceneId)
  if (!toVersionId) return null
  await ensureScriptElements(toVersionId)

  return runInSerializedTransaction(async () => {
    const summary: CarrySummary = { toVersionId, tramlines: emptyCounts(), annotations: emptyCounts() }
    const { tramlines, annotations } = await pendingSources(productionId, toVersionId, sceneId)
    if (tramlines.length === 0 && annotations.length === 0) return summary

    const db = await getDb()
    const newElements = await listScriptElementsForScene(toVersionId, sceneId)
    const elementCache = new Map<string, { elements: LiningElement[]; matches: Map<string, ElementMatch> }>()
    const forVersion = async (versionId: string) => {
      let hit = elementCache.get(versionId)
      if (!hit) {
        const elements = await listScriptElementsForScene(versionId, sceneId)
        hit = { elements, matches: matchElements(elements, newElements) }
        elementCache.set(versionId, hit)
      }
      return hit
    }

    // Slates (per camera) already lined on the new version, including lines carried in this call.
    const lined = new Set(
      (
        await db.select<Array<{ slate_id: string; camera: string }>>(
          `SELECT slate_id, camera FROM tramlines WHERE script_version_id = $1 AND deleted_at IS NULL`,
          [toVersionId]
        )
      ).map((r) => `${r.slate_id}|${r.camera ?? ''}`)
    )
    const segRows = tramlines.length
      ? await db.select<Array<{ tramline_id: string; element_id: string; state: SegmentState }>>(
          `SELECT tramline_id, element_id, state FROM tramline_segments WHERE tramline_id IN (${tramlines.map((_, i) => `$${i + 1}`).join(', ')})`,
          tramlines.map((t) => t.id)
        )
      : []
    const takeRows = annotations.length
      ? await db.select<Array<{ annotation_id: string; take_id: string }>>(
          `SELECT annotation_id, take_id FROM script_annotation_takes WHERE annotation_id IN (${annotations.map((_, i) => `$${i + 1}`).join(', ')})`,
          annotations.map((a) => a.id)
        )
      : []

    const ts = now()
    const statements: Stmt[] = [{ sql: 'BEGIN', bindValues: [] }]
    const base = { productionId, sceneId, toVersionId, ts }

    for (const t of tramlines) {
      const key = `${t.slate_id}|${t.camera}`
      const record = (outcome: RevisionOutcome, newItemId: string | null, notes: string[]) => {
        summary.tramlines[outcome] += 1
        statements.push(...itemStatement({ ...base, fromVersionId: t.script_version_id, itemType: 'tramline', itemId: t.id, outcome, newItemId, notes }))
      }
      if (lined.has(key)) {
        record('already_lined', null, ['The slate was already lined on the new draft'])
        continue
      }
      const { elements, matches } = await forVersion(t.script_version_id)
      const segments = new Map(segRows.filter((s) => s.tramline_id === t.id).map((s) => [s.element_id, s.state]))
      const remap = remapTramline({ startSortIndex: t.start_sort, endSortIndex: t.end_sort, segments }, elements, newElements, matches)
      if (remap.outcome === 'unmatched') {
        record('unmatched', null, remap.notes)
        continue
      }
      const id = uuid()
      lined.add(key)
      statements.push(
        {
          sql: `INSERT INTO tramlines (id, production_id, slate_id, script_version_id, camera, start_element_id, end_element_id, carried_from_id, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
          bindValues: [id, productionId, t.slate_id, toVersionId, t.camera, remap.startElementId, remap.endElementId, t.id, ts],
        },
        ...remap.segments.map((s) => ({
          sql: `INSERT INTO tramline_segments (id, tramline_id, element_id, state, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)`,
          bindValues: [uuid(), id, s.elementId, s.state, ts],
        })),
        outboxStatementForRow({
          entity: 'tramlines', entityId: id, operation: 'create',
          payloadJson: JSON.stringify({ slate_id: t.slate_id, script_version_id: toVersionId, camera: t.camera, start_element_id: remap.startElementId, end_element_id: remap.endElementId, carried_from_id: t.id }),
        })
      )
      record(remap.outcome, id, remap.notes)
    }

    for (const a of annotations) {
      const { matches } = await forVersion(a.script_version_id)
      const remap = remapAnnotation(a.element_id, matches)
      let newId: string | null = null
      if (remap.outcome !== 'unmatched') {
        newId = uuid()
        const takeIds = takeRows.filter((r) => r.annotation_id === a.id).map((r) => r.take_id)
        statements.push(
          {
            sql: `INSERT INTO script_annotations (id, production_id, script_version_id, element_id, slate_id, kind, text, carried_from_id, created_at, updated_at)
                  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
            bindValues: [newId, productionId, toVersionId, remap.elementId, a.slate_id, a.kind, a.text, a.id, ts],
          },
          ...takeIds.map((takeId) => ({
            sql: `INSERT INTO script_annotation_takes (annotation_id, take_id) VALUES ($1, $2)`,
            bindValues: [newId, takeId],
          })),
          outboxStatementForRow({
            entity: 'script_annotations', entityId: newId, operation: 'create',
            payloadJson: JSON.stringify({ element_id: remap.elementId, slate_id: a.slate_id, kind: a.kind, text: a.text, take_ids: takeIds, carried_from_id: a.id }),
          })
        )
      }
      summary.annotations[remap.outcome] += 1
      statements.push(...itemStatement({ ...base, fromVersionId: a.script_version_id, itemType: 'annotation', itemId: a.id, outcome: remap.outcome, newItemId: newId, notes: remap.notes }))
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
    return summary
  })
}

/** Carries any earlier tramlines and notes forward, then loads the scene for the Script view and exports. */
export async function loadLinedSceneWithRevisions(productionId: string, sceneId: string): Promise<LinedScene | null> {
  await carryForwardScene(productionId, sceneId)
  return loadLinedScene(productionId, sceneId)
}

// ─── Review list ────────────────────────────────────────────────────────────

export type RevisionReviewItem = {
  id: string
  itemType: 'tramline' | 'annotation'
  outcome: 'moved' | 'unmatched'
  /** '212/3 WS' for a tramline; the note chip text for a note. */
  label: string
  slateId: string | null
  shootDayId: string | null
  /** First line the item covered (tramline) or sat on (note) in the earlier draft. */
  wasOn: string | null
  notes: string[]
}

export type RevisionReview = {
  toVersionId: string
  fromLabel: string | null
  toLabel: string | null
  /** Every item recorded for this scene and version, reviewed or not. */
  totals: { tramlines: Record<RevisionOutcome, number>; annotations: Record<RevisionOutcome, number> }
  /** Unmatched tramlines whose slate has since been lined on the new draft. */
  relined: number
  items: RevisionReviewItem[]
}

function versionLabel(r: Record<string, unknown>, prefix: string): string | null {
  const parts = [r[`${prefix}_label`], r[`${prefix}_colour`]].map((x) => ((x as string | null) ?? '').trim()).filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

function excerpt(r: Record<string, unknown>): string | null {
  const text = ((r.el_text as string | null) ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const who = r.el_type === 'dialogue' && r.el_character ? `${r.el_character as string}: ` : ''
  const full = `${who}${text}`
  return full.length > 80 ? `${full.slice(0, 79)}…` : full
}

/** The scene's review list for its latest script version: moved and unmatched items not yet reviewed. */
export async function loadRevisionReview(productionId: string, sceneId: string): Promise<RevisionReview | null> {
  const toVersionId = await getScriptVersionIdForScene(productionId, sceneId)
  if (!toVersionId) return null
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT r.*, fv.version_label AS from_label, fv.revision_colour AS from_colour,
            tv.version_label AS to_label, tv.revision_colour AS to_colour,
            COALESCE(t.slate_id, a.slate_id) AS item_slate_id, t.camera AS t_camera,
            a.kind AS a_kind, a.text AS a_text,
            e.element_type AS el_type, e.character_name AS el_character, e.text AS el_text,
            s.slating_system, s.slate_prefix, s.slate_number, s.shot_code, s.description, s.shoot_day_id, s.deleted_at AS slate_deleted_at,
            sc.scene_number,
            (SELECT COUNT(*) FROM tramlines nt WHERE r.item_type = 'tramline' AND nt.slate_id = t.slate_id AND nt.camera = t.camera
               AND nt.script_version_id = r.to_script_version_id AND nt.deleted_at IS NULL) AS relined
     FROM ${ITEMS} r
     INNER JOIN script_versions fv ON fv.id = r.from_script_version_id
     INNER JOIN script_versions tv ON tv.id = r.to_script_version_id
     LEFT JOIN tramlines t ON r.item_type = 'tramline' AND t.id = r.item_id
     LEFT JOIN script_annotations a ON r.item_type = 'annotation' AND a.id = r.item_id
     LEFT JOIN script_elements e ON e.id = COALESCE(t.start_element_id, a.element_id)
     LEFT JOIN slates s ON s.id = COALESCE(t.slate_id, a.slate_id)
     LEFT JOIN scenes sc ON sc.id = s.scene_id
     WHERE r.production_id = $1 AND r.scene_id = $2 AND r.to_script_version_id = $3 AND r.deleted_at IS NULL
     ORDER BY r.created_at, r.item_type DESC, e.sort_index`,
    [productionId, sceneId, toVersionId]
  )
  const totals = { tramlines: emptyCounts(), annotations: emptyCounts() }
  let relined = 0
  let fromLabel: string | null = null
  let toLabel: string | null = null
  const items: RevisionReviewItem[] = []
  for (const r of rows) {
    const outcome = r.outcome as RevisionOutcome
    const itemType = r.item_type as 'tramline' | 'annotation'
    totals[itemType === 'tramline' ? 'tramlines' : 'annotations'][outcome] += 1
    fromLabel ??= versionLabel(r, 'from')
    toLabel ??= versionLabel(r, 'to')
    if (outcome !== 'moved' && outcome !== 'unmatched') continue
    if (r.reviewed_at) continue
    if (itemType === 'tramline' && outcome === 'unmatched' && coerceNumber(r.relined, 0) > 0) {
      relined += 1
      continue
    }
    const slateLive = r.item_slate_id != null && r.slate_deleted_at == null && r.slate_number != null
    const slateLabel = slateLive
      ? slateDisplayLabel(
          {
            slating_system: ((r.slating_system as SlatingSystem | null) ?? 'uk'),
            slate_prefix: (r.slate_prefix as string | null) ?? '',
            slate_number: coerceNumber(r.slate_number, 0),
          },
          (r.scene_number as string | null) ?? null
        )
      : null
    const label =
      itemType === 'tramline'
        ? `${formatTramlineLabel({ slateLabel: slateLabel ?? '?', printTakeNumbers: [], shotCode: r.shot_code as string | null, description: r.description as string | null })}${r.t_camera ? ` (${r.t_camera as string})` : ''}`
        : `${slateLabel ? `${slateLabel} · ` : ''}${ANNOTATION_KIND_LABEL[r.a_kind as AnnotationKind] ?? 'Note'}: ${(r.a_text as string | null) ?? ''}`
    items.push({
      id: r.id as string,
      itemType,
      outcome,
      label,
      slateId: slateLive ? (r.item_slate_id as string) : null,
      shootDayId: slateLive ? ((r.shoot_day_id as string | null) ?? null) : null,
      wasOn: excerpt(r),
      notes: ((r.detail as string | null) ?? '').split('\n').filter(Boolean),
    })
  }
  if (rows.length === 0) return { toVersionId, fromLabel: null, toLabel: null, totals, relined: 0, items: [] }
  return { toVersionId, fromLabel, toLabel, totals, relined, items }
}

/** Marks a moved or unmatched item as looked at, removing it from the review list. */
export async function markRevisionItemReviewed(id: string): Promise<void> {
  const db = await getDb()
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM ${ITEMS} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  if (rows.length === 0) throw new Error('Review item not found')
  await assertScriptSupervisorLocal(rows[0]!.production_id)
  const ts = now()
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    await executeBatch(conn, [
      { sql: 'BEGIN', bindValues: [] },
      { sql: `UPDATE ${ITEMS} SET reviewed_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`, bindValues: [ts, id] },
      outboxStatementForRow({ entity: ITEMS, entityId: id, operation: 'update', payloadJson: JSON.stringify({ reviewed_at: ts }) }),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}
