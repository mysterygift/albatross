/**
 * Shot-level cast participation. Refinement layer on top of scene_cast.
 * scene_cast remains the scene-level source of truth; DooD still uses scene_cast only.
 * When adding a person to a shot, we ensure they are also on the parent scene (auto-add scene_cast if needed).
 */

import { getDb, now, uuid, runInSerializedTransaction, executeBatch } from '../client'
import type { DatabaseAdapter } from '../databaseAdapter'
import { outboxPush, outboxStatementForRow } from '../outbox'
import type { ShotCast } from '../types'
import { getShotById } from './schedule'

const TABLE = 'shot_cast'
const SCENE_CAST_TABLE = 'scene_cast'

function rowToShotCast(r: Record<string, unknown>): ShotCast {
  return {
    id: r.id as string,
    production_id: r.production_id as string,
    shot_id: r.shot_id as string,
    person_id: r.person_id as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    deleted_at: r.deleted_at as string | null,
  }
}

export async function listShotCastByShot(shotId: string): Promise<ShotCast[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shot_id = $1 AND deleted_at IS NULL ORDER BY person_id`,
    [shotId]
  )
  return rows.map(rowToShotCast)
}

export async function listShotCastByPerson(personId: string): Promise<ShotCast[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE person_id = $1 AND deleted_at IS NULL ORDER BY shot_id`,
    [personId]
  )
  return rows.map(rowToShotCast)
}

/** Shot_cast rows for this person in the given production (for Person detail shot participation). */
export async function listShotCastByPersonInProduction(
  productionId: string,
  personId: string
): Promise<ShotCast[]> {
  const db = await getDb()
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE production_id = $1 AND person_id = $2 AND deleted_at IS NULL ORDER BY shot_id`,
    [productionId, personId]
  )
  return rows.map(rowToShotCast)
}

/** Shot ids this person is attached to (within any production). For production-scoped use, use listShotCastByPersonInProduction. */
export async function listShotIdsByPerson(personId: string): Promise<string[]> {
  const list = await listShotCastByPerson(personId)
  return list.map((sc) => sc.shot_id)
}

/** Batch: shot_id -> person_id[]. For use in DooD/scheduling (shot_cast is not yet consumed by DooD). */
export async function getCastIdsByShotIds(shotIds: string[]): Promise<Map<string, string[]>> {
  if (shotIds.length === 0) return new Map()
  const db = await getDb()
  const placeholders = shotIds.map((_, i) => `$${i + 1}`).join(',')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT shot_id, person_id FROM ${TABLE} WHERE shot_id IN (${placeholders}) AND deleted_at IS NULL`,
    shotIds
  )
  const map = new Map<string, string[]>()
  for (const r of rows) {
    const sid = r.shot_id as string
    const pid = r.person_id as string
    const arr = map.get(sid) ?? []
    if (!arr.includes(pid)) arr.push(pid)
    map.set(sid, arr)
  }
  return map
}

/** Batch: shot_id -> ShotCast[]. For shot list UI (per-shot cast with ids for remove). */
export async function listShotCastByShotIds(shotIds: string[]): Promise<Map<string, ShotCast[]>> {
  if (shotIds.length === 0) return new Map()
  const db = await getDb()
  const placeholders = shotIds.map((_, i) => `$${i + 1}`).join(',')
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shot_id IN (${placeholders}) AND deleted_at IS NULL ORDER BY shot_id, person_id`,
    shotIds
  )
  const map = new Map<string, ShotCast[]>()
  for (const r of rows) {
    const sc = rowToShotCast(r)
    const arr = map.get(sc.shot_id) ?? []
    arr.push(sc)
    map.set(sc.shot_id, arr)
  }
  return map
}

async function findSceneCastLink(
  db: DatabaseAdapter,
  sceneId: string,
  personId: string
): Promise<{ id: string; deleted_at: string | null } | null> {
  const rows = await db.select<Array<{ id: string; deleted_at: string | null }>>(
    `SELECT id, deleted_at FROM ${SCENE_CAST_TABLE} WHERE scene_id = $1 AND person_id = $2 LIMIT 1`,
    [sceneId, personId]
  )
  return rows[0] ?? null
}

/**
 * Add a cast member to a shot. Ensures scene_cast exists for the shot's scene (auto-adds if missing).
 * Restores soft-deleted scene_cast / shot_cast rows when the unique (scene_id, person_id) / (shot_id, person_id)
 * index would otherwise block a new insert.
 */
export async function addShotCast(data: {
  production_id: string
  shot_id: string
  person_id: string
}): Promise<ShotCast> {
  const db = await getDb()
  const existingShotCast = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shot_id = $1 AND person_id = $2 AND deleted_at IS NULL`,
    [data.shot_id, data.person_id]
  )
  if (existingShotCast.length > 0) return rowToShotCast(existingShotCast[0]!)

  const shot = await getShotById(data.shot_id)
  if (!shot) throw new Error('Shot not found')

  const softDeletedShotCast = await db.select<Array<{ id: string }>>(
    `SELECT id FROM ${TABLE} WHERE shot_id = $1 AND person_id = $2 AND deleted_at IS NOT NULL LIMIT 1`,
    [data.shot_id, data.person_id]
  )
  if (softDeletedShotCast.length > 0) {
    const shotCastId = softDeletedShotCast[0]!.id
    const ts = now()
    const sceneLink = await findSceneCastLink(db, shot.scene_id, data.person_id)
    await runInSerializedTransaction(async () => {
      const conn = await getDb()
      const batch: Array<{ sql: string; bindValues: unknown[] }> = [
        { sql: 'BEGIN TRANSACTION', bindValues: [] },
        {
          sql: `UPDATE ${TABLE} SET deleted_at = NULL, updated_at = $1 WHERE id = $2`,
          bindValues: [ts, shotCastId],
        },
        outboxStatementForRow({
          entity: TABLE,
          entityId: shotCastId,
          operation: 'update',
          payloadJson: JSON.stringify({ deleted_at: null, updated_at: ts }),
        }),
      ]
      if (sceneLink?.deleted_at != null) {
        batch.push({
          sql: `UPDATE ${SCENE_CAST_TABLE} SET deleted_at = NULL, updated_at = $1 WHERE id = $2`,
          bindValues: [ts, sceneLink.id],
        })
        batch.push(
          outboxStatementForRow({
            entity: SCENE_CAST_TABLE,
            entityId: sceneLink.id,
            operation: 'update',
            payloadJson: JSON.stringify({ deleted_at: null, updated_at: ts }),
          })
        )
      }
      batch.push({ sql: 'COMMIT', bindValues: [] })
      await executeBatch(conn, batch)
    })
  } else {
    const sceneLink = await findSceneCastLink(db, shot.scene_id, data.person_id)

    if (!sceneLink) {
      await runInSerializedTransaction(async () => {
        const conn = await getDb()
        const idScene = uuid()
        const idShot = uuid()
        const ts = now()
        const outboxScene = outboxStatementForRow({
          entity: SCENE_CAST_TABLE,
          entityId: idScene,
          operation: 'create',
          payloadJson: JSON.stringify({
            id: idScene,
            production_id: data.production_id,
            scene_id: shot.scene_id,
            person_id: data.person_id,
          }),
        })
        const outboxShot = outboxStatementForRow({
          entity: TABLE,
          entityId: idShot,
          operation: 'create',
          payloadJson: JSON.stringify({ id: idShot, ...data }),
        })
        const batch: Array<{ sql: string; bindValues: unknown[] }> = [
          { sql: 'BEGIN TRANSACTION', bindValues: [] },
          {
            sql: `INSERT INTO ${SCENE_CAST_TABLE} (id, production_id, scene_id, person_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
            bindValues: [idScene, data.production_id, shot.scene_id, data.person_id, ts, ts],
          },
          {
            sql: `INSERT INTO ${TABLE} (id, production_id, shot_id, person_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
            bindValues: [idShot, data.production_id, data.shot_id, data.person_id, ts, ts],
          },
          outboxScene,
          outboxShot,
          { sql: 'COMMIT', bindValues: [] },
        ]
        await executeBatch(conn, batch)
      })
    } else if (sceneLink.deleted_at != null) {
      await runInSerializedTransaction(async () => {
        const conn = await getDb()
        const idShot = uuid()
        const ts = now()
        const outboxScene = outboxStatementForRow({
          entity: SCENE_CAST_TABLE,
          entityId: sceneLink.id,
          operation: 'update',
          payloadJson: JSON.stringify({ deleted_at: null, updated_at: ts }),
        })
        const outboxShot = outboxStatementForRow({
          entity: TABLE,
          entityId: idShot,
          operation: 'create',
          payloadJson: JSON.stringify({ id: idShot, ...data }),
        })
        const batch: Array<{ sql: string; bindValues: unknown[] }> = [
          { sql: 'BEGIN TRANSACTION', bindValues: [] },
          {
            sql: `UPDATE ${SCENE_CAST_TABLE} SET deleted_at = NULL, updated_at = $1 WHERE id = $2`,
            bindValues: [ts, sceneLink.id],
          },
          {
            sql: `INSERT INTO ${TABLE} (id, production_id, shot_id, person_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
            bindValues: [idShot, data.production_id, data.shot_id, data.person_id, ts, ts],
          },
          outboxScene,
          outboxShot,
          { sql: 'COMMIT', bindValues: [] },
        ]
        await executeBatch(conn, batch)
      })
    } else {
      const id = uuid()
      const ts = now()
      await db.execute(
        `INSERT INTO ${TABLE} (id, production_id, shot_id, person_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, data.production_id, data.shot_id, data.person_id, ts, ts]
      )
      await outboxPush(TABLE, id, 'create', JSON.stringify({ ...data, id }))
    }
  }

  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${TABLE} WHERE shot_id = $1 AND person_id = $2 AND deleted_at IS NULL`,
    [data.shot_id, data.person_id]
  )
  return rowToShotCast(rows[0]!)
}

/**
 * Soft-delete shot_cast by id. When the person has no other shot_cast rows in the
 * parent scene, also soft-delete their scene_cast row (scene panel stays in sync).
 */
export async function removeShotCast(id: string, db?: DatabaseAdapter): Promise<void> {
  const conn = db ?? (await getDb())
  const linkRows = await conn.select<
    Array<{ shot_id: string; person_id: string; scene_id: string }>
  >(
    `SELECT sc.shot_id, sc.person_id, s.scene_id
     FROM ${TABLE} sc
     INNER JOIN shots s ON s.id = sc.shot_id AND s.deleted_at IS NULL
     WHERE sc.id = $1 AND sc.deleted_at IS NULL`,
    [id]
  )
  if (linkRows.length === 0) {
    throw new Error('Shot cast not found or already removed')
  }
  const { person_id: personId, scene_id: sceneId } = linkRows[0]!
  const ts = now()

  await runInSerializedTransaction(async () => {
    const batchDb = db ?? (await getDb())
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [
      { sql: 'BEGIN', bindValues: [] },
      {
        sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
        bindValues: [ts, ts, id],
      },
      outboxStatementForRow({
        entity: TABLE,
        entityId: id,
        operation: 'delete',
        payloadJson: null,
      }),
    ]

    const remaining = await batchDb.select<Array<{ n: number }>>(
      `SELECT COUNT(*) AS n FROM ${TABLE} sc
       INNER JOIN shots s ON s.id = sc.shot_id AND s.deleted_at IS NULL
       WHERE sc.person_id = $1 AND s.scene_id = $2 AND sc.deleted_at IS NULL AND sc.id != $3`,
      [personId, sceneId, id]
    )
    const otherShotCastInScene = Number(remaining[0]?.n ?? 0)
    if (otherShotCastInScene === 0) {
      const sceneCastRows = await batchDb.select<Array<{ id: string }>>(
        `SELECT id FROM ${SCENE_CAST_TABLE} WHERE scene_id = $1 AND person_id = $2 AND deleted_at IS NULL`,
        [sceneId, personId]
      )
      for (const row of sceneCastRows) {
        const sceneCastId = row.id
        statements.push({
          sql: `UPDATE ${SCENE_CAST_TABLE} SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`,
          bindValues: [ts, ts, sceneCastId],
        })
        statements.push(
          outboxStatementForRow({
            entity: SCENE_CAST_TABLE,
            entityId: sceneCastId,
            operation: 'delete',
            payloadJson: null,
          })
        )
      }
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(batchDb, statements)
  })
}

/**
 * Soft-delete all shot_cast rows for shots in the scene, then all scene_cast for the scene
 * (keeps DooD / scene participation aligned when cast is shot-derived).
 */
export async function clearShotCastForScene(sceneId: string, db?: DatabaseAdapter): Promise<void> {
  const conn = db ?? (await getDb())
  const shotCastRows = await conn.select<Array<{ id: string }>>(
    `SELECT sc.id FROM ${TABLE} sc
     INNER JOIN shots s ON s.id = sc.shot_id AND s.deleted_at IS NULL
     WHERE s.scene_id = $1 AND sc.deleted_at IS NULL`,
    [sceneId]
  )
  const sceneCastRows = await conn.select<Array<{ id: string }>>(
    `SELECT id FROM ${SCENE_CAST_TABLE} WHERE scene_id = $1 AND deleted_at IS NULL`,
    [sceneId]
  )
  if (shotCastRows.length === 0 && sceneCastRows.length === 0) return

  const ts = now()
  await runInSerializedTransaction(async () => {
    const batchDb = db ?? (await getDb())
    const statements: Array<{ sql: string; bindValues: unknown[] }> = [{ sql: 'BEGIN', bindValues: [] }]

    if (shotCastRows.length > 0) {
      statements.push({
        sql: `UPDATE ${TABLE} SET deleted_at = $1, updated_at = $2
         WHERE shot_id IN (SELECT id FROM shots WHERE scene_id = $3 AND deleted_at IS NULL)
         AND deleted_at IS NULL`,
        bindValues: [ts, ts, sceneId],
      })
      for (const row of shotCastRows) {
        statements.push(
          outboxStatementForRow({
            entity: TABLE,
            entityId: row.id,
            operation: 'delete',
            payloadJson: null,
          })
        )
      }
    }

    if (sceneCastRows.length > 0) {
      statements.push({
        sql: `UPDATE ${SCENE_CAST_TABLE} SET deleted_at = $1, updated_at = $2 WHERE scene_id = $3 AND deleted_at IS NULL`,
        bindValues: [ts, ts, sceneId],
      })
      for (const row of sceneCastRows) {
        statements.push(
          outboxStatementForRow({
            entity: SCENE_CAST_TABLE,
            entityId: row.id,
            operation: 'delete',
            payloadJson: null,
          })
        )
      }
    }

    statements.push({ sql: 'COMMIT', bindValues: [] })
    await executeBatch(batchDb, statements)
  })
}
