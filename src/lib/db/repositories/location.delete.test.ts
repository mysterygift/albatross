import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: vi.fn(async () => dbAdapter),
    runInSerializedTransaction: async (fn: () => Promise<unknown>) => fn(),
    executeBatch: vi.fn(
      async (
        db: { execute: (sql: string, bindValues?: unknown[]) => Promise<void> },
        statements: Array<{ sql: string; bindValues: unknown[] }>
      ) => {
        let open = false
        try {
          for (const s of statements) {
            const upper = s.sql.trim().toUpperCase()
            if (upper.startsWith('BEGIN')) open = true
            await db.execute(s.sql, s.bindValues)
            if (upper.startsWith('COMMIT') || upper.startsWith('ROLLBACK')) open = false
          }
        } catch (e) {
          if (open) {
            try {
              await db.execute('ROLLBACK', [])
            } catch {
              /* ignore */
            }
          }
          throw e
        }
      }
    ),
  }
})

import { deleteLocation } from '@/lib/db/repositories/location'

const PRODUCTION_ID = 'prod-loc-1'
const TS = '2026-06-16T12:00:00.000Z'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

async function makeDb(): Promise<void> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAllMigrations(db)
  dbAdapter = createSqlJsTauriAdapter(db)
}

async function one<T = Record<string, unknown>>(sql: string, binds: unknown[] = []): Promise<T> {
  const rows = await dbAdapter.select<T[]>(sql, binds)
  return rows[0]!
}

async function seed(): Promise<void> {
  await dbAdapter.execute(
    `INSERT INTO productions (id, name, created_at, updated_at) VALUES ($1, 'Test', $2, $2)`,
    [PRODUCTION_ID, TS]
  )
  for (const id of ['loc-a', 'loc-b']) {
    await dbAdapter.execute(
      `INSERT INTO locations (id, production_id, name, created_at, updated_at) VALUES ($1, $2, $1, $3, $3)`,
      [id, PRODUCTION_ID, TS]
    )
  }
  for (const [id, loc] of [
    ['scene-a', 'loc-a'],
    ['scene-b', 'loc-b'],
  ]) {
    await dbAdapter.execute(
      `INSERT INTO scenes (id, production_id, scene_number, location_id, created_at, updated_at) VALUES ($1, $2, $1, $3, $4, $4)`,
      [id, PRODUCTION_ID, loc, TS]
    )
  }
  const strips: [string, string | null, string | null][] = [
    ['strip-origin', 'loc-a', null],
    ['strip-dest', null, 'loc-a'],
    ['strip-both', 'loc-a', 'loc-b'],
    ['strip-other', 'loc-b', 'loc-b'],
  ]
  for (const [id, origin, dest] of strips) {
    await dbAdapter.execute(
      `INSERT INTO stripboard_strips (id, production_id, strip_type, title, sort_index, origin_location_id, destination_location_id, created_at, updated_at)
       VALUES ($1, $2, 'MOVE', $1, 0, $3, $4, $5, $5)`,
      [id, PRODUCTION_ID, origin, dest, TS]
    )
  }
  await dbAdapter.execute(
    `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, created_at, updated_at)
     VALUES ('doc-1', $1, 'permit', 'loc-a', 'p.pdf', 'p.pdf', $2, $2)`,
    [PRODUCTION_ID, TS]
  )
}

describe('deleteLocation', () => {
  beforeEach(async () => {
    await makeDb()
    await seed()
  })

  it('soft-deletes the location and its documents', async () => {
    await deleteLocation('loc-a')
    expect((await one<{ deleted_at: string | null }>(`SELECT deleted_at FROM locations WHERE id = 'loc-a'`)).deleted_at).not.toBeNull()
    expect((await one<{ deleted_at: string | null }>(`SELECT deleted_at FROM locations WHERE id = 'loc-b'`)).deleted_at).toBeNull()
    expect((await one<{ deleted_at: string | null }>(`SELECT deleted_at FROM documents WHERE id = 'doc-1'`)).deleted_at).not.toBeNull()
  })

  it('clears scene and strip references to the deleted location only', async () => {
    await deleteLocation('loc-a')
    expect((await one<{ location_id: string | null }>(`SELECT location_id FROM scenes WHERE id = 'scene-a'`)).location_id).toBeNull()
    expect((await one<{ location_id: string | null }>(`SELECT location_id FROM scenes WHERE id = 'scene-b'`)).location_id).toBe('loc-b')

    const strip = (id: string) =>
      one<{ origin_location_id: string | null; destination_location_id: string | null }>(
        `SELECT origin_location_id, destination_location_id FROM stripboard_strips WHERE id = $1`,
        [id]
      )
    expect(await strip('strip-origin')).toEqual({ origin_location_id: null, destination_location_id: null })
    expect(await strip('strip-dest')).toEqual({ origin_location_id: null, destination_location_id: null })
    expect(await strip('strip-both')).toEqual({ origin_location_id: null, destination_location_id: 'loc-b' })
    expect(await strip('strip-other')).toEqual({ origin_location_id: 'loc-b', destination_location_id: 'loc-b' })
  })

  it('writes outbox rows for the location and every cleared reference', async () => {
    await deleteLocation('loc-a')
    const rows = await dbAdapter.select<{ entity: string; entity_id: string; operation: string }[]>(
      `SELECT entity, entity_id, operation FROM outbox ORDER BY entity, entity_id`
    )
    const keys = rows.map((r) => `${r.entity}:${r.entity_id}:${r.operation}`)
    expect(keys).toContain('locations:loc-a:delete')
    expect(keys).toContain('scenes:scene-a:update')
    expect(keys).toContain('stripboard_strips:strip-origin:update')
    expect(keys).toContain('stripboard_strips:strip-dest:update')
    expect(keys).toContain('stripboard_strips:strip-both:update')
    expect(keys).not.toContain('scenes:scene-b:update')
    expect(keys).not.toContain('stripboard_strips:strip-other:update')
  })

  it('works for a location nothing references', async () => {
    await dbAdapter.execute(
      `INSERT INTO locations (id, production_id, name, created_at, updated_at) VALUES ('loc-c', $1, 'C', $2, $2)`,
      [PRODUCTION_ID, TS]
    )
    await deleteLocation('loc-c')
    expect((await one<{ deleted_at: string | null }>(`SELECT deleted_at FROM locations WHERE id = 'loc-c'`)).deleted_at).not.toBeNull()
  })
})
