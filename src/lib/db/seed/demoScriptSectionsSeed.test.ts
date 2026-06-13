import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { IDS } from './constants'
import { DEMO_SCRIPT_VERSION_LABEL, seedDemoScriptSections } from './demoScriptSectionsSeed'
import { listScriptVersionsByProduction } from '@/lib/db/repositories/scriptVersions'
import { listSectionsByScriptVersion } from '@/lib/db/repositories/scriptSections'
import { listSidesExportsByShootDay } from '@/lib/db/repositories/sidesExports'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  mkdir: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
}))

vi.mock('@/lib/pdf/sides', () => ({
  buildSidesPdfData: vi.fn(() => ({})),
  generateSidesPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}))

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
        for (const s of statements) await db.execute(s.sql, s.bindValues)
      }
    ),
  }
})

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

async function seedMinimalMintHeistGraph(db: Database): Promise<void> {
  const ts = '2026-01-01T00:00:00Z'
  db.exec(`
    INSERT INTO productions (id, name, slug, created_at, updated_at)
    VALUES ('${IDS.production}', 'Mint Heist', 'demo-production-albatross', '${ts}', '${ts}');
    INSERT INTO units (id, production_id, name, created_at, updated_at)
    VALUES ('${IDS.unitMain}', '${IDS.production}', 'Main', '${ts}', '${ts}');
    INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at)
    VALUES ('${IDS.scene(1)}', '${IDS.production}', '1', '${ts}', '${ts}'),
           ('${IDS.scene(2)}', '${IDS.production}', '2', '${ts}', '${ts}'),
           ('${IDS.scene(3)}', '${IDS.production}', '3', '${ts}', '${ts}');
    INSERT INTO shots (id, scene_id, shot_number, created_at, updated_at)
    VALUES ('${IDS.shot(1)}', '${IDS.scene(1)}', '1', '${ts}', '${ts}'),
           ('${IDS.shot(7)}', '${IDS.scene(2)}', '1', '${ts}', '${ts}'),
           ('${IDS.shot(8)}', '${IDS.scene(2)}', '2', '${ts}', '${ts}');
    INSERT INTO shoot_days (id, production_id, shoot_date, created_at, updated_at)
    VALUES ('${IDS.shootDay(1)}', '${IDS.production}', '2026-06-01', '${ts}', '${ts}');
    INSERT INTO shoot_day_units (id, shoot_day_id, unit_id, created_at, updated_at)
    VALUES ('${IDS.shootDayUnit(1, 0)}', '${IDS.shootDay(1)}', '${IDS.unitMain}', '${ts}', '${ts}');
    INSERT INTO stripboard_strips (id, production_id, shoot_day_id, shoot_day_unit_id, strip_type, scene_id, shot_id, sort_index, strip_status, created_at, updated_at)
    VALUES ('${IDS.strip(1)}', '${IDS.production}', '${IDS.shootDay(1)}', '${IDS.shootDayUnit(1, 0)}', 'SHOT', '${IDS.scene(1)}', '${IDS.shot(1)}', 0, 'SCHEDULED', '${ts}', '${ts}');
  `)
}

describe('demoScriptSectionsSeed', () => {
  beforeEach(async () => {
    const SQL = await initSqlJs({})
    const db = new SQL.Database()
    applyAllMigrations(db)
    db.exec('PRAGMA foreign_keys = ON')
    await seedMinimalMintHeistGraph(db)
    dbAdapter = createSqlJsTauriAdapter(db)
  })

  it('seeds deterministic script version, sections, and sides export', async () => {
    await seedDemoScriptSections(IDS.production)
    const versions = await listScriptVersionsByProduction(IDS.production)
    expect(versions).toHaveLength(1)
    expect(versions[0]!.version_label).toBe(DEMO_SCRIPT_VERSION_LABEL)

    const sections = await listSectionsByScriptVersion(versions[0]!.id)
    expect(sections.length).toBeGreaterThanOrEqual(4)

    const exports = await listSidesExportsByShootDay(IDS.shootDay(1))
    expect(exports.length).toBe(1)
  })

  it('is idempotent on repeat seed', async () => {
    await seedDemoScriptSections(IDS.production)
    await seedDemoScriptSections(IDS.production)
    const versions = await listScriptVersionsByProduction(IDS.production)
    expect(versions).toHaveLength(1)
  })
})
