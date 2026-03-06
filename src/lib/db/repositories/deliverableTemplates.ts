import { executeBatch, getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush, outboxStatementForRows } from '../outbox'
import type { DeliverableTemplate, DeliverableTemplateItem } from '../types'

const TEMPLATES_TABLE = 'deliverable_templates'
const ITEMS_TABLE = 'deliverable_template_items'
const DEL_TABLE = 'deliverables'
const SPEC_TABLE = 'technical_specs'

function rowToTemplate(r: Record<string, unknown>): DeliverableTemplate {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function rowToItem(r: Record<string, unknown>): DeliverableTemplateItem {
  return {
    id: r.id as string,
    deliverable_template_id: r.deliverable_template_id as string,
    name: r.name as string,
    due_offset_days: (r.due_offset_days as number | null) ?? null,
    default_status: (r.default_status as string | null) ?? null,
    spec_defaults_json: (r.spec_defaults_json as string | null) ?? null,
    sort_order: (r.sort_order as number) ?? 0,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

export async function listDeliverableTemplates(): Promise<DeliverableTemplate[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TEMPLATES_TABLE} WHERE deleted_at IS NULL ORDER BY name ASC`
  )
  return rows.map(rowToTemplate)
}

export async function getDeliverableTemplateWithItems(
  templateId: string
): Promise<{ template: DeliverableTemplate; items: DeliverableTemplateItem[] }> {
  const db = await getDb()
  const [templateRows, itemRows] = await Promise.all([
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${TEMPLATES_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [templateId]
    ),
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${ITEMS_TABLE} WHERE deliverable_template_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC`,
      [templateId]
    ),
  ])
  if (templateRows.length === 0) throw new Error('Deliverable template not found')
  return {
    template: rowToTemplate(templateRows[0]!),
    items: itemRows.map(rowToItem),
  }
}

export type CreateDeliverableTemplateData = {
  name: string
  description?: string | null
}

export async function createDeliverableTemplate(
  data: CreateDeliverableTemplateData
): Promise<DeliverableTemplate> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${TEMPLATES_TABLE} (id, name, description, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, data.name.trim(), data.description?.trim() ?? null, ts, ts]
  )
  await outboxPush(TEMPLATES_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TEMPLATES_TABLE} WHERE id = $1`,
    [id]
  )
  return rowToTemplate(rows[0]!)
}

export type UpdateDeliverableTemplatePatch = Partial<{
  name: string
  description: string | null
}>

export async function updateDeliverableTemplate(
  id: string,
  patch: UpdateDeliverableTemplatePatch
): Promise<DeliverableTemplate> {
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (patch.name !== undefined) {
    cols.push(`name = $${i++}`)
    vals.push(patch.name.trim())
  }
  if (patch.description !== undefined) {
    cols.push(`description = $${i++}`)
    vals.push(patch.description?.trim() ?? null)
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${TEMPLATES_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (rows.length === 0) throw new Error('Deliverable template not found')
    return rowToTemplate(rows[0]!)
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(
    `UPDATE ${TEMPLATES_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`,
    vals
  )
  await outboxPush(TEMPLATES_TABLE, id, 'update', JSON.stringify(patch))
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TEMPLATES_TABLE} WHERE id = $1`,
    [id]
  )
  return rowToTemplate(rows[0]!)
}

export async function deleteDeliverableTemplate(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${TEMPLATES_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(TEMPLATES_TABLE, id, 'delete', null)
}

export type CreateDeliverableTemplateItemData = {
  deliverable_template_id: string
  name: string
  due_offset_days?: number | null
  default_status?: string | null
  spec_defaults_json?: string | null
  sort_order?: number
}

export async function createDeliverableTemplateItem(
  data: CreateDeliverableTemplateItemData
): Promise<DeliverableTemplateItem> {
  const db = await getDb()
  const id = uuid()
  const ts = now()
  const sortOrder = data.sort_order ?? 0
  await db.execute(
    `INSERT INTO ${ITEMS_TABLE} (id, deliverable_template_id, name, due_offset_days, default_status, spec_defaults_json, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.deliverable_template_id,
      data.name.trim(),
      data.due_offset_days ?? null,
      data.default_status ?? null,
      data.spec_defaults_json ?? null,
      sortOrder,
      ts,
      ts,
    ]
  )
  await outboxPush(ITEMS_TABLE, id, 'create', JSON.stringify({ ...data, id }))
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${ITEMS_TABLE} WHERE id = $1`,
    [id]
  )
  return rowToItem(rows[0]!)
}

export type UpdateDeliverableTemplateItemPatch = Partial<{
  name: string
  due_offset_days: number | null
  default_status: string | null
  spec_defaults_json: string | null
  sort_order: number
}>

export async function updateDeliverableTemplateItem(
  id: string,
  patch: UpdateDeliverableTemplateItemPatch
): Promise<DeliverableTemplateItem> {
  const db = await getDb()
  const ts = now()
  const keys = [
    'name',
    'due_offset_days',
    'default_status',
    'spec_defaults_json',
    'sort_order',
  ] as const
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const k of keys) {
    if (patch[k] !== undefined) {
      const v = patch[k]
      cols.push(`${k} = $${i++}`)
      vals.push(k === 'name' && typeof v === 'string' ? v.trim() : v)
    }
  }
  if (cols.length === 0) {
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${ITEMS_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    )
    if (rows.length === 0) throw new Error('Deliverable template item not found')
    return rowToItem(rows[0]!)
  }
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(
    `UPDATE ${ITEMS_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`,
    vals
  )
  await outboxPush(ITEMS_TABLE, id, 'update', JSON.stringify(patch))
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${ITEMS_TABLE} WHERE id = $1`,
    [id]
  )
  return rowToItem(rows[0]!)
}

export async function deleteDeliverableTemplateItem(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${ITEMS_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(ITEMS_TABLE, id, 'delete', null)
}

export type ApplyDeliverableTemplateParams = {
  productionId: string
  templateId: string
  /** YYYY-MM-DD. Due dates = anchorDate + due_offset_days per item. If omitted, deliverables get null due_date. */
  anchorDate?: string | null
}

/**
 * Apply a deliverable template to a production. Creates deliverables and optional technical_specs.
 * Uses runInSerializedTransaction + executeBatch per DATABASE_LAYER.md.
 */
export async function applyDeliverableTemplateToProduction(
  params: ApplyDeliverableTemplateParams
): Promise<void> {
  const { productionId, templateId, anchorDate } = params

  await runInSerializedTransaction(async () => {
    const db = await getDb()
    const ts = now()

    const { items } = await getDeliverableTemplateWithItems(templateId)
    if (items.length === 0) return

    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
    ]

    const deliverableIds: string[] = []
    const deliverableIdByItemIndex: string[] = []
    const specIds: string[] = []

    for (const item of items) {
      let dueDate: string | null = null
      if (anchorDate != null && item.due_offset_days != null) {
        const d = new Date(anchorDate + 'T12:00:00')
        d.setDate(d.getDate() + item.due_offset_days)
        dueDate = d.toISOString().slice(0, 10)
      }
      const delId = uuid()
      deliverableIds.push(delId)
      deliverableIdByItemIndex.push(delId)
      const status = item.default_status?.trim() || 'not_started'
      statements.push({
        sql: `INSERT INTO ${DEL_TABLE} (id, production_id, name, due_date, status, recipient, delivery_method, delivered_by, delivered_at, approval_status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        bindValues: [
          delId,
          productionId,
          item.name,
          dueDate,
          status,
          null,
          null,
          null,
          null,
          null,
          ts,
          ts,
        ],
      })
    }

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx]!
      const specJson = item.spec_defaults_json?.trim()
      if (!specJson) continue
      let defaults: Record<string, unknown>
      try {
        defaults = JSON.parse(specJson) as Record<string, unknown>
      } catch {
        continue
      }
      const deliverableId = deliverableIdByItemIndex[idx]!
      const specId = uuid()
      specIds.push(specId)
      const resolution = (defaults.resolution as string) ?? null
      const codec = (defaults.codec as string) ?? null
      const audio = (defaults.audio as string) ?? null
      const captions = (defaults.captions as string) ?? null
      const aspect_ratio = (defaults.aspect_ratio as string) ?? null
      const platform = (defaults.platform as string) ?? null
      const notes = (defaults.notes as string) ?? null
      const bitrate = (defaults.bitrate as string) ?? null
      const subtitles = (defaults.subtitles as string) ?? null
      const graphics = (defaults.graphics as string) ?? null
      const language = (defaults.language as string) ?? null
      const audio_mix = (defaults.audio_mix as string) ?? null
      statements.push({
        sql: `INSERT INTO ${SPEC_TABLE} (id, deliverable_id, resolution, codec, audio, captions, aspect_ratio, platform, notes, bitrate, subtitles, graphics, language, audio_mix, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        bindValues: [
          specId,
          deliverableId,
          resolution,
          codec,
          audio,
          captions,
          aspect_ratio,
          platform,
          notes,
          bitrate,
          subtitles,
          graphics,
          language,
          audio_mix,
          ts,
          ts,
        ],
      })
    }

    const outboxRows: Array<{ entity: string; entityId: string; operation: 'create'; payloadJson: string | null }> = [
      ...deliverableIds.map((entityId) => ({
        entity: DEL_TABLE,
        entityId,
        operation: 'create' as const,
        payloadJson: null as string | null,
      })),
      ...specIds.map((entityId) => ({
        entity: SPEC_TABLE,
        entityId,
        operation: 'create' as const,
        payloadJson: null as string | null,
      })),
    ]
    const outboxStmt = outboxStatementForRows(outboxRows)
    if (outboxStmt) statements.push(outboxStmt)

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(db, statements)
  })
}
