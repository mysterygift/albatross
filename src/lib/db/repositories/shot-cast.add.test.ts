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

vi.mock('@/lib/db/repositories/schedule', () => ({
  getShotById: vi.fn(async (id: string) =>
    id === 'shot-1' ? { id: 'shot-1', scene_id: 'scene-1', shot_number: '1' } : null
  ),
}))

import { setDbAdapterForTests } from '@/lib/db/client'
import { listSceneCastByScene } from '@/lib/db/repositories/scene-cast'
import { addShotCast, listShotCastByShotIds, removeShotCast } from '@/lib/db/repositories/shot-cast'

async function makeDbWithUniqueIndexes(): Promise<Database> {
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
    CREATE UNIQUE INDEX scene_cast_scene_person ON scene_cast(scene_id, person_id);
    CREATE TABLE shot_cast (
      id TEXT PRIMARY KEY,
      production_id TEXT NOT NULL,
      shot_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX shot_cast_shot_person ON shot_cast(shot_id, person_id);
    INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at)
      VALUES ('scene-1', 'prod-1', '1', '${ts}', '${ts}');
    INSERT INTO shots (id, scene_id, shot_number, created_at, updated_at)
      VALUES ('shot-1', 'scene-1', '1', '${ts}', '${ts}');
    INSERT INTO scene_cast (id, production_id, scene_id, person_id, created_at, updated_at)
      VALUES ('sc-1', 'prod-1', 'scene-1', 'person-1', '${ts}', '${ts}');
    INSERT INTO shot_cast (id, production_id, shot_id, person_id, created_at, updated_at)
      VALUES ('shotc-1', 'prod-1', 'shot-1', 'person-1', '${ts}', '${ts}');
  `)
  dbAdapter = createSqlJsTauriAdapter(db)
  setDbAdapterForTests(dbAdapter)
  return db
}

describe('addShotCast', () => {
  beforeEach(async () => {
    await makeDbWithUniqueIndexes()
  })

  it('re-adds cast after removeShotCast soft-deleted scene_cast and shot_cast', async () => {
    await removeShotCast('shotc-1')
    expect(await listSceneCastByScene('scene-1')).toEqual([])
    expect(await listShotCastByShotIds(['shot-1']).then((m) => m.get('shot-1') ?? [])).toEqual([])

    const restored = await addShotCast({
      production_id: 'prod-1',
      shot_id: 'shot-1',
      person_id: 'person-1',
    })

    expect(restored.shot_id).toBe('shot-1')
    expect(restored.person_id).toBe('person-1')
    expect(await listSceneCastByScene('scene-1')).toHaveLength(1)
    expect(await listShotCastByShotIds(['shot-1']).then((m) => m.get('shot-1') ?? [])).toHaveLength(1)
  })
})
