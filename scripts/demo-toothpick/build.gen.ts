/**
 * Builds the Toothpick (Manchester) demo project and exports it as a v9 `.apf`.
 *
 * Everything runs through the app's own code: an in-memory SQLite database created from the real
 * migrations, the app's PDF parser and script-section generator for the script data, and
 * `exportProductionAsApf` for the file itself.
 *
 *   npx vitest run --config scripts/demo-toothpick/vitest.config.ts
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { exportProductionAsApf } from '@/lib/importExport/exportProduction'
import { loadApfV1ProductionTables } from '@/lib/importExport/exportLoadProductionData'
import { setTestDataEncryptionKeyForTests } from '@/lib/security/dataEncryptionContext'
import { extractPdfLines, parsePdfScript } from '@/lib/script-parser'
import { generateScriptVersionFromScenes } from '@/lib/db/scriptSectionGenerationService'
import { linkShotToSections, listRangesBySectionIds, listSectionsByScene } from '@/lib/db/repositories/scriptSections'
import { apfE2eExecuteBatchMock, sequentialExecuteBatchOnDb } from '@/test/apf/apfE2eExecuteBatchMock'
import { apfNodeFsTestContext } from '@/test/apf/apfNodeFsTestContext'
import { sqlJsApfE2eContext } from '@/test/apf/sqlJsApfE2eContext'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

import { insertAllTables, insertRows, openMigratedDb, query } from './lib/db'
import { fileSafe } from './lib/util'
import { classifyScript } from './lib/scriptLayout'
import { OUTPUT_DIR, OUTPUT_FILE } from './lib/paths'
import { add, createCtx } from './build/ctx'
import {
  buildAvailability, buildBookings, buildEquipmentTerms, buildKeyContacts, buildLocations, buildPeople, buildProduction,
  buildScenes, buildShootDays, buildShots, buildStrips, scheduleSummary,
} from './build/core'
import {
  budgetTotals, buildBudgetFrame, buildBudgetItems, buildExpenses, buildFloats, buildPurchaseOrdersAndInvoices,
  buildReceipts, buildVendors, financeSummary,
} from './build/finance'
import {
  addDocumentRows, addScriptDocument, buildEquipment, buildHazardsAndRams, buildMusicAndDeliverables, buildPlaceholderDocuments,
  buildTasks, filePathFor,
} from './build/ops'
import { buildGuide } from './build/guide'
import { CAST, CREW } from './data/people'
import { SHOTS } from './data/shots'


/** Cue names that are real characters (the parser also picks up shouted dialogue like "HUGH." or "DAMN."). */
const REAL_CUES = new Set(['HUGH', 'DON', 'MAISIE', 'ROSE', 'MINTY', 'WOMAN', 'CUSTOMER'])

let workDir = ''
afterAll(async () => {
  setTestDataEncryptionKeyForTests(null)
  sqlJsApfE2eContext.adapter = null
  sqlJsApfE2eContext.rawDb?.close()
  sqlJsApfE2eContext.rawDb = null
  if (workDir) await rm(workDir, { recursive: true, force: true })
})

describe('Toothpick demo project', () => {
  it('builds the project and writes the v9 .apf', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'toothpick-demo-'))
    apfNodeFsTestContext.appDataRoot = join(workDir, 'appdata')
    await mkdir(apfNodeFsTestContext.appDataRoot, { recursive: true })
    setTestDataEncryptionKeyForTests(new Uint8Array(32).fill(11))
    const raw = await openMigratedDb()
    sqlJsApfE2eContext.rawDb = raw
    sqlJsApfE2eContext.adapter = createSqlJsTauriAdapter(raw)
    apfE2eExecuteBatchMock.mockImplementation(sequentialExecuteBatchOnDb)

    // Node has no Worker: preload pdfjs's worker handler so the parser's fake-worker path is used.
    const workerMod = (await import('pdfjs-dist/build/pdf.worker.min.mjs' as string)) as { WorkerMessageHandler: unknown }
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = { WorkerMessageHandler: workerMod.WorkerMessageHandler }

    const scriptPdf = new Uint8Array(await readFile(join(__dirname, 'assets/Toothpick-V1.pdf')))
    const ab = scriptPdf.buffer.slice(scriptPdf.byteOffset, scriptPdf.byteOffset + scriptPdf.byteLength) as ArrayBuffer
    const parsed = await parsePdfScript(ab.slice(0))
    const lines = await extractPdfLines(ab.slice(0))
    expect(parsed).toHaveLength(18)
    const rawText = lines.map((l, i) => (i > 0 && l.page !== lines[i - 1]!.page ? `\n\n${l.text}` : l.text)).join('\n')

    // ── 1. Everything except the script-derived rows ─────────────────────────
    const ctx = createCtx()
    buildProduction(ctx)
    buildLocations(ctx)
    buildPeople(ctx)
    buildKeyContacts(ctx)
    buildAvailability(ctx)
    buildEquipmentTerms(ctx)
    buildShootDays(ctx)
    buildScenes(ctx)
    buildShots(ctx)
    buildStrips(ctx)
    buildBookings(ctx)
    buildVendors(ctx)
    buildBudgetFrame(ctx)
    buildBudgetItems(ctx)
    buildExpenses(ctx)
    buildFloats(ctx)
    await buildPurchaseOrdersAndInvoices(ctx)
    await buildReceipts(ctx)
    buildTasks(ctx)
    buildEquipment(ctx)
    buildMusicAndDeliverables(ctx)
    buildHazardsAndRams(ctx)
    await buildPlaceholderDocuments(ctx)
    addScriptDocument(ctx, scriptPdf, rawText)
    add(ctx, 'production_script_supervisor_settings', {
      production_id: ctx.pid, slating_system: 'uk', created_at: ctx.ts, updated_at: ctx.ts,
    })

    // Document-dependent rows go in last (after the guide, which needs script stats).
    const held = {
      expense_receipts: ctx.tables.expense_receipts,
      script_documents: ctx.tables.script_documents,
    }
    delete (ctx.tables as Record<string, unknown>).expense_receipts
    delete (ctx.tables as Record<string, unknown>).script_documents
    insertAllTables(raw, ctx.tables)

    // ── 2. Script parser output → script version, pages, sections (app's own generator) ──
    parsed.forEach((p, i) => expect(p.scene_number).toBe(String(i + 1)))
    // The app's parser mis-types this PDF's body lines (see lib/scriptLayout.ts), so scene metadata comes
    // from the parser and the line classification from the layout classifier.
    const layout = classifyScript(lines)
    expect(layout.map((s) => s.sceneNumber)).toEqual(parsed.map((p) => p.scene_number))
    const version = await generateScriptVersionFromScenes({
      productionId: ctx.pid,
      title: 'Toothpick-V1.pdf',
      versionLabel: 'V1',
      revisionColour: 'White',
      linkToPreviousVersion: false,
      scenes: parsed.map((p, i) => ({
        sceneId: ctx.idOf.scene(i + 1),
        parsed: {
          ...p,
          elements: layout[i]!.elements,
          characters: layout[i]!.cues,
          start_page: String(layout[i]!.firstPage),
          end_page: String(layout[i]!.lastPage),
        },
      })),
    })
    expect(version).not.toBeNull()

    // Drop junk cues the extractor picked up from shouted dialogue ("GWAAAAAN!", "HUGH.", "DAMN.", "A-").
    const junk = query(raw, 'SELECT id, character_name FROM script_section_characters')
    for (const [id, name] of junk) {
      if (!REAL_CUES.has(String(name).toUpperCase())) raw.run('DELETE FROM script_section_characters WHERE id = ?', [id as string])
    }

    // Shot ↔ section coverage: each shot covers its proportional slice of the scene's sections.
    for (let sc = 1; sc <= 18; sc++) {
      const sections = await listSectionsByScene(ctx.idOf.scene(sc))
      const ranges = await listRangesBySectionIds(sections.map((s) => s.id))
      const key = (id: string) => {
        const r = ranges.get(id)?.[0]
        return (Number.parseInt(r?.start_page ?? '0', 10) || 0) * 8 + (r?.start_eighth ?? 0)
      }
      const ordered = [...sections].sort((a, b) => key(a.id) - key(b.id))
      const shotCount = SHOTS[sc]!.length
      for (let i = 0; i < shotCount; i++) {
        const start = Math.floor((i * ordered.length) / shotCount)
        const end = Math.max(start + 1, Math.ceil(((i + 1) * ordered.length) / shotCount))
        await linkShotToSections(ctx.idOf.shot(sc, i + 1), ordered.slice(start, end).map((s) => s.id))
      }
    }

    // ── 3. Guide + documents ────────────────────────────────────────────────
    const counts = (t: string) => Number(query(raw, `SELECT COUNT(*) FROM ${t}`)[0]![0])
    const fin = financeSummary()
    const sched = scheduleSummary()
    const guide = await buildGuide({
      scriptPages: Math.round(sched.eighths / 8), scenes: sched.scenes, shots: sched.shots, sections: counts('script_sections'),
      versionLabel: version?.version_label ?? 'V1', vendors: fin.vendors, pos: fin.pos, invoices: fin.invoices,
      cast: CAST.length, crew: CREW.length, budgetEstimated: budgetTotals.estimated,
    })
    ctx.docs.push({ id: ctx.ids('doc', 'guide'), entity_type: null, entity_id: null, file_name: 'Toothpick-Demo-Guide.pdf', mime_type: 'application/pdf', bytes: guide })
    addDocumentRows(ctx)
    insertRows(raw, 'documents', ctx.tables.documents)
    insertRows(raw, 'expense_receipts', held.expense_receipts)
    insertRows(raw, 'script_documents', held.script_documents)
    for (const d of ctx.docs) {
      const rel = filePathFor(ctx.pid, d.id, fileSafe(d.file_name))
      const full = join(apfNodeFsTestContext.appDataRoot, rel)
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, d.bytes)
    }

    // ── 4. Integrity, then export through the app's own pipeline ─────────────
    expect(query(raw, 'PRAGMA foreign_key_check'), 'foreign key violations').toEqual([])

    await mkdir(OUTPUT_DIR, { recursive: true })
    await exportProductionAsApf(ctx.pid, OUTPUT_FILE)

    const tables = await loadApfV1ProductionTables(ctx.pid)
    const summary = Object.fromEntries(Object.entries(tables).filter(([, v]) => v.length > 0).map(([k, v]) => [k, v.length]))
    console.log('Exported', OUTPUT_FILE)
    console.log(JSON.stringify(summary))
    console.log('Budget estimated (net of contingency):', Math.round(budgetTotals.estimated))
    expect(summary.script_versions).toBe(1)
    expect(summary.slates ?? 0).toBe(0)
  })
})
