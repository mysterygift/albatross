import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>
let rawDb: Database

const writeFileMock = vi.hoisted(() => vi.fn())
const mkdirMock = vi.hoisted(() => vi.fn())
const removeMock = vi.hoisted(() => vi.fn())
const deleteAttachmentFileMock = vi.hoisted(() => vi.fn())

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
  BaseDirectory: { AppData: 'AppData' },
  mkdir: mkdirMock,
  writeFile: writeFileMock,
  writeTextFile: vi.fn(),
  remove: removeMock,
}))

vi.mock('@/lib/files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/files')>()
  return { ...actual, deleteAttachmentFile: deleteAttachmentFileMock }
})

import { createProduction } from '@/lib/db/repositories/production'
import { createShootDay } from '@/lib/db/repositories/schedule'
import { createUnit } from '@/lib/db/repositories/units'
import { getOrCreateShootDayUnit, listShootDayUnitsByShootDay } from '@/lib/db/repositories/shoot-day-units'
import { getDocumentById, listDocumentsByProduction } from '@/lib/db/repositories/document'
import {
  approveRiskAssessment,
  buildSetGeneratedDocumentStatements,
  deleteRiskAssessment,
  duplicateRiskAssessment,
  getRiskAssessment,
  listRiskAssessmentsByProduction,
  listRiskAssessmentsByShootDay,
  saveRiskAssessment,
} from '@/lib/db/repositories/risk-assessments'
import {
  deleteHazardTemplate,
  listHazardTemplatesByProduction,
  upsertHazardTemplate,
} from '@/lib/db/repositories/hazard-templates'
import { persistProductionDocument } from '@/lib/documents/persistDocument'
import { exportRiskAssessmentPdf } from '@/lib/risk-assessments/exportRiskAssessmentPdf'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { BUILT_IN_HAZARDS } from '@/lib/risk-assessments/builtInHazards'
import { blankHazard } from '@/lib/risk-assessments/content'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

const manualHandling = BUILT_IN_HAZARDS[0]!

async function countRows(table: string): Promise<number> {
  const rows = await dbAdapter.select<{ n: number }[]>(`SELECT COUNT(*) AS n FROM ${table}`)
  return Number(rows[0]!.n)
}

async function setup() {
  const production = await createProduction({ name: 'RAMS Test', notes: null })
  const second = await createUnit({ production_id: production.id, name: 'Second Unit' })
  const day1 = (await createShootDay({ production_id: production.id, shoot_date: '2026-03-01' })).id
  const day2 = (await createShootDay({ production_id: production.id, shoot_date: '2026-03-02' })).id
  await getOrCreateShootDayUnit(day1, second.id)
  const day1Units = await listShootDayUnitsByShootDay(day1)
  const day2Units = await listShootDayUnitsByShootDay(day2)
  return { production, second, day1, day2, day1Units, day2Units }
}

describe('risk assessments repository', () => {
  beforeEach(async () => {
    writeFileMock.mockReset().mockResolvedValue(undefined)
    mkdirMock.mockReset().mockResolvedValue(undefined)
    removeMock.mockReset().mockResolvedValue(undefined)
    deleteAttachmentFileMock.mockReset().mockResolvedValue(undefined)
    const SQL = await initSqlJs()
    rawDb = new SQL.Database()
    applyAllMigrations(rawDb)
    rawDb.exec('PRAGMA foreign_keys = ON')
    dbAdapter = createSqlJsTauriAdapter(rawDb)
  })

  it('creates a RAMS, round-trips content and replaces hazards/units on save', async () => {
    const { production, day1, day1Units } = await setup()
    const created = await saveRiskAssessment({
      production_id: production.id,
      shoot_day_id: day1,
      shoot_day_unit_ids: day1Units.map((u) => u.id),
      location_name: ' Warehouse ',
      activities: 'Rigging',
      responsible_person_name: 'Sam',
      first_aiders: [
        { name: 'Ann', phone: '1', email: '' },
        { name: '', phone: '', email: '' },
      ],
      hospital_name: 'City Hospital',
      hazards: [{ ...manualHandling }, { ...blankHazard(), name: 'Working at height' }],
    })

    expect(created.status).toBe('draft')
    expect(created.location_name).toBe('Warehouse')
    expect(created.first_aiders).toEqual([{ name: 'Ann', phone: '1', email: '' }])
    expect(created.shoot_day_unit_ids.sort()).toEqual(day1Units.map((u) => u.id).sort())
    expect(created.hazards.map((h) => h.name)).toEqual(['Manual Handling', 'Working at height'])
    expect(created.hazards[0]).toMatchObject({ severity_before: 4, probability_before: 3, severity_after: 2, probability_after: 2 })

    const updated = await saveRiskAssessment({
      id: created.id,
      production_id: production.id,
      shoot_day_id: day1,
      shoot_day_unit_ids: [day1Units[0]!.id],
      location_name: 'Warehouse',
      activities: 'Rigging',
      responsible_person_name: 'Sam',
      hazards: [created.hazards[1]!],
    })
    expect(updated.id).toBe(created.id)
    expect(updated.shoot_day_unit_ids).toEqual([day1Units[0]!.id])
    expect(updated.hazards.map((h) => h.name)).toEqual(['Working at height'])
    expect(updated.hospital_name).toBeNull()

    expect(await countRows('risk_assessment_hazards')).toBe(1)
  })

  it('rejects units from another shoot day', async () => {
    const { production, day1, day2Units } = await setup()
    await expect(
      saveRiskAssessment({
        production_id: production.id,
        shoot_day_id: day1,
        shoot_day_unit_ids: [day2Units[0]!.id],
        hazards: [],
      })
    ).rejects.toThrow(/does not belong/)
  })

  it('approve records who and when; guards missing hazards / responsible person', async () => {
    const { production, day1, day1Units } = await setup()
    const empty = await saveRiskAssessment({
      production_id: production.id,
      shoot_day_id: day1,
      shoot_day_unit_ids: [day1Units[0]!.id],
      responsible_person_name: 'Sam',
      hazards: [],
    })
    await expect(approveRiskAssessment(empty.id, 'Boss')).rejects.toThrow(/at least one hazard/)

    const noPerson = await saveRiskAssessment({
      id: empty.id,
      production_id: production.id,
      shoot_day_id: day1,
      shoot_day_unit_ids: [day1Units[0]!.id],
      hazards: [{ ...manualHandling }],
    })
    await expect(approveRiskAssessment(noPerson.id, 'Boss')).rejects.toThrow(/responsible person/)

    await saveRiskAssessment({
      id: empty.id,
      production_id: production.id,
      shoot_day_id: day1,
      shoot_day_unit_ids: [day1Units[0]!.id],
      responsible_person_name: 'Sam',
      hazards: [{ ...manualHandling }],
    })
    const approved = await approveRiskAssessment(empty.id, ' Boss ')
    expect(approved.status).toBe('approved')
    expect(approved.approved_by).toBe('Boss')
    expect(approved.approved_at).toBeTruthy()
  })

  it('editing an approved RAMS reverts it to draft; a no-op save keeps approval', async () => {
    const { production, day1, day1Units } = await setup()
    const base = {
      production_id: production.id,
      shoot_day_id: day1,
      shoot_day_unit_ids: [day1Units[0]!.id],
      responsible_person_name: 'Sam',
      activities: 'Rigging',
      hazards: [{ ...manualHandling }],
    }
    const created = await saveRiskAssessment(base)
    await approveRiskAssessment(created.id, 'Boss')

    const same = await saveRiskAssessment({ ...base, id: created.id, activities: ' Rigging ' })
    expect(same.status).toBe('approved')
    expect(same.approved_by).toBe('Boss')

    const edited = await saveRiskAssessment({
      ...base,
      id: created.id,
      hazards: [{ ...manualHandling, probability_after: 3 }],
    })
    expect(edited.status).toBe('draft')
    expect(edited.approved_by).toBeNull()
    expect(edited.approved_at).toBeNull()
  })

  it('lists summaries with units, hazard count and max residual factor', async () => {
    const { production, day1, day1Units, second } = await setup()
    await saveRiskAssessment({
      production_id: production.id,
      shoot_day_id: day1,
      shoot_day_unit_ids: day1Units.map((u) => u.id),
      responsible_person_name: 'Sam',
      hazards: [
        { ...manualHandling },
        { ...blankHazard(), name: 'Fire', severity_after: 4, probability_after: 3 },
      ],
    })
    const [row] = await listRiskAssessmentsByProduction(production.id)
    expect(row!.hazard_count).toBe(2)
    expect(row!.max_residual_factor).toBe(12)
    expect(row!.shoot_date).toBe('2026-03-01')
    expect(row!.units.map((u) => u.unit_id)).toContain(second.id)
    expect((await listRiskAssessmentsByShootDay(day1))).toHaveLength(1)
  })

  it('duplicates content as drafts onto other days, mapping units', async () => {
    const { production, second, day1, day2, day1Units } = await setup()
    const mainOnly = day1Units.filter((u) => u.unit_id !== second.id)
    const source = await saveRiskAssessment({
      production_id: production.id,
      shoot_day_id: day1,
      shoot_day_unit_ids: mainOnly.map((u) => u.id),
      location_name: 'Warehouse',
      responsible_person_name: 'Sam',
      first_aiders: [{ name: 'Ann', phone: '1', email: 'a@x.com' }],
      hazards: [{ ...manualHandling }],
    })
    await approveRiskAssessment(source.id, 'Boss')

    const [copyId] = await duplicateRiskAssessment(source.id, [day2])
    const copy = (await getRiskAssessment(copyId!))!
    expect(copy.id).not.toBe(source.id)
    expect(copy.shoot_day_id).toBe(day2)
    expect(copy.status).toBe('draft')
    expect(copy.approved_by).toBeNull()
    expect(copy.generated_document_id).toBeNull()
    expect(copy.location_name).toBe('Warehouse')
    expect(copy.first_aiders).toEqual(source.first_aiders)
    expect(copy.hazards).toHaveLength(1)
    expect(copy.hazards[0]!.id).not.toBe(source.hazards[0]!.id)
    expect(copy.hazards[0]!.control_measures).toBe(manualHandling.control_measures)
    const day2Main = (await listShootDayUnitsByShootDay(day2)).map((u) => u.id)
    expect(copy.shoot_day_unit_ids).toEqual(day2Main)

    // Source is untouched.
    expect((await getRiskAssessment(source.id))!.status).toBe('approved')
  })

  it('delete removes the RAMS, hazards, units and the exported PDF document', async () => {
    const { production, day1, day1Units } = await setup()
    const ra = await saveRiskAssessment({
      production_id: production.id,
      shoot_day_id: day1,
      shoot_day_unit_ids: [day1Units[0]!.id],
      responsible_person_name: 'Sam',
      hazards: [{ ...manualHandling }],
    })
    const { documentId } = await persistProductionDocument({
      productionId: production.id,
      fileName: 'rams.pdf',
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'application/pdf',
      entityType: DOCUMENT_ENTITY_TYPES.riskAssessment,
      entityId: day1,
      documentId: 'doc-to-delete',
      extraStatements: buildSetGeneratedDocumentStatements(ra.id, 'doc-to-delete', '2026-01-01T00:00:00Z'),
    })
    expect((await getRiskAssessment(ra.id))!.generated_document_id).toBe(documentId)

    await deleteRiskAssessment(ra.id)

    expect(await getRiskAssessment(ra.id)).toBeNull()
    expect(await getDocumentById(documentId)).toBeNull()
    expect(await listDocumentsByProduction(production.id)).toHaveLength(0)
    expect(deleteAttachmentFileMock).toHaveBeenCalled()
    for (const t of ['risk_assessments', 'risk_assessment_units', 'risk_assessment_hazards']) {
      expect(await countRows(t), t).toBe(0)
    }
  })

  it('deleting only the exported document keeps the RAMS (SET NULL)', async () => {
    const { production, day1, day1Units } = await setup()
    const ra = await saveRiskAssessment({
      production_id: production.id,
      shoot_day_id: day1,
      shoot_day_unit_ids: [day1Units[0]!.id],
      hazards: [],
    })
    const ts = '2026-01-01T00:00:00Z'
    const result = await persistProductionDocument({
      productionId: production.id,
      fileName: 'rams.pdf',
      bytes: new Uint8Array([1]),
      mimeType: 'application/pdf',
      entityType: DOCUMENT_ENTITY_TYPES.riskAssessment,
      entityId: day1,
      documentId: 'doc-fixed-id',
      extraStatements: buildSetGeneratedDocumentStatements(ra.id, 'doc-fixed-id', ts),
    })
    expect((await getRiskAssessment(ra.id))!.generated_document_id).toBe(result.documentId)

    rawDb.exec(`DELETE FROM documents WHERE id = 'doc-fixed-id'`)
    const after = await getRiskAssessment(ra.id)
    expect(after).not.toBeNull()
    expect(after!.generated_document_id).toBeNull()
  })

  it('exporting a PDF links it to the RAMS and replaces the previous export', async () => {
    const { production, day1, day1Units } = await setup()
    const ra = await saveRiskAssessment({
      production_id: production.id,
      shoot_day_id: day1,
      shoot_day_unit_ids: [day1Units[0]!.id],
      location_name: 'Old Mill',
      responsible_person_name: 'Sam',
      hazards: [{ ...manualHandling }],
    })
    const first = await exportRiskAssessmentPdf(ra.id)
    expect(first.fileName).toBe('rams-2026-03-01-old-mill.pdf')
    expect((await getRiskAssessment(ra.id))!.generated_document_id).toBe(first.documentId)

    const second = await exportRiskAssessmentPdf(ra.id)
    expect(second.documentId).not.toBe(first.documentId)
    expect((await getRiskAssessment(ra.id))!.generated_document_id).toBe(second.documentId)

    const docs = await listDocumentsByProduction(production.id)
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ id: second.documentId, entity_type: 'risk_assessment', entity_id: day1 })
  })

  it('manages project hazard templates', async () => {
    const { production } = await setup()
    const t = await upsertHazardTemplate(production.id, { ...manualHandling, name: ' Lifting ' })
    expect(t.name).toBe('Lifting')
    const again = await upsertHazardTemplate(production.id, { ...manualHandling, name: 'Lifting', severity_after: 3 })
    expect(again.id).toBe(t.id)
    expect(again.severity_after).toBe(3)
    expect(await listHazardTemplatesByProduction(production.id)).toHaveLength(1)
    await expect(upsertHazardTemplate(production.id, { ...manualHandling, name: '  ' })).rejects.toThrow()
    await deleteHazardTemplate(t.id)
    expect(await listHazardTemplatesByProduction(production.id)).toHaveLength(0)
  })
})
