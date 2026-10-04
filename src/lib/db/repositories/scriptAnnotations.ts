/**
 * Script Supervisor annotations and continuity photos (SS8). Local SQLite only.
 *
 * Annotations hang off script elements (a line change on a speech, an editor's note on an action line) and
 * optionally a slate and some of its takes. Continuity photos are stored as documents
 * (entity_type 'continuity_photo') with a continuity_media row written in the same transaction
 * (see `buildContinuityMediaInsert`, used through persistProductionDocument's extraStatements).
 */
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import { coerceNumber } from '../sqlValueCoercion'
import type { SlatingSystem } from '../types'
import { assertScriptSupervisorLocal } from './scriptSupervisor'
import {
  ANNOTATION_KINDS,
  formatContinuityTags,
  type AnnotationKind,
  type AnnotationView,
} from '@/lib/script-supervisor/annotations'
import { slateDisplayLabel } from '@/lib/script-supervisor/slateNumbering'

type Stmt = { sql: string; bindValues: unknown[] }

const ANNOTATIONS = 'script_annotations'
const ANNOTATION_TAKES = 'script_annotation_takes'
const MEDIA = 'continuity_media'

// ─── Annotations ────────────────────────────────────────────────────────────

async function getElement(elementId: string): Promise<{ production_id: string; script_version_id: string } | null> {
  const db = await getDb()
  const rows = await db.select<Array<{ production_id: string; script_version_id: string }>>(
    `SELECT production_id, script_version_id FROM script_elements WHERE id = $1 AND deleted_at IS NULL`,
    [elementId]
  )
  return rows[0] ?? null
}

async function assertTakesOnSlate(slateId: string | null, takeIds: readonly string[]): Promise<void> {
  if (takeIds.length === 0) return
  if (!slateId) throw new Error('Choose the slate these takes belong to')
  const db = await getDb()
  const rows = await db.select<Array<{ id: string }>>(
    `SELECT id FROM takes WHERE slate_id = $1 AND deleted_at IS NULL AND id IN (${takeIds.map((_, i) => `$${i + 2}`).join(', ')})`,
    [slateId, ...takeIds]
  )
  if (rows.length !== new Set(takeIds).size) throw new Error('A chosen take is not on this slate')
}

async function assertSlateInProduction(slateId: string, productionId: string): Promise<void> {
  const db = await getDb()
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM slates WHERE id = $1 AND deleted_at IS NULL`,
    [slateId]
  )
  if (rows.length === 0) throw new Error('Slate not found')
  if (rows[0]!.production_id !== productionId) throw new Error('Slate belongs to a different production')
}

function cleanText(text: string): string {
  const t = text.trim()
  if (!t) throw new Error('Write what changed or what the note says')
  return t
}

function assertKind(kind: AnnotationKind): void {
  if (!ANNOTATION_KINDS.includes(kind)) throw new Error(`Note type must be one of: ${ANNOTATION_KINDS.join(', ')}`)
}

export type CreateAnnotationInput = {
  elementId: string
  kind: AnnotationKind
  text: string
  slateId?: string | null
  takeIds?: string[]
}

export async function createAnnotation(input: CreateAnnotationInput): Promise<string> {
  const el = await getElement(input.elementId)
  if (!el) throw new Error('Script line not found')
  await assertScriptSupervisorLocal(el.production_id)
  assertKind(input.kind)
  const text = cleanText(input.text)
  const slateId = input.slateId ?? null
  const takeIds = [...new Set(input.takeIds ?? [])]
  if (slateId) await assertSlateInProduction(slateId, el.production_id)
  await assertTakesOnSlate(slateId, takeIds)

  const id = uuid()
  const ts = now()
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    {
      sql: `INSERT INTO ${ANNOTATIONS} (id, production_id, script_version_id, element_id, slate_id, kind, text, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      bindValues: [id, el.production_id, el.script_version_id, input.elementId, slateId, input.kind, text, ts, ts],
    },
    ...takeIds.map((takeId) => ({
      sql: `INSERT INTO ${ANNOTATION_TAKES} (annotation_id, take_id) VALUES ($1, $2)`,
      bindValues: [id, takeId],
    })),
    outboxStatementForRow({
      entity: ANNOTATIONS, entityId: id, operation: 'create',
      payloadJson: JSON.stringify({ element_id: input.elementId, slate_id: slateId, kind: input.kind, text, take_ids: takeIds }),
    }),
    { sql: 'COMMIT', bindValues: [] },
  ]
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
  return id
}

async function getAnnotation(id: string): Promise<{ production_id: string; slate_id: string | null } | null> {
  const db = await getDb()
  const rows = await db.select<Array<{ production_id: string; slate_id: string | null }>>(
    `SELECT production_id, slate_id FROM ${ANNOTATIONS} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows[0] ?? null
}

export type UpdateAnnotationInput = { kind?: AnnotationKind; text?: string; takeIds?: string[] }

/** Edits a note; `takeIds`, when given, replaces the takes it applies to. */
export async function updateAnnotation(id: string, patch: UpdateAnnotationInput): Promise<void> {
  const a = await getAnnotation(id)
  if (!a) throw new Error('Note not found')
  await assertScriptSupervisorLocal(a.production_id)
  if (patch.kind) assertKind(patch.kind)
  const text = patch.text !== undefined ? cleanText(patch.text) : undefined
  const takeIds = patch.takeIds ? [...new Set(patch.takeIds)] : undefined
  if (takeIds) await assertTakesOnSlate(a.slate_id, takeIds)

  const ts = now()
  const sets: string[] = []
  const values: unknown[] = []
  if (patch.kind) {
    values.push(patch.kind)
    sets.push(`kind = $${values.length}`)
  }
  if (text !== undefined) {
    values.push(text)
    sets.push(`text = $${values.length}`)
  }
  values.push(ts)
  sets.push(`updated_at = $${values.length}`)
  values.push(id)
  const statements: Stmt[] = [
    { sql: 'BEGIN', bindValues: [] },
    { sql: `UPDATE ${ANNOTATIONS} SET ${sets.join(', ')} WHERE id = $${values.length}`, bindValues: values },
  ]
  if (takeIds) {
    statements.push({ sql: `DELETE FROM ${ANNOTATION_TAKES} WHERE annotation_id = $1`, bindValues: [id] })
    for (const takeId of takeIds) {
      statements.push({ sql: `INSERT INTO ${ANNOTATION_TAKES} (annotation_id, take_id) VALUES ($1, $2)`, bindValues: [id, takeId] })
    }
  }
  statements.push(
    outboxStatementForRow({ entity: ANNOTATIONS, entityId: id, operation: 'update', payloadJson: JSON.stringify({ ...patch, text }) }),
    { sql: 'COMMIT', bindValues: [] }
  )
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, statements)
  })
}

export async function softDeleteAnnotation(id: string): Promise<void> {
  const a = await getAnnotation(id)
  if (!a) return
  await assertScriptSupervisorLocal(a.production_id)
  const ts = now()
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      { sql: `UPDATE ${ANNOTATIONS} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`, bindValues: [ts, ts, id] },
      outboxStatementForRow({ entity: ANNOTATIONS, entityId: id, operation: 'delete', payloadJson: null }),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}

async function toViews(rows: Record<string, unknown>[]): Promise<AnnotationView[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id as string)
  const db = await getDb()
  const takeRows = await db.select<Record<string, unknown>[]>(
    `SELECT at.annotation_id, t.id AS take_id, t.take_number FROM ${ANNOTATION_TAKES} at
     INNER JOIN takes t ON t.id = at.take_id AND t.deleted_at IS NULL
     WHERE at.annotation_id IN (${ids.map((_, i) => `$${i + 1}`).join(', ')})`,
    ids
  )
  const takesBy = new Map<string, Array<{ id: string; n: number }>>()
  for (const r of takeRows) {
    const list = takesBy.get(r.annotation_id as string) ?? []
    list.push({ id: r.take_id as string, n: coerceNumber(r.take_number, 0) })
    takesBy.set(r.annotation_id as string, list)
  }
  return rows.map((r) => {
    const takes = (takesBy.get(r.id as string) ?? []).sort((a, b) => a.n - b.n)
    const hasSlate = r.slate_id != null && r.slate_live != null
    return {
      id: r.id as string,
      elementId: r.element_id as string,
      kind: r.kind as AnnotationKind,
      text: r.text as string,
      slateId: hasSlate ? (r.slate_id as string) : null,
      slateLabel: hasSlate
        ? slateDisplayLabel(
            {
              slating_system: ((r.slating_system as SlatingSystem | null) ?? 'uk'),
              slate_prefix: (r.slate_prefix as string | null) ?? '',
              slate_number: coerceNumber(r.slate_number, 0),
            },
            (r.slate_scene_number as string | null) ?? null
          )
        : null,
      takeIds: takes.map((t) => t.id),
      takeNumbers: takes.map((t) => t.n),
      createdAt: r.created_at as string,
    }
  })
}

const VIEW_SELECT = `SELECT a.*, s.id AS slate_live, s.slating_system, s.slate_prefix, s.slate_number, sc.scene_number AS slate_scene_number
  FROM ${ANNOTATIONS} a
  LEFT JOIN slates s ON s.id = a.slate_id AND s.deleted_at IS NULL
  LEFT JOIN scenes sc ON sc.id = s.scene_id`

/** Live notes on a scene's lines in one script version, oldest first. */
export async function listAnnotationsForScene(scriptVersionId: string, sceneId: string): Promise<AnnotationView[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `${VIEW_SELECT}
     INNER JOIN script_elements e ON e.id = a.element_id
     WHERE a.script_version_id = $1 AND e.scene_id = $2 AND a.deleted_at IS NULL
     ORDER BY a.created_at`,
    [scriptVersionId, sceneId]
  )
  return toViews(rows)
}

/** Live notes tied to a slate, oldest first (for the slate panel and continuity sheets). */
export async function listAnnotationsForSlate(slateId: string): Promise<AnnotationView[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `${VIEW_SELECT} WHERE a.slate_id = $1 AND a.deleted_at IS NULL ORDER BY a.created_at`,
    [slateId]
  )
  return toViews(rows)
}

// ─── Continuity photos ──────────────────────────────────────────────────────

export type ContinuityMediaInput = {
  id?: string
  productionId: string
  documentId: string
  slateId?: string | null
  takeId?: string | null
  sceneId?: string | null
  tags?: string[]
  caption?: string | null
}

/**
 * The INSERT for a continuity_media row, for use as persistProductionDocument extraStatements so the stored
 * file, its document row and this row are written in one transaction.
 */
export function buildContinuityMediaInsert(input: ContinuityMediaInput): Stmt[] {
  const id = input.id ?? uuid()
  const ts = now()
  const tags = formatContinuityTags(input.tags ?? [])
  const caption = input.caption?.trim() || null
  return [
    {
      sql: `INSERT INTO ${MEDIA} (id, production_id, document_id, slate_id, take_id, scene_id, tags, caption, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      bindValues: [id, input.productionId, input.documentId, input.slateId ?? null, input.takeId ?? null, input.sceneId ?? null, tags, caption, ts, ts],
    },
    outboxStatementForRow({
      entity: MEDIA, entityId: id, operation: 'create',
      payloadJson: JSON.stringify({ document_id: input.documentId, slate_id: input.slateId ?? null, take_id: input.takeId ?? null, tags }),
    }),
  ]
}

export type ContinuityMediaView = {
  id: string
  documentId: string
  filePath: string
  fileName: string
  mimeType: string | null
  slateId: string | null
  takeId: string | null
  takeNumber: number | null
  sceneId: string | null
  tags: string | null
  caption: string | null
  createdAt: string
}

const MEDIA_SELECT = `SELECT m.*, d.file_path, d.file_name, d.mime_type, t.take_number
  FROM ${MEDIA} m
  INNER JOIN documents d ON d.id = m.document_id AND d.deleted_at IS NULL
  LEFT JOIN takes t ON t.id = m.take_id AND t.deleted_at IS NULL`

function rowToMedia(r: Record<string, unknown>): ContinuityMediaView {
  return {
    id: r.id as string,
    documentId: r.document_id as string,
    filePath: r.file_path as string,
    fileName: r.file_name as string,
    mimeType: (r.mime_type as string | null) ?? null,
    slateId: (r.slate_id as string | null) ?? null,
    takeId: r.take_number != null ? (r.take_id as string) : null,
    takeNumber: r.take_number != null ? coerceNumber(r.take_number, 0) : null,
    sceneId: (r.scene_id as string | null) ?? null,
    tags: (r.tags as string | null) ?? null,
    caption: (r.caption as string | null) ?? null,
    createdAt: r.created_at as string,
  }
}

export async function listContinuityMediaForSlate(slateId: string): Promise<ContinuityMediaView[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `${MEDIA_SELECT} WHERE m.slate_id = $1 AND m.deleted_at IS NULL ORDER BY m.created_at`,
    [slateId]
  )
  return rows.map(rowToMedia)
}

/** Every live photo for a scene (across slates and days), oldest first — for matching a reshoot. */
export async function listContinuityMediaForScene(sceneId: string): Promise<ContinuityMediaView[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `${MEDIA_SELECT} WHERE m.scene_id = $1 AND m.deleted_at IS NULL ORDER BY m.created_at`,
    [sceneId]
  )
  return rows.map(rowToMedia)
}

async function getMediaProduction(id: string): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM ${MEDIA} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows[0]?.production_id ?? null
}

export async function updateContinuityMedia(id: string, patch: { tags?: string[]; caption?: string | null }): Promise<void> {
  const productionId = await getMediaProduction(id)
  if (!productionId) throw new Error('Photo not found')
  await assertScriptSupervisorLocal(productionId)
  const sets: string[] = []
  const values: unknown[] = []
  const changes: Record<string, unknown> = {}
  if (patch.tags !== undefined) {
    changes.tags = formatContinuityTags(patch.tags)
    values.push(changes.tags)
    sets.push(`tags = $${values.length}`)
  }
  if (patch.caption !== undefined) {
    changes.caption = patch.caption?.trim() || null
    values.push(changes.caption)
    sets.push(`caption = $${values.length}`)
  }
  if (sets.length === 0) return
  values.push(now())
  sets.push(`updated_at = $${values.length}`)
  values.push(id)
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      { sql: `UPDATE ${MEDIA} SET ${sets.join(', ')} WHERE id = $${values.length}`, bindValues: values },
      outboxStatementForRow({ entity: MEDIA, entityId: id, operation: 'update', payloadJson: JSON.stringify(changes) }),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}

/** Removes a photo from continuity (the stored file stays in Documents until deleted there). */
export async function softDeleteContinuityMedia(id: string): Promise<void> {
  const productionId = await getMediaProduction(id)
  if (!productionId) return
  await assertScriptSupervisorLocal(productionId)
  const ts = now()
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, [
      { sql: 'BEGIN', bindValues: [] },
      { sql: `UPDATE ${MEDIA} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`, bindValues: [ts, ts, id] },
      outboxStatementForRow({ entity: MEDIA, entityId: id, operation: 'delete', payloadJson: null }),
      { sql: 'COMMIT', bindValues: [] },
    ])
  })
}
