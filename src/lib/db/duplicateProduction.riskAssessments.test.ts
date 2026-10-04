import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs from 'sql.js'
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
        for (const s of statements) await db.execute(s.sql, s.bindValues)
      }
    ),
  }
})

vi.mock('@/lib/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/files')>()),
  deleteAttachmentFile: vi.fn(async () => {}),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  mkdir: vi.fn(async () => {}),
  readFile: vi.fn(async () => new Uint8Array()),
  writeFile: vi.fn(async () => {}),
}))

import { duplicateProduction } from '@/lib/db/duplicateProduction'
import { createProduction } from '@/lib/db/repositories/production'
import { createShootDay } from '@/lib/db/repositories/schedule'
import { createUnit } from '@/lib/db/repositories/units'
import { getOrCreateShootDayUnit, listShootDayUnitsByShootDay } from '@/lib/db/repositories/shoot-day-units'
import { listRiskAssessmentsByProduction, saveRiskAssessment, getRiskAssessment, approveRiskAssessment } from '@/lib/db/repositories/risk-assessments'
import { listHazardTemplatesByProduction, upsertHazardTemplate } from '@/lib/db/repositories/hazard-templates'
import { BUILT_IN_HAZARDS } from '@/lib/risk-assessments/builtInHazards'

describe('duplicateProduction — risk assessments', () => {
  beforeEach(async () => {
    const SQL = await initSqlJs({})
    const db = new SQL.Database()
    const dir = join(process.cwd(), 'src-tauri/migrations')
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, f), 'utf8'))
    db.exec('PRAGMA foreign_keys = ON')
    dbAdapter = createSqlJsTauriAdapter(db)
  })

  it('copies RAMS, units, hazards, templates and re-links the exported PDF', async () => {
    const source = await createProduction({ name: 'Source', notes: null })
    const second = await createUnit({ production_id: source.id, name: 'Second Unit' })
    const day = (await createShootDay({ production_id: source.id, shoot_date: '2026-04-01' })).id
    await getOrCreateShootDayUnit(day, second.id)
    const sdus = await listShootDayUnitsByShootDay(day)

    const ra = await saveRiskAssessment({
      production_id: source.id,
      shoot_day_id: day,
      shoot_day_unit_ids: sdus.map((u) => u.id),
      location_name: 'Quarry',
      responsible_person_name: 'Sam',
      first_aiders: [{ name: 'Ann', phone: '1', email: '' }],
      hazards: [{ ...BUILT_IN_HAZARDS[0]! }],
    })
    await approveRiskAssessment(ra.id, 'Boss')
    await dbAdapter.execute(
      `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
       VALUES ('doc-src', $1, 'risk_assessment', $2, 'rams.pdf', 'attachments/x/rams.pdf', 'application/pdf', 't', 't')`,
      [source.id, day]
    )
    await dbAdapter.execute(`UPDATE risk_assessments SET generated_document_id = 'doc-src' WHERE id = $1`, [ra.id])
    await upsertHazardTemplate(source.id, { ...BUILT_IN_HAZARDS[0]!, name: 'Saved hazard' })

    const copy = await duplicateProduction(source.id, 'Copy')

    const [copied] = await listRiskAssessmentsByProduction(copy.id)
    expect(copied).toBeDefined()
    expect(copied!.id).not.toBe(ra.id)
    expect(copied!.status).toBe('approved')
    expect(copied!.location_name).toBe('Quarry')
    expect(copied!.hazard_count).toBe(1)

    const full = (await getRiskAssessment(copied!.id))!
    expect(full.first_aiders).toEqual([{ name: 'Ann', phone: '1', email: '' }])
    // Units point at the copy's shoot-day units, not the source's.
    const newDayRows = await dbAdapter.select<{ id: string }[]>(`SELECT id FROM shoot_days WHERE production_id = $1`, [copy.id])
    expect(full.shoot_day_id).toBe(newDayRows[0]!.id)
    const newSdus = (await listShootDayUnitsByShootDay(full.shoot_day_id)).map((u) => u.id).sort()
    expect([...full.shoot_day_unit_ids].sort()).toEqual(newSdus)
    expect(newSdus).toHaveLength(2)

    // The PDF link and document entity follow the copy.
    const newDoc = await dbAdapter.select<{ id: string; entity_id: string }[]>(
      `SELECT id, entity_id FROM documents WHERE production_id = $1 AND entity_type = 'risk_assessment'`,
      [copy.id]
    )
    expect(newDoc).toHaveLength(1)
    expect(newDoc[0]!.id).not.toBe('doc-src')
    expect(newDoc[0]!.entity_id).toBe(full.shoot_day_id)
    expect(full.generated_document_id).toBe(newDoc[0]!.id)

    expect((await listHazardTemplatesByProduction(copy.id)).map((t) => t.name)).toEqual(['Saved hazard'])
    // Source untouched.
    expect((await listRiskAssessmentsByProduction(source.id))).toHaveLength(1)
  })
})
