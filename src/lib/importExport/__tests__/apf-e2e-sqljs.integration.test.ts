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

import { CURRENT_APF_FORMAT_VERSION } from '@/lib/importExport/constants'
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
    expect(parsedExport.normalized.data.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)

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

  it('round-trips risk assessments, units, hazards and hazard templates', async () => {
    clearUserData()
    const adapter = sqlJsApfE2eContext.adapter!
    const DAY = 'aaaaaaaa-e2e1-4e21-8f06-a1e2e2e2e2a1'
    const SDU = 'aaaaaaaa-e2e1-4e21-8f07-a1e2e2e2e2a1'
    const RA = 'aaaaaaaa-e2e1-4e21-8f08-a1e2e2e2e2a1'
    const RA_NODOC = 'aaaaaaaa-e2e1-4e21-8f08-a1e2e2e2e2a2'
    const HZ = 'aaaaaaaa-e2e1-4e21-8f09-a1e2e2e2e2a1'
    const TPL = 'aaaaaaaa-e2e1-4e21-8f0a-a1e2e2e2e2a1'
    const PDF = 'aaaaaaaa-e2e1-4e21-8f0b-a1e2e2e2e2a1'
    const GONE_PDF = 'aaaaaaaa-e2e1-4e21-8f0b-a1e2e2e2e2a2'
    const docRel = `attachments/${PROD_ID}/${PDF}-rams.pdf`
    await mkdir(join(apfNodeFsTestContext.appDataRoot, 'attachments', PROD_ID), { recursive: true })
    await writeFile(join(apfNodeFsTestContext.appDataRoot, docRel), Buffer.from('%PDF-1.4 rams'))

    await adapter.execute(
      `INSERT INTO productions (id, name, notes, created_at, updated_at, deleted_at, slug, currency_code, archived_at, wrapped_at, created_from_template)
       VALUES ($1, 'RAMS E2E', NULL, $2, $2, NULL, 'rams-e2e', 'GBP', NULL, NULL, NULL)`,
      [PROD_ID, TS]
    )
    await adapter.execute(`INSERT INTO units (id, production_id, name, created_at, updated_at) VALUES ($1, $2, 'Main Unit', $3, $3)`, [UNIT_ID, PROD_ID, TS])
    await adapter.execute(
      `INSERT INTO shoot_days (id, production_id, shoot_date, created_at, updated_at) VALUES ($1, $2, '2025-02-01', $3, $3)`,
      [DAY, PROD_ID, TS]
    )
    await adapter.execute(
      `INSERT INTO shoot_day_units (id, shoot_day_id, unit_id, is_locked, created_at, updated_at) VALUES ($1, $2, $3, 0, $4, $4)`,
      [SDU, DAY, UNIT_ID, TS]
    )
    await adapter.execute(
      `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at, deleted_at)
       VALUES ($1, $2, 'risk_assessment', $3, 'rams.pdf', $4, 'application/pdf', $5, $5, NULL)`,
      [PDF, PROD_ID, DAY, docRel, TS]
    )
    await adapter.execute(
      `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at, deleted_at)
       VALUES ($1, $2, 'risk_assessment', $3, 'gone.pdf', 'attachments/gone.pdf', 'application/pdf', $4, $4, $4)`,
      [GONE_PDF, PROD_ID, DAY, TS]
    )
    for (const [id, doc] of [[RA, PDF], [RA_NODOC, GONE_PDF]] as const) {
      await adapter.execute(
        `INSERT INTO risk_assessments (id, production_id, shoot_day_id, location_name, activities, responsible_person_name, first_aiders_json, status, approved_by, approved_at, generated_document_id, created_at, updated_at)
         VALUES ($1, $2, $3, 'Quarry', 'Rigging', 'Sam', '[{"name":"Ann","phone":"1","email":""}]', 'approved', 'Boss', $4, $5, $4, $4)`,
        [id, PROD_ID, DAY, TS, doc]
      )
    }
    await adapter.execute(
      `INSERT INTO risk_assessment_units (id, risk_assessment_id, shoot_day_unit_id, created_at, updated_at) VALUES ('ru-1', $1, $2, $3, $3)`,
      [RA, SDU, TS]
    )
    await adapter.execute(
      `INSERT INTO risk_assessment_hazards (id, risk_assessment_id, sort_order, name, severity_before, probability_before, severity_after, probability_after, created_at, updated_at)
       VALUES ($1, $2, 0, 'Manual Handling', 4, 3, 2, 2, $3, $3)`,
      [HZ, RA, TS]
    )
    await adapter.execute(
      `INSERT INTO hazard_templates (id, production_id, name, created_at, updated_at) VALUES ($1, $2, 'Saved', $3, $3)`,
      [TPL, PROD_ID, TS]
    )

    await exportProductionAsApf(PROD_ID, apfPath)
    const exported = parseApfArchiveBytes(new Uint8Array(await readFile(apfPath))).normalized.data.tables
    expect(exported.risk_assessments).toHaveLength(2)
    expect(exported.risk_assessment_units).toHaveLength(1)
    expect(exported.risk_assessment_hazards).toHaveLength(1)
    expect(exported.hazard_templates).toHaveLength(1)
    // A link to a document that is not part of the export is cleared so import FKs hold.
    const byId = new Map(exported.risk_assessments.map((r) => [String(r.id), r]))
    expect(byId.get(RA)!.generated_document_id).toBe(PDF)
    expect(byId.get(RA_NODOC)!.generated_document_id).toBeNull()

    clearUserData()
    const imp = await importProductionFromApf(apfPath)
    expect(imp.ok).toBe(true)
    if (!imp.ok) throw imp.error

    const ras = await adapter.select<Record<string, unknown>[]>(
      `SELECT id, status, approved_by, generated_document_id FROM risk_assessments WHERE production_id = $1 ORDER BY id`,
      [PROD_ID]
    )
    expect(ras.map((r) => String(r.id))).toEqual([RA, RA_NODOC])
    expect(ras[0]).toMatchObject({ status: 'approved', approved_by: 'Boss', generated_document_id: PDF })
    expect(ras[1]!.generated_document_id).toBeNull()
    const hz = await adapter.select<Record<string, unknown>[]>(`SELECT name, severity_before, probability_after FROM risk_assessment_hazards WHERE risk_assessment_id = $1`, [RA])
    expect(hz).toEqual([{ name: 'Manual Handling', severity_before: 4, probability_after: 2 }])
    const links = await adapter.select<Record<string, unknown>[]>(`SELECT shoot_day_unit_id FROM risk_assessment_units WHERE risk_assessment_id = $1`, [RA])
    expect(links).toEqual([{ shoot_day_unit_id: SDU }])
    const tpl = await adapter.select<Record<string, unknown>[]>(`SELECT name FROM hazard_templates WHERE production_id = $1`, [PROD_ID])
    expect(tpl).toEqual([{ name: 'Saved' }])
  })

  it('round-trips script sections, script supervisor data, script breakdown and movement order columns', async () => {
    clearUserData()
    const adapter = sqlJsApfE2eContext.adapter!
    const id = (n: number) => `aaaaaaaa-e2e9-4e29-8f${String(n).padStart(2, '0')}-a1e2e2e2e2a1`
    const DAY = id(1)
    const DAY_GONE = id(2)
    const SDU = id(3)
    const SCENE = id(4)
    const SHOT = id(5)
    // Parents get higher ids than the rows that point at them: export sorts by id, so import must reorder.
    const V1 = id(31)
    const V2 = id(7)
    const PAGE = id(8)
    const SECTION = id(9)
    const SLATE = id(10)
    const SLATE_GONE = id(11)
    const TAKE = id(12)
    const TAKE_GONE = id(13)
    const EL1 = id(14)
    const EL2 = id(15)
    const TL1 = id(32)
    const TL2 = id(17)
    const TL_GONE = id(18)
    const ANN1 = id(33)
    const ANN2 = id(20)
    const PHOTO_DOC = id(21)
    const SIDES_DOC = id(22)
    const PERSON = id(23)
    const BD_ELEMENT = id(34)
    const BD_TAG1 = id(35)
    const BD_TAG2 = id(24)
    const photoRel = `attachments/${PROD_ID}/${PHOTO_DOC}-photo.jpg`
    await mkdir(join(apfNodeFsTestContext.appDataRoot, 'attachments', PROD_ID), { recursive: true })
    await writeFile(join(apfNodeFsTestContext.appDataRoot, photoRel), Buffer.from('jpeg-bytes'))

    const run = (sql: string, params: unknown[] = []) => adapter.execute(sql, params)
    await run(
      `INSERT INTO productions (id, name, notes, created_at, updated_at, deleted_at, slug, currency_code, archived_at, wrapped_at, created_from_template)
       VALUES ($1, 'Script E2E', NULL, $2, $2, NULL, 'script-e2e', 'GBP', NULL, NULL, NULL)`,
      [PROD_ID, TS]
    )
    await run(`INSERT INTO units (id, production_id, name, created_at, updated_at) VALUES ($1, $2, 'Main Unit', $3, $3)`, [UNIT_ID, PROD_ID, TS])
    await run(`INSERT INTO people (id, production_id, name, created_at, updated_at) VALUES ($1, $2, 'Actor', $3, $3)`, [PERSON, PROD_ID, TS])
    await run(
      `INSERT INTO shoot_days (id, production_id, shoot_date, movement_pins_json, created_at, updated_at) VALUES ($1, $2, '2025-02-01', '[{"kind":"base"}]', $3, $3)`,
      [DAY, PROD_ID, TS]
    )
    await run(`INSERT INTO shoot_days (id, production_id, shoot_date, created_at, updated_at, deleted_at) VALUES ($1, $2, '2025-02-02', $3, $3, $3)`, [DAY_GONE, PROD_ID, TS])
    await run(
      `INSERT INTO shoot_day_units (id, shoot_day_id, unit_id, is_locked, movement_order_json, created_at, updated_at) VALUES ($1, $2, $3, 0, '{"revision":"B"}', $4, $4)`,
      [SDU, DAY, UNIT_ID, TS]
    )
    await run(
      `INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at) VALUES ($1, $2, '1', $3, $3)`,
      [SCENE, PROD_ID, TS]
    )
    await run(`INSERT INTO shots (id, scene_id, shot_number, created_at, updated_at) VALUES ($1, $2, '1A', $3, $3)`, [SHOT, SCENE, TS])
    await run(
      `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
       VALUES ($1, $2, 'continuity_photo', $3, 'photo.jpg', $4, 'image/jpeg', $5, $5)`,
      [PHOTO_DOC, PROD_ID, SCENE, photoRel, TS]
    )
    await run(
      `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
       VALUES ($1, $2, 'sides', $3, 'sides.pdf', 'attachments/missing/sides.pdf', 'application/pdf', $4, $4)`,
      [SIDES_DOC, PROD_ID, DAY, TS]
    )

    // Script sections / sides builder.
    await run(`INSERT INTO script_versions (id, production_id, title, created_at, updated_at) VALUES ($1, $2, 'Draft 1', $3, $3)`, [V1, PROD_ID, TS])
    await run(
      `INSERT INTO script_versions (id, production_id, title, previous_script_version_id, created_at, updated_at) VALUES ($1, $2, 'Draft 2', $3, $4, $4)`,
      [V2, PROD_ID, V1, TS]
    )
    await run(
      `INSERT INTO script_pages (id, script_version_id, scene_id, page_number, page_index, content, created_at, updated_at) VALUES ($1, $2, $3, '1', 0, 'INT. KITCHEN', $4, $4)`,
      [PAGE, V2, SCENE, TS]
    )
    await run(
      `INSERT INTO script_sections (id, production_id, script_version_id, scene_id, label, section_type, created_at, updated_at) VALUES ($1, $2, $3, $4, 'Stunt', 'stunt', $5, $5)`,
      [SECTION, PROD_ID, V2, SCENE, TS]
    )
    await run(`INSERT INTO script_section_ranges (id, section_id, start_page, end_page, created_at, updated_at) VALUES ('rng-1', $1, '1', '2', $2, $2)`, [SECTION, TS])
    await run(
      `INSERT INTO script_section_characters (id, section_id, person_id, character_name, created_at, updated_at) VALUES ('chr-1', $1, $2, 'Ann', $3, $3)`,
      [SECTION, PERSON, TS]
    )
    await run(
      `INSERT INTO shot_script_sections (id, shot_id, script_section_id, sort_index, created_at, updated_at) VALUES ('sss-1', $1, $2, 0, $3, $3)`,
      [SHOT, SECTION, TS]
    )
    await run(
      `INSERT INTO shoot_day_sides_exports (id, production_id, shoot_day_id, unit_id, document_id, script_version_id, export_label, created_at, updated_at)
       VALUES ('sde-1', $1, $2, $3, $4, $5, 'Day 1 sides', $6, $6)`,
      [PROD_ID, DAY, UNIT_ID, SIDES_DOC, V2, TS]
    )

    // Script supervisor.
    await run(`INSERT INTO production_script_supervisor_settings (production_id, slating_system, created_at, updated_at) VALUES ($1, 'us', $2, $2)`, [PROD_ID, TS])
    await run(
      `INSERT INTO slates (id, production_id, shoot_day_id, unit_id, scene_id, shot_id, slate_prefix, slate_number, slating_system, shot_code, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, '', 1, 'uk', 'MS', $7, $7)`,
      [SLATE, PROD_ID, DAY, UNIT_ID, SCENE, SHOT, TS]
    )
    // A slate on a soft-deleted shoot day (and its takes / tramline / note) is not exported.
    await run(
      `INSERT INTO slates (id, production_id, shoot_day_id, slate_prefix, slate_number, created_at, updated_at) VALUES ($1, $2, $3, '', 2, $4, $4)`,
      [SLATE_GONE, PROD_ID, DAY_GONE, TS]
    )
    await run(`INSERT INTO takes (id, slate_id, take_number, status, end_board, created_at, updated_at) VALUES ($1, $2, 1, 'print', 0, $3, $3)`, [TAKE, SLATE, TS])
    await run(`INSERT INTO takes (id, slate_id, take_number, status, end_board, created_at, updated_at) VALUES ($1, $2, 1, 'ng', 0, $3, $3)`, [TAKE_GONE, SLATE_GONE, TS])
    await run(
      `INSERT INTO script_supervisor_scene_progress (scene_id, production_id, marked_status, completed_shoot_day_id, timed_seconds, created_at, updated_at)
       VALUES ($1, $2, 'complete', $3, 95, $4, $4)`,
      [SCENE, PROD_ID, DAY, TS]
    )
    await run(
      `INSERT INTO script_supervisor_day_logs (shoot_day_id, production_id, call_time, wrap_time, remarks, created_at, updated_at) VALUES ($1, $2, '07:00', '19:30', 'Rain', $3, $3)`,
      [DAY, PROD_ID, TS]
    )
    for (const [el, idx] of [[EL1, 0], [EL2, 1]] as const) {
      await run(
        `INSERT INTO script_elements (id, production_id, script_version_id, scene_id, script_page_id, sort_index, element_type, text, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'action', 'Line', $7, $7)`,
        [el, PROD_ID, V2, SCENE, PAGE, idx, TS]
      )
    }
    await run(
      `INSERT INTO tramlines (id, production_id, slate_id, script_version_id, camera, start_element_id, end_element_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '', $5, $6, $7, $7)`,
      [TL1, PROD_ID, SLATE, V2, EL1, EL2, TS]
    )
    await run(
      `INSERT INTO tramlines (id, production_id, slate_id, script_version_id, camera, start_element_id, end_element_id, carried_from_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'B', $5, $6, $7, $8, $8)`,
      [TL2, PROD_ID, SLATE, V2, EL1, EL2, TL1, TS]
    )
    await run(
      `INSERT INTO tramlines (id, production_id, slate_id, script_version_id, camera, start_element_id, end_element_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '', $5, $6, $7, $7)`,
      [TL_GONE, PROD_ID, SLATE_GONE, V2, EL1, EL2, TS]
    )
    await run(`INSERT INTO tramline_segments (id, tramline_id, element_id, state, created_at, updated_at) VALUES ('seg-1', $1, $2, 'off', $3, $3)`, [TL1, EL2, TS])
    await run(`INSERT INTO tramline_segments (id, tramline_id, element_id, state, created_at, updated_at) VALUES ('seg-gone', $1, $2, 'off', $3, $3)`, [TL_GONE, EL2, TS])
    await run(
      `INSERT INTO script_annotations (id, production_id, script_version_id, element_id, slate_id, kind, text, carried_from_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'note', 'Carried', NULL, $6, $6)`,
      [ANN1, PROD_ID, V1, EL1, SLATE, TS]
    )
    await run(
      `INSERT INTO script_annotations (id, production_id, script_version_id, element_id, slate_id, kind, text, carried_from_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NULL, 'line_change', 'New line', $5, $6, $6)`,
      [ANN2, PROD_ID, V2, EL2, ANN1, TS]
    )
    await run(`INSERT INTO script_annotation_takes (annotation_id, take_id) VALUES ($1, $2)`, [ANN1, TAKE])
    await run(
      `INSERT INTO continuity_media (id, production_id, document_id, slate_id, take_id, scene_id, tags, caption, created_at, updated_at)
       VALUES ('cm-1', $1, $2, $3, $4, $5, 'wardrobe', 'Jacket', $6, $6)`,
      [PROD_ID, PHOTO_DOC, SLATE, TAKE, SCENE, TS]
    )
    await run(
      `INSERT INTO script_revision_items (id, production_id, scene_id, from_script_version_id, to_script_version_id, item_type, item_id, outcome, new_item_id, created_at, updated_at)
       VALUES ('sri-1', $1, $2, $3, $4, 'tramline', $5, 'carried', $6, $7, $7)`,
      [PROD_ID, SCENE, V1, V2, TL1, TL2, TS]
    )
    await run(
      `INSERT INTO breakdown_elements (id, production_id, category, name, manual_status, created_at, updated_at)
       VALUES ($1, $2, 'locations', 'KITCHEN', 'sourced', $3, $3)`,
      [BD_ELEMENT, PROD_ID, TS]
    )
    for (const [tagId, carriedFrom] of [[BD_TAG1, null], [BD_TAG2, BD_TAG1]] as const) {
      await run(
        `INSERT INTO breakdown_tags (id, production_id, element_id, script_version_id, scene_id, start_page_id, start_offset,
           end_page_id, end_offset, tagged_text, carried_from_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 5, $6, 12, 'KITCHEN', $7, $8, $8)`,
        [tagId, PROD_ID, BD_ELEMENT, V2, SCENE, PAGE, carriedFrom, TS]
      )
    }

    await exportProductionAsApf(PROD_ID, apfPath)
    const exported = parseApfArchiveBytes(new Uint8Array(await readFile(apfPath))).normalized.data.tables
    expect(exported.script_versions).toHaveLength(2)
    expect(exported.slates.map((r) => r.id)).toEqual([SLATE])
    expect(exported.takes.map((r) => r.id)).toEqual([TAKE])
    expect(exported.tramlines.map((r) => r.id).sort()).toEqual([TL1, TL2].sort())
    expect(exported.tramline_segments.map((r) => r.id)).toEqual(['seg-1'])

    clearUserData()
    const imp = await importProductionFromApf(apfPath)
    expect(imp.ok).toBe(true)
    if (!imp.ok) throw imp.error

    const rows = (sql: string, params: unknown[] = [PROD_ID]) => adapter.select<Record<string, unknown>[]>(sql, params)
    expect(await rows(`SELECT id, previous_script_version_id FROM script_versions WHERE production_id = $1 ORDER BY title`)).toEqual([
      { id: V1, previous_script_version_id: null },
      { id: V2, previous_script_version_id: V1 },
    ])
    expect(await rows(`SELECT content FROM script_pages`, [])).toEqual([{ content: 'INT. KITCHEN' }])
    expect(await rows(`SELECT section_type FROM script_sections WHERE production_id = $1`)).toEqual([{ section_type: 'stunt' }])
    expect(await rows(`SELECT start_page, end_page FROM script_section_ranges`, [])).toEqual([{ start_page: '1', end_page: '2' }])
    expect(await rows(`SELECT person_id FROM script_section_characters`, [])).toEqual([{ person_id: PERSON }])
    expect(await rows(`SELECT shot_id FROM shot_script_sections`, [])).toEqual([{ shot_id: SHOT }])
    expect(await rows(`SELECT document_id, script_version_id FROM shoot_day_sides_exports`, [])).toEqual([
      { document_id: SIDES_DOC, script_version_id: V2 },
    ])
    expect(await rows(`SELECT slating_system FROM production_script_supervisor_settings WHERE production_id = $1`)).toEqual([{ slating_system: 'us' }])
    expect(await rows(`SELECT id, shot_code, shot_id FROM slates WHERE production_id = $1`)).toEqual([{ id: SLATE, shot_code: 'MS', shot_id: SHOT }])
    expect(await rows(`SELECT id, status FROM takes`, [])).toEqual([{ id: TAKE, status: 'print' }])
    expect(await rows(`SELECT marked_status, timed_seconds FROM script_supervisor_scene_progress WHERE production_id = $1`)).toEqual([
      { marked_status: 'complete', timed_seconds: 95 },
    ])
    expect(await rows(`SELECT call_time, wrap_time, remarks FROM script_supervisor_day_logs WHERE production_id = $1`)).toEqual([
      { call_time: '07:00', wrap_time: '19:30', remarks: 'Rain' },
    ])
    expect(await rows(`SELECT id FROM script_elements WHERE production_id = $1 ORDER BY sort_index`)).toEqual([{ id: EL1 }, { id: EL2 }])
    expect(await rows(`SELECT id, carried_from_id FROM tramlines WHERE production_id = $1 ORDER BY camera`)).toEqual([
      { id: TL1, carried_from_id: null },
      { id: TL2, carried_from_id: TL1 },
    ])
    expect(await rows(`SELECT state FROM tramline_segments`, [])).toEqual([{ state: 'off' }])
    expect(await rows(`SELECT id, carried_from_id FROM script_annotations WHERE production_id = $1 ORDER BY kind DESC`)).toEqual([
      { id: ANN1, carried_from_id: null },
      { id: ANN2, carried_from_id: ANN1 },
    ])
    expect(await rows(`SELECT take_id FROM script_annotation_takes`, [])).toEqual([{ take_id: TAKE }])
    expect(await rows(`SELECT document_id, tags FROM continuity_media WHERE production_id = $1`)).toEqual([
      { document_id: PHOTO_DOC, tags: 'wardrobe' },
    ])
    expect(await rows(`SELECT outcome, new_item_id FROM script_revision_items WHERE production_id = $1`)).toEqual([
      { outcome: 'carried', new_item_id: TL2 },
    ])
    expect(await rows(`SELECT name, manual_status FROM breakdown_elements WHERE production_id = $1`)).toEqual([
      { name: 'KITCHEN', manual_status: 'sourced' },
    ])
    expect(await rows(`SELECT id, carried_from_id, start_offset, end_offset FROM breakdown_tags WHERE production_id = $1 ORDER BY carried_from_id IS NOT NULL`)).toEqual([
      { id: BD_TAG1, carried_from_id: null, start_offset: 5, end_offset: 12 },
      { id: BD_TAG2, carried_from_id: BD_TAG1, start_offset: 5, end_offset: 12 },
    ])
    expect(await rows(`SELECT movement_pins_json FROM shoot_days WHERE id = $1`, [DAY])).toEqual([{ movement_pins_json: '[{"kind":"base"}]' }])
    expect(await rows(`SELECT movement_order_json FROM shoot_day_units WHERE id = $1`, [SDU])).toEqual([{ movement_order_json: '{"revision":"B"}' }])
    // The continuity photo's bytes travel with the package.
    expect(existsSync(join(apfNodeFsTestContext.appDataRoot, photoRel))).toBe(true)
  })

  it('round-trips storyboards (with image files), vendor exclusions and overtime data', async () => {
    clearUserData()
    const adapter = sqlJsApfE2eContext.adapter!
    const id = (n: number) => `aaaaaaaa-e2ea-4e2a-8f${String(n).padStart(2, '0')}-a1e2e2e2e2a1`
    const OTHER_PROD = id(1)
    const DAY = id(2)
    const DAY_GONE = id(3)
    const SCENE = id(4)
    const SHOT = id(5)
    const IMPORT = id(6)
    const IMG_OK = id(7)
    const IMG_MISSING = id(8)
    const IMG_GONE = id(9)
    const VENDOR = id(10)
    const GLOBAL_OTHER = id(11)
    const EXCL_KEPT = id(12)
    const EXCL_DROPPED = id(13)
    const CREW = id(14)
    const CREW_GONE = id(15)
    const HOURS = id(16)
    const HOURS_GONE = id(17)
    const okKey = `storyboards/${PROD_ID}/shots/${SHOT}/manual/abc123-frame.png`
    await mkdir(join(apfNodeFsTestContext.appDataRoot, 'storyboards', PROD_ID, 'shots', SHOT, 'manual'), { recursive: true })
    await writeFile(join(apfNodeFsTestContext.appDataRoot, okKey), Buffer.from('png-bytes'))

    const run = (sql: string, params: unknown[] = []) => adapter.execute(sql, params)
    for (const [pid, slug] of [[PROD_ID, 'sb-e2e'], [OTHER_PROD, 'sb-other']] as const) {
      await run(
        `INSERT INTO productions (id, name, notes, created_at, updated_at, deleted_at, slug, currency_code, archived_at, wrapped_at, created_from_template)
         VALUES ($1, $2, NULL, $3, $3, NULL, $4, 'GBP', NULL, NULL, NULL)`,
        [pid, slug, TS, slug]
      )
    }
    await run(`INSERT INTO people (id, production_id, name, created_at, updated_at) VALUES ($1, $2, 'Crew', $3, $3)`, [CREW, PROD_ID, TS])
    await run(`INSERT INTO people (id, production_id, name, created_at, updated_at, deleted_at) VALUES ($1, $2, 'Gone', $3, $3, $3)`, [CREW_GONE, PROD_ID, TS])
    await run(`INSERT INTO shoot_days (id, production_id, shoot_date, created_at, updated_at) VALUES ($1, $2, '2025-03-01', $3, $3)`, [DAY, PROD_ID, TS])
    await run(`INSERT INTO shoot_days (id, production_id, shoot_date, created_at, updated_at, deleted_at) VALUES ($1, $2, '2025-03-02', $3, $3, $3)`, [DAY_GONE, PROD_ID, TS])
    await run(`INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at) VALUES ($1, $2, '1', $3, $3)`, [SCENE, PROD_ID, TS])
    await run(`INSERT INTO shots (id, scene_id, shot_number, created_at, updated_at) VALUES ($1, $2, '1A', $3, $3)`, [SHOT, SCENE, TS])

    // Storyboards: one image with bytes, one whose file is gone, one soft-deleted.
    await run(
      `INSERT INTO storyboard_imports (id, production_id, scene_id, source_filename, source_type, status, metadata_json, created_at, updated_at)
       VALUES ($1, $2, $3, 'gallery.pdf', 'athena_pdf_import', 'completed', '{"pages":2}', $4, $4)`,
      [IMPORT, PROD_ID, SCENE, TS]
    )
    const img = (imgId: string, key: string, name: string, sort: number, deleted: string | null) =>
      run(
        `INSERT INTO storyboard_images (id, production_id, scene_id, shot_id, storage_key, original_filename, mime_type, width, height, sort_order, source_type, source_import_id, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'image/png', 640, 360, $7, 'athena_pdf_import', $8, $9, $9, $10)`,
        [imgId, PROD_ID, SCENE, SHOT, key, name, sort, IMPORT, TS, deleted]
      )
    await img(IMG_OK, okKey, 'frame.png', 0, null)
    await img(IMG_MISSING, `storyboards/${PROD_ID}/shots/${SHOT}/manual/zzz-lost.png`, 'lost.png', 1, null)
    await img(IMG_GONE, `storyboards/${PROD_ID}/shots/${SHOT}/manual/del-gone.png`, 'gone.png', 2, TS)

    // Vendor exclusions: one for a vendor in the package, one for a global vendor owned by another production.
    await run(`INSERT INTO vendors (id, production_id, company_name, created_at, updated_at) VALUES ($1, $2, 'Local Co', $3, $3)`, [VENDOR, PROD_ID, TS])
    await run(`INSERT INTO vendors (id, production_id, company_name, is_global, created_at, updated_at) VALUES ($1, $2, 'Shared Co', 1, $3, $3)`, [GLOBAL_OTHER, OTHER_PROD, TS])
    await run(`INSERT INTO vendor_production_exclusions (id, vendor_id, production_id, created_at) VALUES ($1, $2, $3, $4)`, [EXCL_KEPT, VENDOR, PROD_ID, TS])
    await run(`INSERT INTO vendor_production_exclusions (id, vendor_id, production_id, created_at) VALUES ($1, $2, $3, $4)`, [EXCL_DROPPED, GLOBAL_OTHER, PROD_ID, TS])

    // Overtime: settings, a per-person flag and logged hours (one for a soft-deleted shoot day).
    await run(
      `INSERT INTO production_crew_hours_settings (production_id, overtime_basis, standard_day_minutes, hourly_rate_divisor, overtime_multiplier, overtime_increment_minutes, minimum_rest_minutes, created_at, updated_at)
       VALUES ($1, 'day_length', 600, 8, 2, 15, 720, $2, $2)`,
      [PROD_ID, TS]
    )
    await run(`INSERT INTO crew_hours_person_settings (production_id, person_id, overtime_exempt, created_at, updated_at) VALUES ($1, $2, 1, $3, $3)`, [PROD_ID, CREW, TS])
    await run(
      `INSERT INTO crew_day_hours (id, production_id, shoot_day_id, person_id, call_time, wrap_time, notes, created_at, updated_at) VALUES ($1, $2, $3, $4, '07:00', '19:30', 'late', $5, $5)`,
      [HOURS, PROD_ID, DAY, CREW, TS]
    )
    await run(
      `INSERT INTO crew_day_hours (id, production_id, shoot_day_id, person_id, call_time, wrap_time, created_at, updated_at, deleted_at) VALUES ($1, $2, $3, $4, '08:00', '18:00', $5, $5, $5)`,
      [HOURS_GONE, PROD_ID, DAY, CREW, TS]
    )

    await exportProductionAsApf(PROD_ID, apfPath)
    const exported = parseApfArchiveBytes(new Uint8Array(await readFile(apfPath)))
    const t = exported.normalized.data.tables
    expect(t.storyboard_images.map((r) => r.id).sort()).toEqual([IMG_OK, IMG_MISSING].sort())
    expect(t.vendor_production_exclusions.map((r) => r.id)).toEqual([EXCL_KEPT])
    expect(t.crew_day_hours.map((r) => r.id)).toEqual([HOURS])
    const exportInfo = exported.normalized.manifest.export
    expect(exportInfo?.bundledStoryboardImageIds).toEqual([IMG_OK])
    expect(exportInfo?.missingStoryboardImageIds).toEqual([IMG_MISSING])
    expect(exportInfo?.tableRowCounts?.storyboard_images).toBe(2)
    expect(exported.index.has(`files/storyboards/${IMG_OK}/frame.png`)).toBe(true)

    clearUserData()
    await rm(join(apfNodeFsTestContext.appDataRoot, 'storyboards'), { recursive: true, force: true })

    const imp = await importProductionFromApf(apfPath)
    expect(imp.ok).toBe(true)
    if (!imp.ok) throw imp.error
    expect(imp.filesRestored).toBe(1)
    expect(imp.warnings.some((w) => w.includes(IMG_MISSING))).toBe(true)

    const rows = (sql: string, params: unknown[] = [PROD_ID]) => adapter.select<Record<string, unknown>[]>(sql, params)
    expect(await rows(`SELECT id, scene_id, source_filename, status, metadata_json FROM storyboard_imports WHERE production_id = $1`)).toEqual([
      { id: IMPORT, scene_id: SCENE, source_filename: 'gallery.pdf', status: 'completed', metadata_json: '{"pages":2}' },
    ])
    const importedKey = `storyboards/${PROD_ID}/shots/${SHOT}/imported/${IMG_OK}-frame.png`
    expect(await rows(`SELECT id, shot_id, storage_key, source_import_id, sort_order FROM storyboard_images WHERE production_id = $1 ORDER BY sort_order`)).toEqual([
      { id: IMG_OK, shot_id: SHOT, storage_key: importedKey, source_import_id: IMPORT, sort_order: 0 },
      {
        id: IMG_MISSING,
        shot_id: SHOT,
        storage_key: `storyboards/${PROD_ID}/shots/${SHOT}/imported/${IMG_MISSING}-lost.png`,
        source_import_id: IMPORT,
        sort_order: 1,
      },
    ])
    expect(Buffer.from(await readFile(join(apfNodeFsTestContext.appDataRoot, importedKey))).toString()).toBe('png-bytes')
    expect(await rows(`SELECT id, vendor_id FROM vendor_production_exclusions WHERE production_id = $1`)).toEqual([
      { id: EXCL_KEPT, vendor_id: VENDOR },
    ])
    expect(
      await rows(`SELECT overtime_basis, standard_day_minutes, hourly_rate_divisor, overtime_multiplier, overtime_increment_minutes, minimum_rest_minutes FROM production_crew_hours_settings WHERE production_id = $1`)
    ).toEqual([
      { overtime_basis: 'day_length', standard_day_minutes: 600, hourly_rate_divisor: 8, overtime_multiplier: 2, overtime_increment_minutes: 15, minimum_rest_minutes: 720 },
    ])
    expect(await rows(`SELECT person_id, overtime_exempt FROM crew_hours_person_settings WHERE production_id = $1`)).toEqual([{ person_id: CREW, overtime_exempt: 1 }])
    expect(await rows(`SELECT id, shoot_day_id, person_id, call_time, wrap_time, notes FROM crew_day_hours WHERE production_id = $1`)).toEqual([
      { id: HOURS, shoot_day_id: DAY, person_id: CREW, call_time: '07:00', wrap_time: '19:30', notes: 'late' },
    ])
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
