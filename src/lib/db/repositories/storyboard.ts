import { getDb, now, runInSerializedTransaction, uuid } from '../client'
import { outboxPush, outboxStatementForRow } from '../outbox'
import type {
  StoryboardImage,
  StoryboardImport,
  StoryboardImportStatus,
  StoryboardImageSourceType,
  StoryboardImportSourceType,
} from '../types'
import {
  STORYBOARD_IMAGE_SOURCE_TYPES,
  STORYBOARD_IMPORT_SOURCE_TYPES,
  STORYBOARD_IMPORT_STATUS_VALUES,
} from '../types'

const IMAGE_TABLE = 'storyboard_images'
const IMPORT_TABLE = 'storyboard_imports'

function isMissingStoryboardTableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('no such table') ||
    message.includes('does not exist') ||
    message.includes('unknown table')
  ) && message.includes('storyboard_')
}

type ShotContext = {
  shotId: string
  sceneId: string
  productionId: string
}

export type StoryboardShotBundle = {
  shot_id: string
  shot_number: string
  scene_id: string
  scene_number: string
  primary_image: StoryboardImage | null
  images: StoryboardImage[]
}

function rowToStoryboardImage(r: Record<string, unknown>): StoryboardImage {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    scene_id: r.scene_id as string,
    shot_id: r.shot_id as string,
    storage_key: r.storage_key as string,
    original_filename: r.original_filename as string,
    mime_type: r.mime_type as string,
    width: (r.width as number | null) ?? null,
    height: (r.height as number | null) ?? null,
    sort_order: r.sort_order as number,
    source_type: r.source_type as StoryboardImageSourceType,
    source_import_id: (r.source_import_id as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function rowToStoryboardImport(r: Record<string, unknown>): StoryboardImport {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    scene_id: (r.scene_id as string | null) ?? null,
    source_filename: r.source_filename as string,
    source_type: r.source_type as StoryboardImportSourceType,
    status: r.status as StoryboardImportStatus,
    metadata_json: (r.metadata_json as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: (r.deleted_at as string | null) ?? null,
  }
}

function isImageMimeType(value: string): boolean {
  return /^image\/[a-z0-9.+-]+$/i.test(value.trim())
}

function assertKnownImageSourceType(sourceType: string): asserts sourceType is StoryboardImageSourceType {
  if (!(STORYBOARD_IMAGE_SOURCE_TYPES as readonly string[]).includes(sourceType)) {
    throw new Error(`Invalid storyboard image source_type: ${sourceType}`)
  }
}

function assertKnownImportSourceType(sourceType: string): asserts sourceType is StoryboardImportSourceType {
  if (!(STORYBOARD_IMPORT_SOURCE_TYPES as readonly string[]).includes(sourceType)) {
    throw new Error(`Invalid storyboard import source_type: ${sourceType}`)
  }
}

function assertKnownImportStatus(status: string): asserts status is StoryboardImportStatus {
  if (!(STORYBOARD_IMPORT_STATUS_VALUES as readonly string[]).includes(status)) {
    throw new Error(`Invalid storyboard import status: ${status}`)
  }
}

async function getShotContext(shotId: string): Promise<ShotContext | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT sh.id AS shot_id, sh.scene_id AS scene_id, sc.production_id AS production_id
     FROM shots sh
     INNER JOIN scenes sc ON sc.id = sh.scene_id AND sc.deleted_at IS NULL
     WHERE sh.id = $1 AND sh.deleted_at IS NULL`,
    [shotId]
  )
  if (!rows.length) return null
  return {
    shotId: rows[0]!.shot_id as string,
    sceneId: rows[0]!.scene_id as string,
    productionId: rows[0]!.production_id as string,
  }
}

async function nextSortOrderForShot(shotId: string): Promise<number> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
     FROM ${IMAGE_TABLE}
     WHERE shot_id = $1 AND deleted_at IS NULL`,
    [shotId]
  )
  return Number(rows[0]?.next_sort_order ?? 0)
}

export async function listStoryboardImagesByShot(shotId: string): Promise<StoryboardImage[]> {
  try {
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${IMAGE_TABLE}
       WHERE shot_id = $1 AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC, id ASC`,
      [shotId]
    )
    return rows.map(rowToStoryboardImage)
  } catch (error) {
    if (isMissingStoryboardTableError(error)) return []
    throw error
  }
}

export async function listStoryboardImagesByScene(sceneId: string): Promise<StoryboardImage[]> {
  try {
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${IMAGE_TABLE}
       WHERE scene_id = $1 AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC, id ASC`,
      [sceneId]
    )
    return rows.map(rowToStoryboardImage)
  } catch (error) {
    if (isMissingStoryboardTableError(error)) return []
    throw error
  }
}

export async function listStoryboardImagesByProduction(productionId: string): Promise<StoryboardImage[]> {
  try {
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT * FROM ${IMAGE_TABLE}
       WHERE production_id = $1 AND deleted_at IS NULL
       ORDER BY scene_id ASC, shot_id ASC, sort_order ASC, created_at ASC, id ASC`,
      [productionId]
    )
    return rows.map(rowToStoryboardImage)
  } catch (error) {
    if (isMissingStoryboardTableError(error)) return []
    throw error
  }
}

/**
 * Primary storyboard image rule:
 * - If multiple images exist for a shot, primary is the one with the lowest sort_order.
 * - Ties are broken by created_at then id via list ordering query.
 */
export async function getPrimaryStoryboardImageForShot(shotId: string): Promise<StoryboardImage | null> {
  const images = await listStoryboardImagesByShot(shotId)
  return images[0] ?? null
}

export async function getStoryboardImagesForScene(sceneId: string): Promise<Map<string, StoryboardImage[]>> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${IMAGE_TABLE}
     WHERE scene_id = $1 AND deleted_at IS NULL
     ORDER BY shot_id ASC, sort_order ASC, created_at ASC, id ASC`,
    [sceneId]
  )
  const byShot = new Map<string, StoryboardImage[]>()
  for (const row of rows) {
    const image = rowToStoryboardImage(row)
    const list = byShot.get(image.shot_id) ?? []
    list.push(image)
    byShot.set(image.shot_id, list)
  }
  return byShot
}

/**
 * Downstream read model for shot-list/call-sheet/export integrations.
 * Preserves canonical scene/shot ordering from schedule:
 * scene_number ASC, shot_number ASC.
 */
export async function getStoryboardBundleForShotList(productionId: string): Promise<StoryboardShotBundle[]> {
  const db = await getDb()
  const shotRows = await db.select<Record<string, unknown>[]>(
    `SELECT sh.id AS shot_id, sh.shot_number AS shot_number, sh.scene_id AS scene_id, sc.scene_number AS scene_number
     FROM shots sh
     INNER JOIN scenes sc ON sc.id = sh.scene_id
     WHERE sc.production_id = $1
       AND sc.deleted_at IS NULL
       AND sh.deleted_at IS NULL
     ORDER BY sc.scene_number ASC, sh.shot_number ASC`,
    [productionId]
  )
  const images = await listStoryboardImagesByProduction(productionId)
  const imagesByShot = new Map<string, StoryboardImage[]>()
  for (const img of images) {
    const list = imagesByShot.get(img.shot_id) ?? []
    list.push(img)
    imagesByShot.set(img.shot_id, list)
  }

  return shotRows.map((row) => {
    const shotId = row.shot_id as string
    const shotImages = imagesByShot.get(shotId) ?? []
    return {
      shot_id: shotId,
      shot_number: row.shot_number as string,
      scene_id: row.scene_id as string,
      scene_number: row.scene_number as string,
      primary_image: shotImages[0] ?? null,
      images: shotImages,
    }
  })
}

export async function getStoryboardImageById(id: string): Promise<StoryboardImage | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${IMAGE_TABLE}
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToStoryboardImage(rows[0]!) : null
}

type CreateStoryboardImageInput = {
  production_id: string
  scene_id: string
  shot_id: string
  storage_key: string
  original_filename: string
  mime_type: string
  width?: number | null
  height?: number | null
  sort_order?: number
  source_type: StoryboardImageSourceType
  source_import_id?: string | null
}

export async function createStoryboardImage(data: CreateStoryboardImageInput): Promise<StoryboardImage> {
  const shotContext = await getShotContext(data.shot_id)
  if (!shotContext) throw new Error('Shot not found or deleted')
  if (shotContext.sceneId !== data.scene_id) throw new Error('scene_id does not match shot.scene_id')
  if (shotContext.productionId !== data.production_id) {
    throw new Error('production_id does not match shot production')
  }

  assertKnownImageSourceType(data.source_type)
  const mimeType = data.mime_type.trim().toLowerCase()
  if (!isImageMimeType(mimeType)) {
    throw new Error(
      data.source_type === 'manual'
        ? 'Manual storyboard images must use an image MIME type'
        : 'mime_type must be an image MIME type'
    )
  }
  if (data.source_type !== 'athena_pdf_import' && data.source_import_id) {
    throw new Error('source_import_id is only valid for athena_pdf_import images')
  }
  if (data.width != null && (!Number.isInteger(data.width) || data.width < 0)) {
    throw new Error('width must be a non-negative integer when provided')
  }
  if (data.height != null && (!Number.isInteger(data.height) || data.height < 0)) {
    throw new Error('height must be a non-negative integer when provided')
  }

  const resolvedSortOrder =
    data.sort_order ?? (await nextSortOrderForShot(data.shot_id))
  if (!Number.isInteger(resolvedSortOrder) || resolvedSortOrder < 0) {
    throw new Error('sort_order must be a non-negative integer')
  }

  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${IMAGE_TABLE} (
      id, production_id, scene_id, shot_id, storage_key, original_filename, mime_type,
      width, height, sort_order, source_type, source_import_id, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      data.production_id,
      data.scene_id,
      data.shot_id,
      data.storage_key,
      data.original_filename,
      mimeType,
      data.width ?? null,
      data.height ?? null,
      resolvedSortOrder,
      data.source_type,
      data.source_import_id ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(IMAGE_TABLE, id, 'create', JSON.stringify({ ...data, mime_type: mimeType, id }))
  return (await getStoryboardImageById(id))!
}

type UpdateStoryboardImageInput = Partial<
  Pick<
    StoryboardImage,
    'storage_key' | 'original_filename' | 'mime_type' | 'width' | 'height' | 'sort_order'
  >
>

export async function updateStoryboardImage(
  id: string,
  data: UpdateStoryboardImageInput
): Promise<StoryboardImage> {
  const existing = await getStoryboardImageById(id)
  if (!existing) throw new Error('Storyboard image not found')
  const nextData = { ...data }
  if (nextData.mime_type !== undefined) {
    const normalizedMime = nextData.mime_type.trim().toLowerCase()
    if (!isImageMimeType(normalizedMime)) throw new Error('mime_type must be an image MIME type')
    nextData.mime_type = normalizedMime
  }
  if (nextData.width !== undefined && nextData.width !== null) {
    if (!Number.isInteger(nextData.width) || nextData.width < 0) {
      throw new Error('width must be a non-negative integer when provided')
    }
  }
  if (nextData.height !== undefined && nextData.height !== null) {
    if (!Number.isInteger(nextData.height) || nextData.height < 0) {
      throw new Error('height must be a non-negative integer when provided')
    }
  }
  if (nextData.sort_order !== undefined) {
    if (!Number.isInteger(nextData.sort_order) || nextData.sort_order < 0) {
      throw new Error('sort_order must be a non-negative integer')
    }
  }

  const keys = ['storage_key', 'original_filename', 'mime_type', 'width', 'height', 'sort_order'] as const
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const key of keys) {
    if (nextData[key] !== undefined) {
      cols.push(`${key} = $${i++}`)
      vals.push(nextData[key])
    }
  }
  if (!cols.length) return existing
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${IMAGE_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(IMAGE_TABLE, id, 'update', JSON.stringify(nextData))
  return (await getStoryboardImageById(id))!
}

export async function deleteStoryboardImage(id: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  await db.execute(
    `UPDATE ${IMAGE_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3`,
    [ts, ts, id]
  )
  await outboxPush(IMAGE_TABLE, id, 'delete', null)
}

export async function deleteStoryboardImagesByShot(shotId: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${IMAGE_TABLE} WHERE shot_id = $1 AND deleted_at IS NULL`,
    [shotId]
  )
  if (!rows.length) return
  await db.execute(
    `UPDATE ${IMAGE_TABLE} SET deleted_at = $1, updated_at = $2 WHERE shot_id = $3 AND deleted_at IS NULL`,
    [ts, ts, shotId]
  )
  for (const row of rows) {
    await outboxPush(IMAGE_TABLE, row.id as string, 'delete', null)
  }
}

/**
 * Shot lifecycle sync: when a shot is deleted/archived, storyboard images attached to it
 * must be soft-deleted so no orphan storyboard rows remain.
 */
export async function cleanupStoryboardImagesForDeletedShot(shotId: string): Promise<void> {
  await deleteStoryboardImagesByShot(shotId)
}

/**
 * Shot lifecycle sync: when a shot moves scenes, keep existing storyboard images attached
 * to the same shot and update scene_id to match the shot's new scene.
 */
export async function updateStoryboardSceneForMovedShot(shotId: string, toSceneId: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${IMAGE_TABLE} WHERE shot_id = $1 AND deleted_at IS NULL`,
    [shotId]
  )
  if (!rows.length) return
  await db.execute(
    `UPDATE ${IMAGE_TABLE}
     SET scene_id = $1, updated_at = $2
     WHERE shot_id = $3 AND deleted_at IS NULL`,
    [toSceneId, ts, shotId]
  )
  for (const row of rows) {
    await outboxPush(IMAGE_TABLE, row.id as string, 'update', JSON.stringify({ scene_id: toSceneId }))
  }
}

/**
 * Scene lifecycle sync: when a scene is deleted/archived, remove storyboard images linked
 * to that scene so scene-level orphans are not retained.
 */
export async function cleanupStoryboardImagesForDeletedScene(sceneId: string): Promise<void> {
  const db = await getDb()
  const ts = now()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id FROM ${IMAGE_TABLE} WHERE scene_id = $1 AND deleted_at IS NULL`,
    [sceneId]
  )
  if (!rows.length) return
  await db.execute(
    `UPDATE ${IMAGE_TABLE}
     SET deleted_at = $1, updated_at = $2
     WHERE scene_id = $3 AND deleted_at IS NULL`,
    [ts, ts, sceneId]
  )
  for (const row of rows) {
    await outboxPush(IMAGE_TABLE, row.id as string, 'delete', null)
  }
}

type CreateStoryboardImportInput = {
  production_id: string
  scene_id?: string | null
  source_filename: string
  source_type: StoryboardImportSourceType
  status?: StoryboardImportStatus
  metadata_json?: string | null
}

export async function createStoryboardImport(data: CreateStoryboardImportInput): Promise<StoryboardImport> {
  assertKnownImportSourceType(data.source_type)
  const status = data.status ?? 'pending'
  assertKnownImportStatus(status)

  const db = await getDb()
  const id = uuid()
  const ts = now()
  await db.execute(
    `INSERT INTO ${IMPORT_TABLE} (
      id, production_id, scene_id, source_filename, source_type, status, metadata_json, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      data.production_id,
      data.scene_id ?? null,
      data.source_filename,
      data.source_type,
      status,
      data.metadata_json ?? null,
      ts,
      ts,
    ]
  )
  await outboxPush(IMPORT_TABLE, id, 'create', JSON.stringify({ ...data, status, id }))
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${IMPORT_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rowToStoryboardImport(rows[0]!)
}

export async function getStoryboardImportById(id: string): Promise<StoryboardImport | null> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${IMPORT_TABLE} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  )
  return rows.length ? rowToStoryboardImport(rows[0]!) : null
}

export async function updateStoryboardImport(
  id: string,
  data: Partial<Pick<StoryboardImport, 'scene_id' | 'status' | 'metadata_json'>>
): Promise<StoryboardImport> {
  const existing = await getStoryboardImportById(id)
  if (!existing) throw new Error('Storyboard import not found')
  if (data.status !== undefined) {
    assertKnownImportStatus(data.status)
  }

  const keys = ['scene_id', 'status', 'metadata_json'] as const
  const db = await getDb()
  const ts = now()
  const cols: string[] = []
  const vals: unknown[] = []
  let i = 1
  for (const key of keys) {
    if (data[key] !== undefined) {
      cols.push(`${key} = $${i++}`)
      vals.push(data[key])
    }
  }
  if (!cols.length) return existing
  cols.push(`updated_at = $${i}`)
  vals.push(ts, id)
  await db.execute(`UPDATE ${IMPORT_TABLE} SET ${cols.join(', ')} WHERE id = $${i + 1}`, vals)
  await outboxPush(IMPORT_TABLE, id, 'update', JSON.stringify(data))
  return (await getStoryboardImportById(id))!
}

export type ApplyAthenaImportItem = {
  candidate_id: string
  shot_id: string
  scene_id: string
  storage_key: string
  original_filename: string
  mime_type: string
  width?: number | null
  height?: number | null
  conflict_policy: 'replace' | 'add'
}

export async function applyAthenaImportToStoryboard(args: {
  production_id: string
  source_import_id: string
  items: ApplyAthenaImportItem[]
}): Promise<{ appliedCount: number }> {
  if (args.items.length === 0) return { appliedCount: 0 }
  const db = await getDb()
  const ts = now()
  const shotIds = [...new Set(args.items.map((item) => item.shot_id))]
  const placeholders = shotIds.map((_, i) => `$${i + 1}`).join(', ')
  const shotRows = await db.select<Record<string, unknown>[]>(
    `SELECT sh.id AS shot_id, sh.scene_id AS scene_id, sc.production_id AS production_id
     FROM shots sh
     INNER JOIN scenes sc ON sc.id = sh.scene_id AND sc.deleted_at IS NULL
     WHERE sh.id IN (${placeholders}) AND sh.deleted_at IS NULL`,
    shotIds
  )
  const shotContextById = new Map(
    shotRows.map((row) => [
      row.shot_id as string,
      {
        scene_id: row.scene_id as string,
        production_id: row.production_id as string,
      },
    ])
  )
  for (const item of args.items) {
    const context = shotContextById.get(item.shot_id)
    if (!context) throw new Error(`Shot not found or deleted: ${item.shot_id}`)
    if (context.production_id !== args.production_id) {
      throw new Error(`Shot ${item.shot_id} does not belong to this production`)
    }
    if (context.scene_id !== item.scene_id) {
      throw new Error(`Scene mismatch for shot ${item.shot_id}`)
    }
    const normalizedMime = item.mime_type.trim().toLowerCase()
    if (!isImageMimeType(normalizedMime)) throw new Error('mime_type must be an image MIME type')
  }

  const existingRows = await db.select<Record<string, unknown>[]>(
    `SELECT id, shot_id, sort_order
     FROM ${IMAGE_TABLE}
     WHERE shot_id IN (${placeholders}) AND deleted_at IS NULL
     ORDER BY shot_id, sort_order, created_at, id`,
    shotIds
  )
  const existingByShot = new Map<string, Array<{ id: string; sort_order: number }>>()
  for (const row of existingRows) {
    const shotId = row.shot_id as string
    const list = existingByShot.get(shotId) ?? []
    list.push({ id: row.id as string, sort_order: Number(row.sort_order ?? 0) })
    existingByShot.set(shotId, list)
  }
  const sortCursorByShot = new Map<string, number>()
  for (const shotId of shotIds) {
    const current = existingByShot.get(shotId) ?? []
    const maxSort = current.reduce((max, img) => Math.max(max, img.sort_order), -1)
    sortCursorByShot.set(shotId, maxSort + 1)
  }

  await runInSerializedTransaction(async () => {
    const conn = await getDb()
    await conn.execute('BEGIN')
    try {
      const replacedShots = new Set<string>()
      for (const item of args.items) {
        if (item.conflict_policy === 'replace' && !replacedShots.has(item.shot_id)) {
          const existing = existingByShot.get(item.shot_id) ?? []
          if (existing.length > 0) {
            await conn.execute(
              `UPDATE ${IMAGE_TABLE}
               SET deleted_at = $1, updated_at = $2
               WHERE shot_id = $3 AND deleted_at IS NULL`,
              [ts, ts, item.shot_id]
            )
            for (const old of existing) {
              const stmt = outboxStatementForRow({
                entity: IMAGE_TABLE,
                entityId: old.id,
                operation: 'delete',
                payloadJson: null,
              })
              await conn.execute(stmt.sql, stmt.bindValues)
            }
          }
          sortCursorByShot.set(item.shot_id, 0)
          replacedShots.add(item.shot_id)
        }

        const sortOrder = sortCursorByShot.get(item.shot_id) ?? 0
        sortCursorByShot.set(item.shot_id, sortOrder + 1)
        const imageId = uuid()
        const mimeType = item.mime_type.trim().toLowerCase()
        await conn.execute(
          `INSERT INTO ${IMAGE_TABLE} (
             id, production_id, scene_id, shot_id, storage_key, original_filename, mime_type,
             width, height, sort_order, source_type, source_import_id, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            imageId,
            args.production_id,
            item.scene_id,
            item.shot_id,
            item.storage_key,
            item.original_filename,
            mimeType,
            item.width ?? null,
            item.height ?? null,
            sortOrder,
            'athena_pdf_import',
            args.source_import_id,
            ts,
            ts,
          ]
        )
        const outboxStmt = outboxStatementForRow({
          entity: IMAGE_TABLE,
          entityId: imageId,
          operation: 'create',
          payloadJson: JSON.stringify({
            id: imageId,
            production_id: args.production_id,
            scene_id: item.scene_id,
            shot_id: item.shot_id,
            storage_key: item.storage_key,
            original_filename: item.original_filename,
            mime_type: mimeType,
            width: item.width ?? null,
            height: item.height ?? null,
            sort_order: sortOrder,
            source_type: 'athena_pdf_import',
            source_import_id: args.source_import_id,
          }),
        })
        await conn.execute(outboxStmt.sql, outboxStmt.bindValues)
      }
      await conn.execute('COMMIT')
    } catch (error) {
      await conn.execute('ROLLBACK')
      throw error
    }
  })

  return { appliedCount: args.items.length }
}
