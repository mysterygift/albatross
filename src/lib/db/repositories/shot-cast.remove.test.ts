import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: vi.fn(async () => dbAdapter),
    runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
  }
})

vi.mock('@/lib/db/outbox', () => ({
  outboxPush: vi.fn(async () => undefined),
  outboxStatementForRow: (row: {
    entity: string
    entityId: string
    operation: string
    payloadJson: string | null
  }) => ({
    sql: 'SELECT 1',
    bindValues: [row.entity, row.entityId],
  }),
}))

import { setDbAdapterForTests } from '@/lib/db/client'
import { listSceneCastByScene } from '@/lib/db/repositories/scene-cast'
import {
  clearShotCastForScene,
  listShotCastByShotIds,
  removeShotCast,
} from '@/lib/db/repositories/shot-cast'

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  const ts = '2026-01-01T00:00:00.000Z'
  db.exec(`
    CREATE TABLE scenes (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      scene_number TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE shots (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL,
      shot_number TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE scene_cast (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      scene_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE shot_cast (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      shot_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at)
      VALUES ('scene-1', 'prod-1', '1', '${ts}', '${ts}');
    INSERT INTO shots (id, scene_id, shot_number, created_at, updated_at)
      VALUES ('shot-1', 'scene-1', '1', '${ts}', '${ts}'),
             ('shot-2', 'scene-1', '2', '${ts}', '${ts}');
    INSERT INTO scene_cast (id, production_id, scene_id, person_id, created_at, updated_at)
      VALUES ('sc-1', 'prod-1', 'scene-1', 'person-1', '${ts}', '${ts}');
    INSERT INTO shot_cast (id, production_id, shot_id, person_id, created_at, updated_at)
      VALUES ('shotc-1', 'prod-1', 'shot-1', 'person-1', '${ts}', '${ts}'),
             ('shotc-2', 'prod-1', 'shot-2', 'person-1', '${ts}', '${ts}');
  `)
  dbAdapter = createSqlJsTauriAdapter(db)
  setDbAdapterForTests(dbAdapter)
  return db
}

describe('removeShotCast', () => {
  beforeEach(async () => {
    await makeDb()
  })

  it('soft-deletes shot_cast but keeps scene_cast when person remains on another shot', async () => {
    await removeShotCast('shotc-1')

    const byShot = await listShotCastByShotIds(['shot-1', 'shot-2'])
    expect(byShot.get('shot-1') ?? []).toEqual([])
    expect(byShot.get('shot-2')).toHaveLength(1)

    const sceneCast = await listSceneCastByScene('scene-1')
    expect(sceneCast).toHaveLength(1)
    expect(sceneCast[0]?.person_id).toBe('person-1')
  })

  it('removes scene_cast when removing the only shot_cast in scene', async () => {
    const SQL = await initSqlJs({})
    const db = new SQL.Database()
    const ts = '2026-01-01T00:00:00.000Z'
    db.exec(`
      CREATE TABLE scenes (id TEXT PRIMARY KEY, production_id TEXT NOT NULL, scene_number TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE TABLE shots (id TEXT PRIMARY KEY, scene_id TEXT NOT NULL, shot_number TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE TABLE scene_cast (id TEXT PRIMARY KEY, production_id TEXT NOT NULL, scene_id TEXT NOT NULL, person_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE TABLE shot_cast (id TEXT PRIMARY KEY, production_id TEXT NOT NULL, shot_id TEXT NOT NULL, person_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      INSERT INTO scenes VALUES ('scene-1', 'prod-1', '1', '${ts}', '${ts}', NULL);
      INSERT INTO shots VALUES ('shot-1', 'scene-1', '1', '${ts}', '${ts}', NULL);
      INSERT INTO scene_cast VALUES ('sc-1', 'prod-1', 'scene-1', 'person-1', '${ts}', '${ts}', NULL);
      INSERT INTO shot_cast VALUES ('shotc-1', 'prod-1', 'shot-1', 'person-1', '${ts}', '${ts}', NULL);
    `)
    dbAdapter = createSqlJsTauriAdapter(db)
    setDbAdapterForTests(dbAdapter)

    await removeShotCast('shotc-1')

    expect(await listShotCastByShotIds(['shot-1']).then((m) => m.get('shot-1') ?? [])).toEqual([])
    expect(await listSceneCastByScene('scene-1')).toEqual([])
  })

  it('throws when shot_cast id is unknown', async () => {
    await expect(removeShotCast('missing')).rejects.toThrow(/not found/)
  })
})

describe('clearShotCastForScene', () => {
  beforeEach(async () => {
    await makeDb()
  })

  it('clears all shot_cast and scene_cast for the scene', async () => {
    await clearShotCastForScene('scene-1')

    expect(await listShotCastByShotIds(['shot-1', 'shot-2']).then((m) => [...m.values()].flat())).toEqual(
      []
    )
    expect(await listSceneCastByScene('scene-1')).toEqual([])
  })

  it('no-ops when scene has no cast rows', async () => {
    const SQL = await initSqlJs({})
    const db = new SQL.Database()
    const ts = '2026-01-01T00:00:00.000Z'
    db.exec(`
      CREATE TABLE scenes (id TEXT PRIMARY KEY, production_id TEXT NOT NULL, scene_number TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE TABLE shots (id TEXT PRIMARY KEY, scene_id TEXT NOT NULL, shot_number TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE TABLE scene_cast (id TEXT PRIMARY KEY, production_id TEXT NOT NULL, scene_id TEXT NOT NULL, person_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE TABLE shot_cast (id TEXT PRIMARY KEY, production_id TEXT NOT NULL, shot_id TEXT NOT NULL, person_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      INSERT INTO scenes VALUES ('scene-1', 'prod-1', '1', '${ts}', '${ts}', NULL);
      INSERT INTO shots VALUES ('shot-1', 'scene-1', '1', '${ts}', '${ts}', NULL);
    `)
    dbAdapter = createSqlJsTauriAdapter(db)
    setDbAdapterForTests(dbAdapter)

    await expect(clearShotCastForScene('scene-1')).resolves.toBeUndefined()
  })
})
