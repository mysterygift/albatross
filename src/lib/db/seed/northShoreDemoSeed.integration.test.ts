import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { sqlJsQueryExec } from '@/test/apf/sqlJsQueryExec'
import { DEMO_EPISODIC_SLUG, EPISODIC_DEMO_IDS } from '@/lib/db/seed/constants'
import {
  NORTH_SHORE_DEMO_PRODUCTION_NAME,
  NORTH_SHORE_LOCATION_COUNT,
  NORTH_SHORE_LOCATIONS,
  NORTH_SHORE_SCENE_COUNT,
  NORTH_SHORE_SCENES,
  NORTH_SHORE_SHOTS_PER_SCENE,
} from '@/lib/db/seed/northShoreDemoContent'
import { NORTH_SHORE_EPISODIC_CREW_MEMBER_COUNT } from '@/lib/db/seed/demoCrewSeed'
import { setTestDataEncryptionKeyForTests } from '@/lib/security/dataEncryptionContext'
import { listLocationsByProduction } from '@/lib/db/repositories/location'

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

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  mkdir: vi.fn(() => Promise.resolve()),
  remove: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
  writeTextFile: vi.fn(() => Promise.resolve()),
}))

import { resetDemoData, runEpisodicFullSeed } from '@/lib/db/seed/demoProductionSeed'
import { shootingBlocRangesOverlap } from '@/lib/db/repositories/shootingBlocs'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAllMigrations(db)
  dbAdapter = createSqlJsTauriAdapter(db)
  return db
}

function scalar(db: Database, sql: string): number {
  const r = sqlJsQueryExec(db, sql)
  const v = r[0]?.values[0]?.[0]
  return typeof v === 'number' ? v : Number(v ?? 0)
}

describe('North Shore episodic demo seed', () => {
  let db: Database

  beforeEach(async () => {
    setTestDataEncryptionKeyForTests(new Uint8Array(32).fill(10))
    vi.clearAllMocks()
    db = await makeDb()
  })
  afterEach(() => setTestDataEncryptionKeyForTests(null))

  it('seeds episodic production with structural constraints and non-overlapping blocs', async () => {
    await runEpisodicFullSeed()

    expect(scalar(db, `SELECT COUNT(*) FROM productions WHERE slug = '${DEMO_EPISODIC_SLUG}' AND deleted_at IS NULL`)).toBe(1)
    expect(scalar(db, `SELECT is_episodic FROM productions WHERE slug = '${DEMO_EPISODIC_SLUG}'`)).toBe(1)
    expect(
      scalar(
        db,
        `SELECT COUNT(*) FROM productions WHERE slug = '${DEMO_EPISODIC_SLUG}' AND name = '${NORTH_SHORE_DEMO_PRODUCTION_NAME.replace(/'/g, "''")}'`
      )
    ).toBe(1)

    const pid = EPISODIC_DEMO_IDS.production
    expect(scalar(db, `SELECT COUNT(*) FROM episodes WHERE production_id = '${pid}' AND deleted_at IS NULL`)).toBe(3)

    expect(scalar(db, `SELECT COUNT(*) FROM scenes WHERE production_id = '${pid}' AND deleted_at IS NULL`)).toBe(
      NORTH_SHORE_SCENE_COUNT
    )
    for (const epOffset of [0, 1, 2]) {
      const epId = EPISODIC_DEMO_IDS.episode(epOffset + 1)
      expect(
        scalar(db, `SELECT COUNT(*) FROM scenes WHERE production_id = '${pid}' AND episode_id = '${epId}' AND deleted_at IS NULL`)
      ).toBe(10)
    }

    expect(
      scalar(
        db,
        `SELECT COUNT(*) FROM shots sh JOIN scenes sc ON sc.id = sh.scene_id WHERE sc.production_id = '${pid}' AND sh.deleted_at IS NULL AND sc.deleted_at IS NULL`
      )
    ).toBe(NORTH_SHORE_SCENE_COUNT * NORTH_SHORE_SHOTS_PER_SCENE)

    for (const sid of sqlJsQueryExec(db, `SELECT id FROM scenes WHERE production_id = '${pid}' AND deleted_at IS NULL`)?.[0]?.values.flat() ?? []) {
      expect(
        scalar(
          db,
          `SELECT COUNT(*) FROM shots WHERE scene_id = '${sid}' AND deleted_at IS NULL`
        )
      ).toBe(NORTH_SHORE_SHOTS_PER_SCENE)
    }

    expect(scalar(db, `SELECT COUNT(*) FROM locations WHERE production_id = '${pid}' AND deleted_at IS NULL`)).toBe(
      NORTH_SHORE_LOCATION_COUNT
    )
    const locations = await listLocationsByProduction(pid)
    for (const expected of NORTH_SHORE_LOCATIONS) {
      const location = locations.find((candidate) => candidate.name === expected.name)
      expect(location?.address?.trim().length ?? 0).toBeGreaterThan(10)
    }

    expect(
      scalar(db, `SELECT COUNT(*) FROM people WHERE production_id = '${pid}' AND is_cast = 0 AND deleted_at IS NULL`)
    ).toBe(NORTH_SHORE_EPISODIC_CREW_MEMBER_COUNT)

    expect(
      scalar(db, `SELECT COUNT(*) FROM equipment WHERE production_id = '${pid}' AND deleted_at IS NULL`)
    ).toBeGreaterThan(50)

    const b1 = sqlJsQueryExec(
      db,
      `SELECT start_date, end_date FROM shooting_blocs WHERE production_id = '${pid}' AND deleted_at IS NULL ORDER BY start_date`
    )[0]
    expect(b1?.values.length).toBe(2)
    const r0 = b1?.values[0]?.map((x: unknown) => String(x)) ?? []
    const r1 = b1?.values[1]?.map((x: unknown) => String(x)) ?? []
    expect(shootingBlocRangesOverlap(r0[0]!, r0[1]!, r1[0]!, r1[1]!)).toBe(false)
    expect(r0[1]! < r1[0]!).toBe(true)

    for (const [idx, row] of NORTH_SHORE_SCENES.entries()) {
      const title = row.title.replace(/'/g, "''")
      expect(
        scalar(
          db,
          `SELECT COUNT(*) FROM scenes WHERE production_id = '${pid}' AND scene_number = '${idx + 1}' AND title = '${title}' AND deleted_at IS NULL`
        )
      ).toBeGreaterThanOrEqual(1)
    }

    expect(
      scalar(
        db,
        `SELECT COUNT(*) FROM locations WHERE production_id = '${pid}' AND deleted_at IS NULL AND (name LIKE 'INT.%' OR name LIKE 'EXT.%')`
      )
    ).toBe(0)

    expect(
      scalar(
        db,
        `SELECT COUNT(*) FROM (
          SELECT sc.id FROM scenes sc
          JOIN shots sh ON sh.scene_id = sc.id
          WHERE sc.production_id = '${pid}' AND sc.deleted_at IS NULL AND sh.deleted_at IS NULL
          GROUP BY sc.id
          HAVING COUNT(DISTINCT TRIM(COALESCE(sh.subject, ''))) < ${NORTH_SHORE_SHOTS_PER_SCENE}
        )`
      )
    ).toBe(0)

    const cameraOrTemplateJunk =
      /\b(slow push|dolly\b|handheld follow|whip pan|establish geography|over-shoulder proofing|lock wide for reset|insert on hands|profile cu)\b/i
    const shotCopy = sqlJsQueryExec(
      db,
      `SELECT sh.shot_description FROM shots sh
       JOIN scenes sc ON sc.id = sh.scene_id
       WHERE sc.production_id = '${pid}' AND sc.deleted_at IS NULL AND sh.deleted_at IS NULL`
    )[0]
    for (const row of shotCopy?.values ?? []) {
      for (const cell of row) {
        if (typeof cell === 'string' && cell.length > 0) {
          expect(cell).not.toMatch(cameraOrTemplateJunk)
        }
      }
    }
  })

  it('after resetDemoData (Mint then episodic), North Shore has budget items and a live revision', async () => {
    await resetDemoData()
    const pid = EPISODIC_DEMO_IDS.production
    expect(scalar(db, `SELECT COUNT(*) FROM budget_items WHERE production_id = '${pid}'`)).toBeGreaterThan(0)
    expect(
      scalar(db, `SELECT COUNT(*) FROM budget_revisions WHERE production_id = '${pid}' AND deleted_at IS NULL`)
    ).toBeGreaterThanOrEqual(1)
    expect(
      scalar(
        db,
        `SELECT COUNT(*) FROM budget_items WHERE production_id = '${pid}' AND budget_revision_id IS NULL`
      )
    ).toBe(0)
  })
})
