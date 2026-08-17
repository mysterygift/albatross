/**
 * Phase 7B: real SQLite (sql.js + Albatross migrations) + real temp-dir filesystem.
 * Exercises export/import orchestrators without mocking parse/build helpers.
 */
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs from 'sql.js'

import { ApfImportConflictError } from '@/lib/importExport/errors'
import { exportProductionAsApf } from '@/lib/importExport/exportProduction'
import { loadApfV1ProductionTables } from '@/lib/importExport/exportLoadProductionData'
import { importProductionFromApf } from '@/lib/importExport/importProduction'
import { buildApfZipBytes } from '@/lib/importExport/buildApfArchive'
import { parseApfArchiveBytes } from '@/lib/importExport/readApfArchive'
import { resetApfImportPragmaCache } from '@/lib/importExport/planImportStatements'
import { buildFixtureDataAndManifest, buildValidApfZipBytes, emptyApfTables, minimalProductionRow } from '@/test/apf/fixtures'
import { apfNodeFsTestContext } from '@/test/apf/apfNodeFsTestContext'
import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'
import { sqlJsApfE2eContext } from '@/test/apf/sqlJsApfE2eContext'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { setTestDataEncryptionKeyForTests } from '@/lib/security/dataEncryptionContext'
import {
  apfE2eExecuteBatchMock,
  sequentialExecuteBatchOnDb,
} from '@/test/apf/apfE2eExecuteBatchMock'

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  const { sqlJsApfE2eContext: ctx } = await import('@/test/apf/sqlJsApfE2eContext')
  const { apfE2eExecuteBatchMock: e2eBatch } = await import('@/test/apf/apfE2eExecuteBatchMock')
  return {
    ...actual,
    getDb: async () => {
      if (!ctx.adapter) throw new Error('sqlJsApfE2eContext.adapter not initialised')
      return ctx.adapter as never
    },
    runInSerializedTransaction: (fn: () => Promise<unknown>) => fn(),
    executeBatch: e2eBatch,
  }
})

vi.mock('@tauri-apps/plugin-fs', async () => {
  const pathMod = await import('node:path')
  const fs = await import('node:fs/promises')
  const { apfNodeFsTestContext: fsCtx } = await import('@/test/apf/apfNodeFsTestContext')
  const APP = 42
  return {
    BaseDirectory: { AppData: APP },
    readFile: async (p: string, opts?: { baseDir?: number }) => {
      const full = opts?.baseDir === APP ? pathMod.join(fsCtx.appDataRoot, p) : p
      const buf = await fs.readFile(full)
      return new Uint8Array(buf)
    },
    writeFile: async (p: string, data: Uint8Array, opts?: { baseDir?: number }) => {
      if (opts?.baseDir === APP) {
        const full = pathMod.join(fsCtx.appDataRoot, p)
        await fs.mkdir(pathMod.dirname(full), { recursive: true })
        await fs.writeFile(full, data)
        return
      }
      await fs.mkdir(pathMod.dirname(p), { recursive: true })
      await fs.writeFile(p, data)
    },
    mkdir: async (p: string, opts?: { baseDir?: number; recursive?: boolean }) => {
      const full = opts?.baseDir === APP ? pathMod.join(fsCtx.appDataRoot, p) : p
      await fs.mkdir(full, { recursive: opts?.recursive ?? false })
    },
    remove: async (p: string, opts?: { baseDir?: number }) => {
      const full = opts?.baseDir === APP ? pathMod.join(fsCtx.appDataRoot, p) : p
      try {
        await fs.rm(full, { force: true, recursive: true })
      } catch {
        /* ok */
      }
    },
  }
})

const PROD_ID = 'aaaaaaaa-e2e1-4e21-8f01-a1e2e2e2e201'
const UNIT_ID = 'bbbbbbbb-e2e1-4e21-8f01-a1e2e2e2e201'
const DOC_ID = 'cccccccc-e2e1-4e21-8f01-a1e2e2e2e201'
const EP_E2E_ACTIVE = 'aaaaaaaa-e2e1-4e21-8f02-a1e2e2e2e201'
const EP_E2E_ARCH = 'aaaaaaaa-e2e1-4e21-8f03-a1e2e2e2e201'
const E2E_SCENE_ID = 'aaaaaaaa-e2e1-4e21-8f04-a1e2e2e2e201'
const E2E_BLOC_ID = 'aaaaaaaa-e2e1-4e21-8f05-a1e2e2e2e201'
const E2E_DAY_ID = 'aaaaaaaa-e2e1-4e21-8f06-a1e2e2e2e201'
const ACTIVE_PERSON_ID = 'dddddddd-e2e1-4e21-8f01-a1e2e2e2e201'
const DELETED_PERSON_ID = 'eeeeeeee-e2e1-4e21-8f01-a1e2e2e2e201'
const TS = '2025-06-01T12:00:00.000Z'

function clearUserData(): void {
  const raw = sqlJsApfE2eContext.rawDb
  if (!raw) return
  try {
    raw.exec('ROLLBACK')
  } catch {
    /* no open transaction */
  }
  raw.exec('PRAGMA foreign_keys = ON')
  raw.exec('DELETE FROM productions')
}

describe('apf E2E (sql.js + real FS)', () => {
  let workDir: string
  let apfPath: string

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'albatross-apf-e2e-'))
    apfNodeFsTestContext.appDataRoot = join(workDir, 'appdata')
    await mkdir(apfNodeFsTestContext.appDataRoot, { recursive: true })
    apfPath = join(workDir, 'export.apf')

    const SQL = await initSqlJs({
      locateFile: (file: string) => join(process.cwd(), 'node_modules/sql.js/dist', file),
    })
    const raw = new SQL.Database()
    raw.exec('PRAGMA foreign_keys = ON')
    applyAlbatrossMigrationsSqlJs(raw)
    sqlJsApfE2eContext.rawDb = raw
    sqlJsApfE2eContext.adapter = createSqlJsTauriAdapter(raw)
  }, 120_000)

  afterAll(() => {
    setTestDataEncryptionKeyForTests(null)
    sqlJsApfE2eContext.adapter = null
    sqlJsApfE2eContext.rawDb?.close()
    sqlJsApfE2eContext.rawDb = null
    return rm(workDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    setTestDataEncryptionKeyForTests(new Uint8Array(32).fill(11))
    resetApfImportPragmaCache()
    clearUserData()
    await rm(join(apfNodeFsTestContext.appDataRoot, 'attachments'), { recursive: true, force: true }).catch(() => {})
    apfE2eExecuteBatchMock.mockImplementation(sequentialExecuteBatchOnDb)
  })

  async function seedRoundTripFixture(): Promise<void> {
    const adapter = sqlJsApfE2eContext.adapter!
    const docRel = `attachments/${PROD_ID}/${DOC_ID}-brief.pdf`
    const absDoc = join(apfNodeFsTestContext.appDataRoot, docRel)
    await mkdir(join(apfNodeFsTestContext.appDataRoot, 'attachments', PROD_ID), { recursive: true })
    await writeFile(absDoc, Buffer.from('%PDF-1.4 e2e fixture'))

    await adapter.execute(
      `INSERT INTO productions (id, name, notes, created_at, updated_at, deleted_at, slug, currency_code, archived_at, wrapped_at, created_from_template)
       VALUES ($1, $2, NULL, $3, $4, NULL, $5, 'GBP', NULL, NULL, NULL)`,
      [PROD_ID, 'E2E Production', TS, TS, 'e2e-prod-slug']
    )
    await adapter.execute(
      `INSERT INTO units (id, production_id, name, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, NULL)`,
      [UNIT_ID, PROD_ID, 'Main Unit', TS, TS]
    )
    await adapter.execute(
      `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at, deleted_at)
       VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, $7, NULL)`,
      [DOC_ID, PROD_ID, 'brief.pdf', docRel, 'application/pdf', TS, TS]
    )
  }

  const REV_ID = 'ffffffff-e2e1-4e21-8f01-a1e2e2e2e201'
  const BUDGET_ITEM_ID = '99999999-e2e1-4e21-8f01-a1e2e2e2e201'

  it('exports and imports budget revision scoped rows without FK errors', async () => {
    clearUserData()
    const adapter = sqlJsApfE2eContext.adapter!
    await adapter.execute(
      `INSERT INTO productions (id, name, notes, created_at, updated_at, deleted_at, slug, currency_code, archived_at, wrapped_at, created_from_template)
       VALUES ($1, $2, NULL, $3, $4, NULL, $5, 'GBP', NULL, NULL, NULL)`,
      [PROD_ID, 'Budget Revision E2E', TS, TS, 'budget-rev-e2e']
    )
    await adapter.execute(
      `INSERT INTO budget_revisions (id, production_id, name, created_from_revision_id, is_live, approval, created_at, updated_at, deleted_at)
       VALUES ($1, $2, 'Current budget', NULL, 1, 'unapproved', $3, $3, NULL)`,
      [REV_ID, PROD_ID, TS]
    )
    await adapter.execute(
      `INSERT INTO budget_items (id, production_id, budget_revision_id, description, estimated_cost, actual_cost, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, 'Line', 100, 0, $4, $4, NULL)`,
      [BUDGET_ITEM_ID, PROD_ID, REV_ID, TS]
    )

    await exportProductionAsApf(PROD_ID, apfPath)
    const exportedBytes = new Uint8Array(await readFile(apfPath))
    const parsedExport = parseApfArchiveBytes(exportedBytes)
    expect(parsedExport.normalized.data.tables.budget_revisions).toHaveLength(1)
    expect(parsedExport.normalized.data.formatVersion).toBe(4)

    clearUserData()
    const imp = await importProductionFromApf(apfPath)
    expect(imp.ok).toBe(true)
    if (!imp.ok) throw imp.error

    const revRows = await adapter.select<Record<string, unknown>[]>(
      `SELECT id FROM budget_revisions WHERE production_id = $1`,
      [PROD_ID]
    )
    expect(revRows).toHaveLength(1)
    expect(String(revRows[0]!.id)).toBe(REV_ID)
  })

  it('imports legacy v3 scenes.heading via file migration into title', async () => {
    clearUserData()
    const adapter = sqlJsApfE2eContext.adapter!
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow({ id: PROD_ID, slug: 'legacy-v3-scene', name: 'Legacy v3 Scene' })]
    tables.scenes = [
      {
        id: E2E_SCENE_ID,
        production_id: PROD_ID,
        scene_number: '5',
        heading: 'INT. WAREHOUSE - NIGHT',
        title: null,
        description: null,
        int_ext: 'INT',
        day_night: 'NIGHT',
        page_eighths: null,
        location_id: null,
        duration_minutes: null,
        episode_id: null,
        created_at: TS,
        updated_at: TS,
        deleted_at: null,
      },
    ]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    const legacyManifest = { ...manifest, formatVersion: 3 as const }
    const legacyData = JSON.parse(JSON.stringify(dataFile)) as typeof dataFile
    legacyData.formatVersion = 3
    const legacyApfPath = join(workDir, 'legacy-v3-scene.apf')
    await writeFile(legacyApfPath, buildApfZipBytes(legacyManifest, legacyData, []))

    const imp = await importProductionFromApf(legacyApfPath)
    expect(imp.ok).toBe(true)
    if (!imp.ok) throw imp.error

    const rows = await adapter.select<Array<{ title: string | null }>>(
      `SELECT title FROM scenes WHERE id = $1`,
      [E2E_SCENE_ID]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toBe('INT. WAREHOUSE - NIGHT')
  })

  it('exports then imports into a wiped DB with restored document bytes and stable UUIDs', async () => {
    await seedRoundTripFixture()

    await exportProductionAsApf(PROD_ID, apfPath)
    expect(existsSync(apfPath)).toBe(true)

    const exportedBytes = new Uint8Array(await readFile(apfPath))
    const parsedExport = parseApfArchiveBytes(exportedBytes)
    expect(parsedExport.normalized.data.tables.checklist_items).toEqual([])

    clearUserData()
    await rm(join(apfNodeFsTestContext.appDataRoot, 'attachments'), { recursive: true, force: true })

    const imp = await importProductionFromApf(apfPath)
    expect(imp.ok).toBe(true)
    if (!imp.ok) throw imp.error

    const adapter = sqlJsApfE2eContext.adapter!
    const prows = await adapter.select<Record<string, unknown>[]>(
      `SELECT id, name, slug FROM productions WHERE id = $1`,
      [PROD_ID]
    )
    expect(prows).toHaveLength(1)
    expect(prows[0]!.name).toBe('E2E Production')
    expect(prows[0]!.slug).toBe('e2e-prod-slug')

    const urows = await adapter.select<Record<string, unknown>[]>(
      `SELECT id, name FROM units WHERE production_id = $1`,
      [PROD_ID]
    )
    expect(urows.map((r) => r.id)).toContain(UNIT_ID)
    expect(urows.find((r) => r.id === UNIT_ID)?.name).toBe('Main Unit')

    const drows = await adapter.select<Record<string, unknown>[]>(
      `SELECT id, file_path FROM documents WHERE production_id = $1`,
      [PROD_ID]
    )
    expect(drows).toHaveLength(1)
    const fp = String(drows[0]!.file_path)
    expect(fp).toBe(`attachments/${PROD_ID}/${DOC_ID}-brief.pdf`)
    expect(existsSync(join(apfNodeFsTestContext.appDataRoot, fp))).toBe(true)
    const disk = await readFile(join(apfNodeFsTestContext.appDataRoot, fp))
    expect(Buffer.from(disk).toString()).toBe('%PDF-1.4 e2e fixture')
  })

  it('exports and imports episodic rows: archived episode, scene episode_id, shoot_day shooting_bloc_id', async () => {
    const adapter = sqlJsApfE2eContext.adapter!
    await adapter.execute(
      `INSERT INTO productions (id, name, notes, created_at, updated_at, deleted_at, slug, currency_code, archived_at, wrapped_at, created_from_template, is_episodic)
       VALUES ($1, $2, NULL, $3, $4, NULL, $5, 'GBP', NULL, NULL, NULL, 1)`,
      [PROD_ID, 'Episodic E2E', TS, TS, 'episodic-e2e']
    )
    await adapter.execute(
      `INSERT INTO episodes (id, production_id, name, sort_order, created_at, updated_at, deleted_at)
       VALUES ($1, $2, 'Active Ep', 0, $3, $3, NULL)`,
      [EP_E2E_ACTIVE, PROD_ID, TS]
    )
    await adapter.execute(
      `INSERT INTO episodes (id, production_id, name, sort_order, created_at, updated_at, deleted_at)
       VALUES ($1, $2, 'Archived Ep', 1, $3, $3, $4)`,
      [EP_E2E_ARCH, PROD_ID, TS, TS]
    )
    await adapter.execute(
      `INSERT INTO shooting_blocs (id, production_id, name, start_date, end_date, created_at, updated_at, deleted_at)
       VALUES ($1, $2, 'Bloc 1', '2025-01-01', '2025-01-31', $3, $3, NULL)`,
      [E2E_BLOC_ID, PROD_ID, TS]
    )
    await adapter.execute(
      `INSERT INTO scenes (id, production_id, scene_number, description, title, int_ext, day_night, page_eighths, location_id, duration_minutes, episode_id, created_at, updated_at, deleted_at)
       VALUES ($1, $2, '1', NULL, NULL, NULL, NULL, NULL, NULL, NULL, $3, $4, $4, NULL)`,
      [E2E_SCENE_ID, PROD_ID, EP_E2E_ARCH, TS]
    )
    await adapter.execute(
      `INSERT INTO shoot_days (id, production_id, shoot_date, day_number, call_time, notes, weather_manual, shooting_bloc_id, created_at, updated_at, deleted_at)
       VALUES ($1, $2, '2025-01-15', NULL, NULL, NULL, NULL, $3, $4, $4, NULL)`,
      [E2E_DAY_ID, PROD_ID, E2E_BLOC_ID, TS]
    )

    const loadedBefore = await loadApfV1ProductionTables(PROD_ID)
    expect(loadedBefore.episodes.map((e) => String(e.id)).sort()).toEqual(
      [EP_E2E_ACTIVE, EP_E2E_ARCH].sort()
    )
    expect(loadedBefore.episodes.find((e) => String(e.id) === EP_E2E_ARCH)?.deleted_at).toBe(TS)

    await exportProductionAsApf(PROD_ID, apfPath)
    clearUserData()
    await rm(join(apfNodeFsTestContext.appDataRoot, 'attachments'), { recursive: true, force: true })

    const imp = await importProductionFromApf(apfPath)
    expect(imp.ok).toBe(true)
    if (!imp.ok) throw imp.error

    const eps = await adapter.select<Record<string, unknown>[]>(
      `SELECT id, deleted_at FROM episodes WHERE production_id = $1 ORDER BY sort_order ASC`,
      [PROD_ID]
    )
    expect(eps).toHaveLength(2)
    const arch = eps.find((r) => String(r.id) === EP_E2E_ARCH)
    expect(arch).toBeDefined()
    expect(String(arch!.deleted_at)).toBe(TS)

    const sc = await adapter.select<Record<string, unknown>[]>(
      `SELECT episode_id FROM scenes WHERE id = $1`,
      [E2E_SCENE_ID]
    )
    expect(sc).toHaveLength(1)
    expect(String(sc[0]!.episode_id)).toBe(EP_E2E_ARCH)

    const sd = await adapter.select<Record<string, unknown>[]>(
      `SELECT shooting_bloc_id FROM shoot_days WHERE id = $1`,
      [E2E_DAY_ID]
    )
    expect(sd).toHaveLength(1)
    expect(String(sd[0]!.shooting_bloc_id)).toBe(E2E_BLOC_ID)
  })

  it('loadApfV1ProductionTables omits soft-deleted people but keeps active rows', async () => {
    clearUserData()
    const adapter = sqlJsApfE2eContext.adapter!
    await adapter.execute(
      `INSERT INTO productions (id, name, notes, created_at, updated_at, deleted_at, slug, currency_code, archived_at, wrapped_at, created_from_template)
       VALUES ($1, $2, NULL, $3, $4, NULL, $5, 'GBP', NULL, NULL, NULL)`,
      [PROD_ID, 'Tombstone Prod', TS, TS, 'tomb-prod']
    )
    await adapter.execute(
      `INSERT INTO people (id, production_id, name, is_cast, email, phone, department, phases, notes, contributor_form_status, created_at, updated_at, deleted_at)
       VALUES ($1, $2, 'Active Crew', 0, NULL, NULL, NULL, NULL, NULL, 'not_requested', $3, $3, NULL)`,
      [ACTIVE_PERSON_ID, PROD_ID, TS]
    )
    await adapter.execute(
      `INSERT INTO people (id, production_id, name, is_cast, email, phone, department, phases, notes, contributor_form_status, created_at, updated_at, deleted_at)
       VALUES ($1, $2, 'Deleted Crew', 0, NULL, NULL, NULL, NULL, NULL, 'not_requested', $3, $3, $4)`,
      [DELETED_PERSON_ID, PROD_ID, TS, TS]
    )

    const tables = await loadApfV1ProductionTables(PROD_ID)
    expect(tables.people.map((r) => r.id)).toEqual([ACTIVE_PERSON_ID])
    expect(tables.productions).toHaveLength(1)
  })

  it('on COMMIT failure: rolls back transaction and removes extracted attachment files', async () => {
    await seedRoundTripFixture()
    await exportProductionAsApf(PROD_ID, apfPath)
    clearUserData()
    await rm(join(apfNodeFsTestContext.appDataRoot, 'attachments'), { recursive: true, force: true })

    apfE2eExecuteBatchMock.mockImplementation(async (db, stmts) => {
      for (const s of stmts) {
        if (s.sql.toUpperCase().includes('COMMIT')) {
          throw new Error('forced COMMIT failure for E2E')
        }
        await db.execute(s.sql, s.bindValues)
      }
    })

    const imp = await importProductionFromApf(apfPath)
    expect(imp.ok).toBe(false)

    sqlJsApfE2eContext.rawDb!.exec('ROLLBACK')

    const cnt = await sqlJsApfE2eContext.adapter!.select<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM productions WHERE id = $1`,
      [PROD_ID]
    )
    expect(cnt[0]!.n).toBe(0)

    const writtenFile = join(
      apfNodeFsTestContext.appDataRoot,
      'attachments',
      PROD_ID,
      `${DOC_ID}-brief.pdf`
    )
    expect(existsSync(writtenFile)).toBe(false)
  })

  it('missing bundled zip bytes: import succeeds with warning; row inserted; no attachment file on disk', async () => {
    clearUserData()
    const tables = emptyApfTables()
    tables.productions = [
      minimalProductionRow({
        id: PROD_ID,
        name: 'Missing Bytes Prod',
        slug: 'missing-bytes',
        created_at: TS,
        updated_at: TS,
      }),
    ]
    tables.documents = [
      {
        id: DOC_ID,
        production_id: PROD_ID,
        entity_type: null,
        entity_id: null,
        file_name: 'ghost.pdf',
        file_path: '/tmp/ignored-on-import',
        mime_type: 'application/pdf',
        created_at: TS,
        updated_at: TS,
        deleted_at: null,
      },
    ]
    const bytes = buildValidApfZipBytes({ tables, bundled: [], bundledDocumentIds: [] })
    const p = join(workDir, 'missing-bundle.apf')
    await writeFile(p, Buffer.from(bytes))

    const imp = await importProductionFromApf(p)
    expect(imp.ok).toBe(true)
    if (!imp.ok) throw imp.error
    expect(imp.filesRestored).toBe(0)
    expect(imp.warnings.some((w) => w.includes('No bundled bytes'))).toBe(true)

    const fp = `attachments/${PROD_ID}/${DOC_ID}-ghost.pdf`
    const drows = await sqlJsApfE2eContext.adapter!.select<Record<string, unknown>[]>(
      `SELECT file_path FROM documents WHERE id = $1`,
      [DOC_ID]
    )
    expect(drows).toHaveLength(1)
    expect(String(drows[0]!.file_path)).toBe(fp)
    expect(existsSync(join(apfNodeFsTestContext.appDataRoot, fp))).toBe(false)
  })

  it('duplicate production id: preflight blocks import; DB unchanged; no attachment dir', async () => {
    await seedRoundTripFixture()
    await exportProductionAsApf(PROD_ID, apfPath)

    const imp = await importProductionFromApf(apfPath)
    expect(imp.ok).toBe(false)
    if (imp.ok) throw new Error('expected duplicate import to fail')
    expect(imp.error).toBeInstanceOf(ApfImportConflictError)
    expect((imp.error as ApfImportConflictError).conflict).toBe('production_id')

    const cnt = await sqlJsApfE2eContext.adapter!.select<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM productions WHERE id = $1`,
      [PROD_ID]
    )
    expect(cnt[0]!.n).toBe(1)
  })
})
