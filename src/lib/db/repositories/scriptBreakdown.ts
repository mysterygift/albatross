/**
 * Script Breakdown: elements (things to source) and the tags that highlight them in the script. Local SQLite
 * only, like the other script tables.
 *
 * Tagging words finds or creates the element for them: an element of the same category whose name matches
 * the tagged words (case, spacing and quote style ignored) is reused, so "BEACH" tagged in two scenes is one
 * Locations element with two tags. Every multi-row write is one serialized transaction with its outbox rows.
 */
import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxStatementForRow } from '../outbox'
import { getEffectiveDataSourceForProduction } from '../projectDataSource'
import { coerceNumber } from '../sqlValueCoercion'
import {
  BREAKDOWN_CATEGORY_VALUES,
  type BreakdownCategory,
  type BreakdownElement,
  type BreakdownLinkedEntityType,
  type BreakdownManualStatus,
  type BreakdownTag,
} from '../types'
import { elementNameFromText } from '@/lib/breakdown/categories'
import { carryTagsToNewDraft } from '@/lib/breakdown/revisionCarry'
import { rangeText } from '@/lib/breakdown/selection'
import { normalizeNameKey } from '@/lib/text/similarity'

type Stmt = { sql: string; bindValues: unknown[] }

const ELEMENTS = 'breakdown_elements'
const TAGS = 'breakdown_tags'

export const SCRIPT_BREAKDOWN_REMOTE_ERROR =
  'Script breakdowns are stored on this device only and are not available for server-published productions.'

export async function assertScriptBreakdownLocal(productionId: string): Promise<void> {
  if ((await getEffectiveDataSourceForProduction(productionId)) === 'remote_server') {
    throw new Error(SCRIPT_BREAKDOWN_REMOTE_ERROR)
  }
}

function rowToElement(r: Record<string, unknown>): BreakdownElement {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    category: r.category as BreakdownCategory,
    name: r.name as string,
    notes: (r.notes as string | null) ?? null,
    manual_status: ((r.manual_status as BreakdownManualStatus | null) ?? 'needed'),
    linked_entity_type: (r.linked_entity_type as BreakdownLinkedEntityType | null) ?? null,
    linked_entity_id: (r.linked_entity_id as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function rowToTag(r: Record<string, unknown>): BreakdownTag {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    element_id: r.element_id as string,
    script_version_id: r.script_version_id as string,
    scene_id: r.scene_id as string,
    start_page_id: r.start_page_id as string,
    start_offset: coerceNumber(r.start_offset, 0),
    end_page_id: r.end_page_id as string,
    end_offset: coerceNumber(r.end_offset, 0),
    tagged_text: (r.tagged_text as string | null) ?? '',
    carried_from_id: (r.carried_from_id as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

export async function listBreakdownElements(productionId: string): Promise<BreakdownElement[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${ELEMENTS} WHERE production_id = $1 AND deleted_at IS NULL ORDER BY name COLLATE NOCASE`,
    [productionId]
  )
  return rows.map(rowToElement)
}

export async function listBreakdownTagsByScriptVersion(scriptVersionId: string): Promise<BreakdownTag[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT t.* FROM ${TAGS} t
     INNER JOIN ${ELEMENTS} e ON e.id = t.element_id AND e.deleted_at IS NULL
     WHERE t.script_version_id = $1 AND t.deleted_at IS NULL
     ORDER BY t.created_at, t.id`,
    [scriptVersionId]
  )
  return rows.map(rowToTag)
}

// ─── Tagging ────────────────────────────────────────────────────────────────

export type BreakdownTagRange = {
  startPageId: string
  startOffset: number
  endPageId: string
  /** Exclusive. */
  endOffset: number
}

export type CreateBreakdownTagInput = {
  scriptVersionId: string
  sceneId: string
  category: BreakdownCategory
  range: BreakdownTagRange
  /** The tagged words as they appear in the script. */
  text: string
  /** Tag onto this element instead of finding one by name. */
  elementId?: string
  /** Name for a new element (defaults to the tagged words). */
  elementName?: string
}

function assertCategory(category: string): asserts category is BreakdownCategory {
  if (!(BREAKDOWN_CATEGORY_VALUES as readonly string[]).includes(category)) {
    throw new Error(`Category must be one of: ${BREAKDOWN_CATEGORY_VALUES.join(', ')}`)
  }
}

async function getScriptVersionProduction(scriptVersionId: string): Promise<string> {
  const db = await getDb()
  const rows = await db.select<Array<{ production_id: string }>>(
    `SELECT production_id FROM script_versions WHERE id = $1 AND deleted_at IS NULL`,
    [scriptVersionId]
  )
  if (rows.length === 0) throw new Error('Script version not found')
  return rows[0]!.production_id
}

/** Checks both pages belong to the version and scene, and the range runs forwards. */
async function assertRange(input: CreateBreakdownTagInput): Promise<void> {
  const { range } = input
  const ids = [...new Set([range.startPageId, range.endPageId])]
  const db = await getDb()
  const rows = await db.select<Array<{ id: string; page_index: unknown; content: string | null }>>(
    `SELECT id, page_index, content FROM script_pages
     WHERE script_version_id = $1 AND scene_id = $2 AND deleted_at IS NULL AND id IN (${ids.map((_, i) => `$${i + 3}`).join(', ')})`,
    [input.scriptVersionId, input.sceneId, ...ids]
  )
  if (rows.length !== ids.length) throw new Error('The highlighted text is not in this scene')
  const byId = new Map(rows.map((r) => [r.id, r]))
  const start = byId.get(range.startPageId)!
  const end = byId.get(range.endPageId)!
  const startIndex = coerceNumber(start.page_index, 0)
  const endIndex = coerceNumber(end.page_index, 0)
  if (range.startOffset < 0 || range.startOffset > (start.content ?? '').length) throw new Error('Highlight starts outside the page')
  if (range.endOffset < 0 || range.endOffset > (end.content ?? '').length) throw new Error('Highlight ends outside the page')
  if (endIndex < startIndex || (endIndex === startIndex && range.endOffset <= range.startOffset)) {
    throw new Error('Highlight some text first')
  }
}

function elementInsert(id: string, productionId: string, category: BreakdownCategory, name: string, ts: string): Stmt[] {
  return [
    {
      sql: `INSERT INTO ${ELEMENTS} (id, production_id, category, name, manual_status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, 'needed', $5, $5)`,
      bindValues: [id, productionId, category, name, ts],
    },
    outboxStatementForRow({
      entity: ELEMENTS, entityId: id, operation: 'create',
      payloadJson: JSON.stringify({ category, name }),
    }),
  ]
}

export function tagInsert(args: {
  id: string
  productionId: string
  elementId: string
  scriptVersionId: string
  sceneId: string
  range: BreakdownTagRange
  text: string
  carriedFromId?: string | null
  ts: string
}): Stmt[] {
  return [
    {
      sql: `INSERT INTO ${TAGS} (id, production_id, element_id, script_version_id, scene_id, start_page_id, start_offset,
              end_page_id, end_offset, tagged_text, carried_from_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
      bindValues: [
        args.id, args.productionId, args.elementId, args.scriptVersionId, args.sceneId,
        args.range.startPageId, args.range.startOffset, args.range.endPageId, args.range.endOffset,
        args.text, args.carriedFromId ?? null, args.ts,
      ],
    },
    outboxStatementForRow({
      entity: TAGS, entityId: args.id, operation: 'create',
      payloadJson: JSON.stringify({ element_id: args.elementId, scene_id: args.sceneId, tagged_text: args.text }),
    }),
  ]
}

export type CreatedBreakdownTag = { tagId: string; elementId: string; createdElement: boolean }

/**
 * Tags highlighted words. Each tag goes onto `elementId` when given, else onto the category's element with the
 * same name, else onto a new element named after the words. Inputs in one call that name the same new element
 * share it.
 */
export async function createBreakdownTags(inputs: readonly CreateBreakdownTagInput[]): Promise<CreatedBreakdownTag[]> {
  if (inputs.length === 0) return []
  const versionIds = [...new Set(inputs.map((i) => i.scriptVersionId))]
  const productionIds = new Set(await Promise.all(versionIds.map(getScriptVersionProduction)))
  if (productionIds.size !== 1) throw new Error('Tags must all belong to one production')
  const productionId = [...productionIds][0]!
  await assertScriptBreakdownLocal(productionId)
  for (const input of inputs) {
    assertCategory(input.category)
    if (!input.text.trim()) throw new Error('Highlight some text first')
    await assertRange(input)
  }

  return runInSerializedTransaction(async () => {
    const db = await getDb()
    const elements = (
      await db.select<Record<string, unknown>[]>(
        `SELECT * FROM ${ELEMENTS} WHERE production_id = $1 AND deleted_at IS NULL`,
        [productionId]
      )
    ).map(rowToElement)
    const byKey = new Map<string, string>()
    for (const el of elements) byKey.set(`${el.category}|${normalizeNameKey(el.name)}`, el.id)
    const known = new Map(elements.map((el) => [el.id, el]))

    const ts = now()
    const statements: Stmt[] = [{ sql: 'BEGIN', bindValues: [] }]
    const out: CreatedBreakdownTag[] = []
    for (const input of inputs) {
      let elementId = input.elementId ?? null
      let createdElement = false
      if (elementId) {
        const el = known.get(elementId)
        if (!el) throw new Error('Breakdown element not found')
        if (el.category !== input.category) throw new Error('That element is in a different category')
      } else {
        const name = elementNameFromText(input.category, input.elementName ?? input.text)
        const key = `${input.category}|${normalizeNameKey(name)}`
        elementId = byKey.get(key) ?? null
        if (!elementId) {
          elementId = uuid()
          createdElement = true
          byKey.set(key, elementId)
          statements.push(...elementInsert(elementId, productionId, input.category, name, ts))
        }
      }
      const tagId = uuid()
      statements.push(
        ...tagInsert({
          id: tagId, productionId, elementId, scriptVersionId: input.scriptVersionId, sceneId: input.sceneId,
          range: input.range, text: input.text, ts,
        })
      )
      out.push({ tagId, elementId, createdElement })
    }
    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
    return out
  })
}

export async function createBreakdownTag(input: CreateBreakdownTagInput): Promise<CreatedBreakdownTag> {
  const [created] = await createBreakdownTags([input])
  return created!
}

async function getTag(id: string): Promise<BreakdownTag | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${TAGS} WHERE id = $1 AND deleted_at IS NULL`, [id])
  return rows[0] ? rowToTag(rows[0]) : null
}

async function getElement(id: string): Promise<BreakdownElement | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${ELEMENTS} WHERE id = $1 AND deleted_at IS NULL`, [id])
  return rows[0] ? rowToElement(rows[0]) : null
}

async function runStatements(statements: Stmt[]): Promise<void> {
  await runInSerializedTransaction(async () => {
    const db = await getDb()
    await executeBatch(db, [{ sql: 'BEGIN', bindValues: [] }, ...statements, { sql: 'COMMIT', bindValues: [] }])
  })
}

export async function deleteBreakdownTag(id: string): Promise<void> {
  const tag = await getTag(id)
  if (!tag) throw new Error('Tag not found')
  await assertScriptBreakdownLocal(tag.production_id)
  const ts = now()
  await runStatements([
    { sql: `UPDATE ${TAGS} SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND deleted_at IS NULL`, bindValues: [ts, id] },
    outboxStatementForRow({ entity: TAGS, entityId: id, operation: 'delete', payloadJson: JSON.stringify({ deleted_at: ts }) }),
  ])
}

/** Moves a tag onto another element of the same category. */
export async function moveBreakdownTag(tagId: string, elementId: string): Promise<void> {
  const tag = await getTag(tagId)
  if (!tag) throw new Error('Tag not found')
  const element = await getElement(elementId)
  if (!element || element.production_id !== tag.production_id) throw new Error('Breakdown element not found')
  const current = await getElement(tag.element_id)
  if (current && current.category !== element.category) throw new Error('That element is in a different category')
  await assertScriptBreakdownLocal(tag.production_id)
  const ts = now()
  await runStatements([
    { sql: `UPDATE ${TAGS} SET element_id = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`, bindValues: [elementId, ts, tagId] },
    outboxStatementForRow({ entity: TAGS, entityId: tagId, operation: 'update', payloadJson: JSON.stringify({ element_id: elementId }) }),
  ])
}

/** Moves a tag onto a new element of its category with the given name (or the existing one with that name). */
export async function moveBreakdownTagToNewElement(tagId: string, name: string): Promise<string> {
  const tag = await getTag(tagId)
  if (!tag) throw new Error('Tag not found')
  const current = await getElement(tag.element_id)
  if (!current) throw new Error('Breakdown element not found')
  const clean = elementNameFromText(current.category, name)
  if (!clean) throw new Error('Give the element a name')
  await assertScriptBreakdownLocal(tag.production_id)
  const elements = await listBreakdownElements(tag.production_id)
  const existing = elements.find(
    (e) => e.category === current.category && normalizeNameKey(e.name) === normalizeNameKey(clean)
  )
  if (existing) {
    await moveBreakdownTag(tagId, existing.id)
    return existing.id
  }
  const elementId = uuid()
  const ts = now()
  await runStatements([
    ...elementInsert(elementId, tag.production_id, current.category, clean, ts),
    { sql: `UPDATE ${TAGS} SET element_id = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`, bindValues: [elementId, ts, tagId] },
    outboxStatementForRow({ entity: TAGS, entityId: tagId, operation: 'update', payloadJson: JSON.stringify({ element_id: elementId }) }),
  ])
  return elementId
}

// ─── Elements ───────────────────────────────────────────────────────────────

export type UpdateBreakdownElementInput = {
  name?: string
  notes?: string | null
  manualStatus?: BreakdownManualStatus
  /** Pass null for both to unlink. */
  linkedEntityType?: BreakdownLinkedEntityType | null
  linkedEntityId?: string | null
}

export async function updateBreakdownElement(id: string, patch: UpdateBreakdownElementInput): Promise<void> {
  const element = await getElement(id)
  if (!element) throw new Error('Breakdown element not found')
  await assertScriptBreakdownLocal(element.production_id)
  const sets: string[] = []
  const values: unknown[] = []
  const payload: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
    payload[column] = value
  }
  if (patch.name !== undefined) {
    const name = elementNameFromText(element.category, patch.name)
    if (!name) throw new Error('Give the element a name')
    set('name', name)
  }
  if (patch.notes !== undefined) set('notes', patch.notes?.trim() || null)
  if (patch.manualStatus !== undefined) {
    if (patch.manualStatus !== 'needed' && patch.manualStatus !== 'sourced') throw new Error('Status must be needed or sourced')
    set('manual_status', patch.manualStatus)
  }
  if (patch.linkedEntityType !== undefined || patch.linkedEntityId !== undefined) {
    const type = patch.linkedEntityType ?? null
    const entityId = patch.linkedEntityId ?? null
    if ((type == null) !== (entityId == null)) throw new Error('Link needs both a type and a row')
    set('linked_entity_type', type)
    set('linked_entity_id', entityId)
  }
  if (sets.length === 0) return
  const ts = now()
  values.push(ts)
  sets.push(`updated_at = $${values.length}`)
  values.push(id)
  await runStatements([
    { sql: `UPDATE ${ELEMENTS} SET ${sets.join(', ')} WHERE id = $${values.length} AND deleted_at IS NULL`, bindValues: values },
    outboxStatementForRow({ entity: ELEMENTS, entityId: id, operation: 'update', payloadJson: JSON.stringify(payload) }),
  ])
}

/** Moves every tag of the source elements onto the target and removes the sources. All must share a category. */
export async function mergeBreakdownElements(sourceIds: readonly string[], targetId: string): Promise<void> {
  const target = await getElement(targetId)
  if (!target) throw new Error('Breakdown element not found')
  const sources = (await Promise.all(sourceIds.filter((id) => id !== targetId).map(getElement))).filter(
    (e): e is BreakdownElement => e != null
  )
  if (sources.length === 0) return
  if (sources.some((s) => s.production_id !== target.production_id || s.category !== target.category)) {
    throw new Error('Only elements in the same category can be merged')
  }
  await assertScriptBreakdownLocal(target.production_id)
  const ts = now()
  const statements: Stmt[] = []
  for (const source of sources) {
    statements.push(
      { sql: `UPDATE ${TAGS} SET element_id = $1, updated_at = $2 WHERE element_id = $3 AND deleted_at IS NULL`, bindValues: [targetId, ts, source.id] },
      { sql: `UPDATE ${ELEMENTS} SET deleted_at = $1, updated_at = $1 WHERE id = $2`, bindValues: [ts, source.id] },
      outboxStatementForRow({
        entity: ELEMENTS, entityId: source.id, operation: 'delete',
        payloadJson: JSON.stringify({ deleted_at: ts, merged_into: targetId }),
      })
    )
  }
  await runStatements(statements)
}

/** Removes an element and every tag on it. */
export async function deleteBreakdownElement(id: string): Promise<void> {
  const element = await getElement(id)
  if (!element) throw new Error('Breakdown element not found')
  await assertScriptBreakdownLocal(element.production_id)
  const ts = now()
  await runStatements([
    { sql: `UPDATE ${TAGS} SET deleted_at = $1, updated_at = $1 WHERE element_id = $2 AND deleted_at IS NULL`, bindValues: [ts, id] },
    { sql: `UPDATE ${ELEMENTS} SET deleted_at = $1, updated_at = $1 WHERE id = $2`, bindValues: [ts, id] },
    outboxStatementForRow({ entity: ELEMENTS, entityId: id, operation: 'delete', payloadJson: JSON.stringify({ deleted_at: ts }) }),
  ])
}

// ─── Carrying tags to a new draft ───────────────────────────────────────────

const REVISION_ITEMS = 'script_revision_items'

export type BreakdownCarrySummary = { carried: number; moved: number; unmatched: number }

/**
 * Carries tags from earlier drafts onto `toVersionId` for every scene it contains. A tag is carried once:
 * tags already carried (they have a child tag) or already recorded in the revision review list are skipped,
 * so this is safe to run every time the page opens. Each tag gets a `script_revision_items` row
 * (item_type 'breakdown_tag'); carried and moved tags become new tags on the same element.
 */
export async function carryBreakdownTagsForward(toVersionId: string): Promise<BreakdownCarrySummary> {
  const summary: BreakdownCarrySummary = { carried: 0, moved: 0, unmatched: 0 }
  const productionId = await getScriptVersionProduction(toVersionId)
  if ((await getEffectiveDataSourceForProduction(productionId)) === 'remote_server') return summary
  const db = await getDb()
  const pending = (
    await db.select<Record<string, unknown>[]>(
      `SELECT t.* FROM ${TAGS} t
       INNER JOIN ${ELEMENTS} e ON e.id = t.element_id AND e.deleted_at IS NULL
       INNER JOIN script_versions fv ON fv.id = t.script_version_id AND fv.deleted_at IS NULL
       INNER JOIN script_versions tv ON tv.id = $2
       WHERE t.production_id = $1 AND t.deleted_at IS NULL AND t.script_version_id <> $2
         AND (fv.created_at < tv.created_at OR (fv.created_at = tv.created_at AND fv.id < tv.id))
         AND EXISTS (SELECT 1 FROM script_pages p WHERE p.script_version_id = $2 AND p.scene_id = t.scene_id AND p.deleted_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM ${TAGS} c WHERE c.carried_from_id = t.id)
         AND NOT EXISTS (SELECT 1 FROM ${REVISION_ITEMS} r WHERE r.item_type = 'breakdown_tag' AND r.item_id = t.id AND r.deleted_at IS NULL)`,
      [productionId, toVersionId]
    )
  ).map(rowToTag)
  if (pending.length === 0) return summary

  const pagesFor = async (versionId: string, sceneId: string) =>
    db.select<Array<{ id: string; page_number: string | null; page_index: unknown; content: string | null }>>(
      `SELECT id, page_number, page_index, content FROM script_pages
       WHERE script_version_id = $1 AND scene_id = $2 AND deleted_at IS NULL ORDER BY page_index`,
      [versionId, sceneId]
    ).then((rows) => rows.map((r) => ({ ...r, page_index: coerceNumber(r.page_index, 0) })))

  const groups = new Map<string, BreakdownTag[]>()
  for (const tag of pending) {
    const key = `${tag.script_version_id}|${tag.scene_id}`
    groups.set(key, [...(groups.get(key) ?? []), tag])
  }

  const ts = now()
  const statements: Stmt[] = []
  for (const tags of groups.values()) {
    const { script_version_id: fromVersionId, scene_id: sceneId } = tags[0]!
    const [oldPages, newPages] = await Promise.all([pagesFor(fromVersionId, sceneId), pagesFor(toVersionId, sceneId)])
    const carries = carryTagsToNewDraft({ oldPages, newPages }, tags)
    for (const tag of tags) {
      const carry = carries.get(tag.id)!
      let newTagId: string | null = null
      if (carry.outcome !== 'unmatched') {
        newTagId = uuid()
        const text = rangeText(newPages.map((p) => ({ id: p.id, content: p.content ?? '' })), carry.range) || tag.tagged_text
        statements.push(
          ...tagInsert({
            id: newTagId, productionId, elementId: tag.element_id, scriptVersionId: toVersionId, sceneId,
            range: carry.range, text, carriedFromId: tag.id, ts,
          })
        )
      }
      summary[carry.outcome] += 1
      const itemId = uuid()
      statements.push(
        {
          sql: `INSERT INTO ${REVISION_ITEMS} (id, production_id, scene_id, from_script_version_id, to_script_version_id, item_type, item_id, outcome, new_item_id, detail, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, 'breakdown_tag', $6, $7, $8, $9, $10, $10)`,
          bindValues: [
            itemId, productionId, sceneId, fromVersionId, toVersionId, tag.id, carry.outcome, newTagId,
            carry.notes.length > 0 ? carry.notes.join('\n') : null, ts,
          ],
        },
        outboxStatementForRow({
          entity: REVISION_ITEMS, entityId: itemId, operation: 'create',
          payloadJson: JSON.stringify({ item_type: 'breakdown_tag', item_id: tag.id, outcome: carry.outcome, new_item_id: newTagId }),
        })
      )
    }
  }
  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    // Re-check inside the write lock so two openings of the page cannot both carry.
    const again = await conn.select<Array<{ n: unknown }>>(
      `SELECT COUNT(*) AS n FROM ${REVISION_ITEMS} WHERE item_type = 'breakdown_tag' AND to_script_version_id = $1 AND deleted_at IS NULL
         AND item_id IN (${pending.map((_, i) => `$${i + 2}`).join(', ')})`,
      [toVersionId, ...pending.map((t) => t.id)]
    )
    if (coerceNumber(again[0]?.n, 0) > 0) return
    await executeBatch(conn, [{ sql: 'BEGIN', bindValues: [] }, ...statements, { sql: 'COMMIT', bindValues: [] }])
  })
  return summary
}

export type BreakdownRevisionReviewItem = {
  /** script_revision_items id (mark it reviewed with markRevisionItemReviewed). */
  id: string
  outcome: 'moved' | 'unmatched'
  sceneId: string
  sceneNumber: string | null
  category: BreakdownCategory
  elementName: string
  taggedText: string
  /** The carried tag on the new draft (moved only). */
  newTagId: string | null
  notes: string[]
}

/** Moved and unmatched breakdown tags on `toVersionId` that nobody has looked at yet. */
export async function listBreakdownRevisionReview(toVersionId: string): Promise<BreakdownRevisionReviewItem[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT r.id, r.outcome, r.scene_id, r.new_item_id, r.detail, sc.scene_number, e.category, e.name AS element_name, t.tagged_text
     FROM ${REVISION_ITEMS} r
     INNER JOIN ${TAGS} t ON t.id = r.item_id
     INNER JOIN ${ELEMENTS} e ON e.id = t.element_id AND e.deleted_at IS NULL
     LEFT JOIN scenes sc ON sc.id = r.scene_id
     WHERE r.item_type = 'breakdown_tag' AND r.to_script_version_id = $1 AND r.deleted_at IS NULL
       AND r.reviewed_at IS NULL AND r.outcome IN ('moved', 'unmatched')
     ORDER BY r.created_at, r.id`,
    [toVersionId]
  )
  return rows.map((r) => ({
    id: r.id as string,
    outcome: r.outcome as 'moved' | 'unmatched',
    sceneId: r.scene_id as string,
    sceneNumber: (r.scene_number as string | null) ?? null,
    category: r.category as BreakdownCategory,
    elementName: r.element_name as string,
    taggedText: (r.tagged_text as string | null) ?? '',
    newTagId: (r.new_item_id as string | null) ?? null,
    notes: ((r.detail as string | null) ?? '').split('\n').filter(Boolean),
  }))
}
