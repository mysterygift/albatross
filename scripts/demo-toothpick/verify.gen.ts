/**
 * Independent check of the generated `.apf`: opens the ZIP, imports it into a FRESH database with the
 * app's real importer, then exercises the app's own queries (Script Supervisor, calendar, Day Out of
 * Days, sides, RAMS) against the imported data.
 *
 *   npx vitest run --config scripts/demo-toothpick/vitest.config.ts
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { afterAll, describe, expect, it } from 'vitest'

import { importProductionFromApf } from '@/lib/importExport/importProduction'
import { loadApfV1ProductionTables } from '@/lib/importExport/exportLoadProductionData'
import { resetApfImportPragmaCache } from '@/lib/importExport/planImportStatements'
import { APF_V1_TABLE_KEYS } from '@/lib/importExport/tableKeys'
import { setTestDataEncryptionKeyForTests } from '@/lib/security/dataEncryptionContext'
import { listCalendarShootDayEvents } from '@/lib/db/repositories/calendar'
import { getCastIdsBySceneIds } from '@/lib/db/repositories/scene-cast'
import { isUnavailableOnDate, listAvailabilityByProduction } from '@/lib/db/repositories/cast-availability'
import { createTramline, ensureScriptElements, loadLinedScene } from '@/lib/db/repositories/scriptLining'
import {
  createSlate, createTake, getNextSlatePreview, listScenesForShootDay, listSlatesByShootDay, updateTake,
} from '@/lib/db/repositories/scriptSupervisor'
import { getScheduledSceneIdsByShootDay } from '@/lib/db/repositories/stripboard-strips'
import { deriveShootDayScriptSections } from '@/lib/db/shootDayScriptSectionsService'
import { getRamsDayDefaults } from '@/lib/risk-assessments/dayDefaults'
import { apfE2eExecuteBatchMock, sequentialExecuteBatchOnDb } from '@/test/apf/apfE2eExecuteBatchMock'
import { apfNodeFsTestContext } from '@/test/apf/apfNodeFsTestContext'
import { sqlJsApfE2eContext } from '@/test/apf/sqlJsApfE2eContext'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

import { openMigratedDb, query } from './lib/db'
import { createCtx } from './build/ctx'
import { DAYS } from './data/schedule'
import { SCENES } from './data/scenes'
import { OUTPUT_FILE } from './lib/paths'

let workDir = ''
afterAll(async () => {
  setTestDataEncryptionKeyForTests(null)
  sqlJsApfE2eContext.adapter = null
  sqlJsApfE2eContext.rawDb?.close()
  sqlJsApfE2eContext.rawDb = null
  if (workDir) await rm(workDir, { recursive: true, force: true })
})

describe('Toothpick .apf (fresh-database import)', () => {
  it('is a valid v9 archive', async () => {
    const files = unzipSync(new Uint8Array(await readFile(OUTPUT_FILE)))
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']))
    expect(manifest.kind).toBe('albatross-project-file')
    expect(manifest.formatVersion).toBe(9)
    expect(manifest.production.slug).toBe('demo-toothpick-manchester')
    expect(manifest.export.missingDocumentFileIds ?? []).toEqual([])
    const data = JSON.parse(new TextDecoder().decode(files['data/production.json']))
    expect(data.formatVersion).toBe(9)
    expect(Object.keys(data.tables).sort()).toEqual([...APF_V1_TABLE_KEYS].sort())
    const bundled = Object.keys(files).filter((p) => p.startsWith('files/documents/'))
    expect(bundled.length).toBe(data.tables.documents.length)
  })

  it('imports into a fresh database and behaves in the app', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'toothpick-verify-'))
    apfNodeFsTestContext.appDataRoot = join(workDir, 'appdata')
    await mkdir(apfNodeFsTestContext.appDataRoot, { recursive: true })
    setTestDataEncryptionKeyForTests(new Uint8Array(32).fill(11))
    const raw = await openMigratedDb()
    sqlJsApfE2eContext.rawDb = raw
    sqlJsApfE2eContext.adapter = createSqlJsTauriAdapter(raw)
    apfE2eExecuteBatchMock.mockImplementation(sequentialExecuteBatchOnDb)
    resetApfImportPragmaCache()

    const ctx = createCtx()
    const pid = ctx.pid
    const result = await importProductionFromApf(OUTPUT_FILE)
    if (!result.ok) throw result.error
    expect(result.productionId).toBe(pid)
    expect(result.formatVersion).toBe(9)
    expect(result.warnings).toEqual([])
    const docCount = Number(query(raw, 'SELECT COUNT(*) FROM documents')[0]![0])
    expect(result.filesRestored).toBe(docCount)

    // Integrity + stable round trip (re-export equals what we imported, table by table).
    expect(query(raw, 'PRAGMA foreign_key_check')).toEqual([])
    const again = await loadApfV1ProductionTables(pid)
    const fileTables = JSON.parse(new TextDecoder().decode(unzipSync(new Uint8Array(await readFile(OUTPUT_FILE)))['data/production.json'])).tables
    for (const key of APF_V1_TABLE_KEYS) {
      expect(again[key].length, `row count after round trip: ${key}`).toBe(fileTables[key].length)
    }

    // Bundled files: script PDF restored byte-for-byte.
    const scriptDoc = query(raw, "SELECT file_path FROM documents WHERE entity_type = 'script'")[0]![0] as string
    const restored = await readFile(join(apfNodeFsTestContext.appDataRoot, scriptDoc))
    const original = await readFile(join(__dirname, 'assets/Toothpick-V1.pdf'))
    expect(createHash('sha256').update(restored).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'))
    for (const [, p] of query(raw, 'SELECT id, file_path FROM documents') as Array<[string, string]>) {
      expect(existsSync(join(apfNodeFsTestContext.appDataRoot, p)), `file for ${p}`).toBe(true)
    }

    // Schedule: Script Supervisor day lists match the plan.
    const expectedScenes: Record<number, number[]> = { 1: [3, 4, 5, 16], 2: [9, 15], 3: [14, 10, 18], 4: [6, 7, 12], 5: [2, 11], 6: [1, 7, 17], 7: [13, 8] }
    for (const d of DAYS) {
      const scenes = await listScenesForShootDay(ctx.idOf.day(d.n))
      expect(scenes.map((s) => Number(s.scene_number)), `scenes on day ${d.n}`).toEqual(expectedScenes[d.n])
    }
    const events = await listCalendarShootDayEvents(pid, { start: '2026-11-01', end: '2026-11-30' })
    expect(events).toHaveLength(9)

    // Day Out of Days: exactly one clash (Minty on day 4) and nothing else.
    const sceneByDay = await getScheduledSceneIdsByShootDay(pid)
    const avail = await listAvailabilityByProduction(pid)
    const clashes: string[] = []
    for (const d of DAYS) {
      const castBy = await getCastIdsBySceneIds(sceneByDay.get(ctx.idOf.day(d.n)) ?? [])
      const people = new Set([...castBy.values()].flat())
      for (const person of people) {
        if (isUnavailableOnDate(avail.filter((a) => a.person_id === person), d.date)) clashes.push(`${person}@${d.date}`)
      }
    }
    expect(clashes).toEqual([`${ctx.idOf.person('cast', 'minty')}@2026-11-05`])

    // Sides: day 4 covers scene 7 only partially (Hugh's half).
    const day4 = await deriveShootDayScriptSections(ctx.idOf.day(4))
    expect(day4.partialSceneIds).toContain(ctx.idOf.scene(7))
    const rams = await getRamsDayDefaults(pid, ctx.idOf.day(3))
    expect(rams.location_name).toBe('The Goose and Gander')
    expect(rams.hospital_name).toContain('Manchester Royal Infirmary')

    // Script Supervisor end to end on the imported data: slate, take, line the script.
    const first = await createSlate({
      production_id: pid, shoot_day_id: ctx.idOf.day(1), scene_id: ctx.idOf.scene(3), shot_id: ctx.idOf.shot(3, 1), camera: 'A',
    })
    expect(first.slate_number).toBe(1)
    const take = await createTake(first.id, { duration_ms: 42_000 })
    await updateTake(take.id, { status: 'print' })
    const x = await createSlate({ production_id: pid, shoot_day_id: ctx.idOf.day(2), scene_id: ctx.idOf.scene(9), slate_prefix: 'X' })
    expect(x.slate_prefix).toBe('X')
    expect(await listSlatesByShootDay(ctx.idOf.day(1))).toHaveLength(1)
    const preview = await getNextSlatePreview(pid)
    expect(JSON.stringify(preview)).toContain('2')

    const lined = await loadLinedScene(pid, ctx.idOf.scene(3))
    expect(lined).not.toBeNull()
    expect(lined!.elements.length).toBeGreaterThan(5)
    await createTramline({
      slateId: first.id, scriptVersionId: lined!.scriptVersionId,
      startElementId: lined!.elements[1]!.id, endElementId: lined!.elements[lined!.elements.length - 1]!.id,
    })
    expect((await loadLinedScene(pid, ctx.idOf.scene(3)))!.tramlines).toHaveLength(1)
    expect(await ensureScriptElements(lined!.scriptVersionId)).toBeGreaterThan(50)

    // Finance sanity straight from SQL.
    const poMismatch = query(raw, `
      SELECT po.po_number FROM vendor_purchase_orders po
      JOIN vendor_invoices vi ON vi.po_id = po.id AND vi.deleted_at IS NULL
      WHERE po.deleted_at IS NULL AND po.status IN ('approved','closed')
      GROUP BY po.id HAVING ABS(SUM(vi.amount) - po.amount) > 0.001 AND po.po_number NOT IN ('PO-TCB-001')`)
    expect(poMismatch).toEqual([])
    const invoiceMismatch = query(raw, `
      SELECT vi.invoice_number FROM vendor_invoices vi
      JOIN vendor_invoice_expenses vie ON vie.vendor_invoice_id = vi.id
      JOIN expenses e ON e.id = vie.expense_id
      WHERE vi.currency_code = 'GBP'
      GROUP BY vi.id HAVING ABS(SUM(e.amount) - vi.amount) > 0.001`)
    expect(invoiceMismatch).toEqual([])
    expect(SCENES).toHaveLength(18)
  })
})
