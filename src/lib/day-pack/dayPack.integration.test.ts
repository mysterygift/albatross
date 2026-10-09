import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'

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

/** Saved PDFs "on disk", keyed by app-data relative path. */
const appDataFiles = new Map<string, Uint8Array>()
vi.mock('@/lib/files/appDataObjectUrl', () => ({
  readAppDataBytes: async (path: string) => {
    const bytes = appDataFiles.get(path)
    if (!bytes) throw new Error(`missing ${path}`)
    return bytes
  },
}))
vi.mock('@/lib/files/storyboard', () => ({ readStoryboardImageBytes: async () => new Uint8Array() }))

import { setTestDataEncryptionKeyForTests } from '@/lib/security/dataEncryptionContext'
import { createProduction } from '@/lib/db/repositories/production'
import { createScene, createShootDayWithDefaultMainUnit, createShot } from '@/lib/db/repositories/schedule'
import { addUnitToShootDays } from '@/lib/db/repositories/shoot-day-unit-ranks'
import { createShotStrip } from '@/lib/db/repositories/stripboard-strips'
import { upsertCallSheet } from '@/lib/db/repositories/call-sheets'
import { createBooking } from '@/lib/db/repositories/booking'
import { saveRiskAssessment } from '@/lib/db/repositories/risk-assessments'
import { createFloorPlan, saveFloorPlanSetup } from '@/lib/db/repositories/floor-plans'
import { loadScheduleExportSources } from '@/lib/schedule/scheduleExportSources'
import { loadDayPackSources, type DayPackSource } from '@/lib/day-pack/loadDayPackSources'
import { loadDayPackRecipients } from '@/lib/day-pack/loadDayPackRecipients'
import { buildDayPackFiles, type DayPackFileIo } from '@/lib/day-pack/buildDayPackFiles'

async function makeDb(): Promise<void> {
  const SQL = await initSqlJs({})
  const db: Database = new SQL.Database()
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
  db.exec('PRAGMA foreign_keys = ON')
  dbAdapter = createSqlJsTauriAdapter(db)
}

async function insertPerson(productionId: string, id: string, name: string, isCast: boolean, email: string | null) {
  await dbAdapter.execute(
    `INSERT INTO people (id, production_id, name, is_cast, email, department, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 't', 't')`,
    [id, productionId, name, isCast ? 1 : 0, email, isCast ? 'Cast' : 'Camera']
  )
}

async function insertDocument(productionId: string, id: string, entityType: string, entityId: string, fileName: string, createdAt: string) {
  const path = `attachments/${productionId}/${id}-${fileName}`
  await dbAdapter.execute(
    `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'application/pdf', $7, $7)`,
    [id, productionId, entityType, entityId, fileName, path, createdAt]
  )
  const doc = await PDFDocument.create()
  doc.addPage()
  appDataFiles.set(path, await doc.save())
}

/** A three-unit day: a shot on Second Unit, crew booked to the whole day, to Second and to Third. */
async function setup() {
  await makeDb()
  const production = await createProduction({ name: 'The Albatross', notes: null }, { skipBudgetSeed: true })
  const scene = await createScene({ production_id: production.id, scene_number: '4' })
  const { shot } = await createShot({ scene_id: scene.id, shot_number: '4A' })
  const day = await createShootDayWithDefaultMainUnit({ productionId: production.id, shootDate: '2026-10-14' })
  const second = (await addUnitToShootDays({ productionId: production.id, shootDayIds: [day.shootDay.id] }))
    .linkedShootDayUnitIds[0]!
  const third = (await addUnitToShootDays({ productionId: production.id, shootDayIds: [day.shootDay.id] }))
    .linkedShootDayUnitIds[0]!
  await createShotStrip(production.id, shot.id, day.shootDay.id, second)

  await insertPerson(production.id, 'cast-ada', 'Ada Lovelace', true, 'ada@example.com')
  // Shots carry their own cast; the call sheet reads shot cast when shots are scheduled.
  await dbAdapter.execute(
    `INSERT INTO shot_cast (id, production_id, shot_id, person_id, created_at, updated_at) VALUES ('shc-1', $1, $2, 'cast-ada', 't', 't')`,
    [production.id, shot.id]
  )
  await insertPerson(production.id, 'crew-all', 'Whole Day', false, 'all@example.com')
  await insertPerson(production.id, 'crew-second', 'Second Only', false, null)
  await insertPerson(production.id, 'crew-third', 'Third Only', false, 'third@example.com')
  const d = day.shootDay.id
  await createBooking({ production_id: production.id, person_id: 'cast-ada', shoot_day_id: d })
  await createBooking({ production_id: production.id, person_id: 'crew-all', shoot_day_id: d })
  await createBooking({ production_id: production.id, person_id: 'crew-second', shoot_day_id: d, shoot_day_unit_id: second })
  await createBooking({ production_id: production.id, person_id: 'crew-third', shoot_day_id: d, shoot_day_unit_id: third })

  return { production, scene, shot, day, main: day.shootDayUnitId, second, third }
}

const byKind = (sources: DayPackSource[]) => new Map(sources.map((s) => [s.kind, s]))

describe('day pack', () => {
  beforeEach(() => {
    appDataFiles.clear()
    setTestDataEncryptionKeyForTests(new Uint8Array(32).fill(7))
  })

  it('reports each document for the unit: saved, stale, missing, generated or empty', async () => {
    const { production, day, main, second } = await setup()
    // Call sheet saved long ago (stale); movement order saved in the future (ready).
    await insertDocument(production.id, 'doc-cs', 'call_sheet', day.shootDay.id, 'call-sheet.pdf', '2000-01-01T00:00:00.000Z')
    await upsertCallSheet({ production_id: production.id, shoot_day_id: day.shootDay.id, shoot_day_unit_id: second, generated_document_id: 'doc-cs' })
    await insertDocument(production.id, 'doc-mo', 'movement_order', day.shootDay.id, 'movement-order-2026-10-14-second-unit.pdf', '2999-01-01T00:00:00.000Z')
    await saveRiskAssessment({ production_id: production.id, shoot_day_id: day.shootDay.id, shoot_day_unit_ids: [second], hazards: [], location_name: 'Harbour' })

    const forSecond = byKind((await loadDayPackSources({ productionId: production.id, shootDayId: day.shootDay.id, shootDayUnitId: second })).sources)
    expect(forSecond.get('call_sheet')?.status).toBe('stale')
    expect(forSecond.get('movement_order')?.status).toBe('ready')
    expect(forSecond.get('risk_assessments')?.status).toBe('ready')
    expect(forSecond.get('risk_assessments')?.warning).toMatch(/Not signed off/)
    expect(forSecond.get('shooting_schedule')?.status).toBe('ready')
    expect(forSecond.get('shot_list')?.status).toBe('ready')
    expect(forSecond.get('storyboard')?.status).toBe('empty')
    expect(forSecond.get('sides')?.status).toBe('empty')

    const forMain = byKind((await loadDayPackSources({ productionId: production.id, shootDayId: day.shootDay.id, shootDayUnitId: main })).sources)
    expect(forMain.get('call_sheet')?.status).toBe('missing')
    expect(forMain.get('movement_order')?.status).toBe('missing')
    expect(forMain.get('risk_assessments')?.status).toBe('missing')
    expect(forMain.get('shooting_schedule')?.status).toBe('empty')
  })

  it('sends a unit pack to its cast, its crew and whole-day crew only', async () => {
    const { production, day, second, third } = await setup()
    const sched = await loadScheduleExportSources(production.id)

    const forSecond = await loadDayPackRecipients({ sched, shootDayId: day.shootDay.id, shootDayUnitId: second })
    expect(forSecond.map((r) => [r.fullName, r.type, r.email, r.bookedFor])).toEqual([
      ['Ada Lovelace', 'cast', 'ada@example.com', 'all'],
      ['Second Only', 'crew', null, 'unit'],
      ['Whole Day', 'crew', 'all@example.com', 'all'],
    ])

    // No scenes on Third Unit, so no cast; its own crew plus whole-day crew.
    const forThird = await loadDayPackRecipients({ sched, shootDayId: day.shootDay.id, shootDayUnitId: third })
    expect(forThird.map((r) => r.fullName)).toEqual(['Third Only', 'Whole Day'])
  })

  it('writes a watermarked copy of every document for every recipient, clearing the old pack first', async () => {
    const { production, day, second } = await setup()
    await insertDocument(production.id, 'doc-cs', 'call_sheet', day.shootDay.id, 'call-sheet.pdf', '2999-01-01T00:00:00.000Z')
    await upsertCallSheet({ production_id: production.id, shoot_day_id: day.shootDay.id, shoot_day_unit_id: second, generated_document_id: 'doc-cs' })
    const sched = await loadScheduleExportSources(production.id)
    const { context, sources } = await loadDayPackSources({ productionId: production.id, shootDayId: day.shootDay.id, shootDayUnitId: second, sched })
    const recipients = await loadDayPackRecipients({ sched, shootDayId: day.shootDay.id, shootDayUnitId: second })

    const written = new Map<string, Uint8Array>()
    const removed: string[] = []
    const io: DayPackFileIo = {
      exists: async () => true,
      removeDir: async (p) => void removed.push(p),
      mkdir: async () => {},
      writeFile: async (p, bytes) => void written.set(p, bytes),
    }
    const selected = sources.filter((s) => s.kind === 'call_sheet' || s.kind === 'shot_list')
    const result = await buildDayPackFiles({ context, sources: selected, recipients, io })

    const folder = `day-packs/${production.id}/2026-10-14-second-unit`
    expect(result.folder).toBe(folder)
    expect(removed).toEqual([folder])
    expect(result.people.map((p) => p.files.map((f) => f.fileName))).toEqual([
      ['call-sheet-2026-10-14-second-unit-ada-lovelace.pdf', 'shot-list-2026-10-14-second-unit-ada-lovelace.pdf'],
      ['call-sheet-2026-10-14-second-unit-second-only.pdf', 'shot-list-2026-10-14-second-unit-second-only.pdf'],
      ['call-sheet-2026-10-14-second-unit-whole-day.pdf', 'shot-list-2026-10-14-second-unit-whole-day.pdf'],
    ])
    expect(written.size).toBe(6)
    const first = written.get(`${folder}/ada-lovelace/call-sheet-2026-10-14-second-unit-ada-lovelace.pdf`)!
    expect((await PDFDocument.load(first)).getPageCount()).toBe(1)
  })

  it('includes the floor plan setups for the shots on the unit', async () => {
    const { production, scene, shot, day, main, second } = await setup()
    await dbAdapter.execute(
      `INSERT INTO locations (id, production_id, name, address, created_at, updated_at) VALUES ('loc-1', $1, 'Harbour', '1 Quay', 't', 't')`,
      [production.id]
    )
    const plan = await createFloorPlan({ productionId: production.id, locationId: 'loc-1', name: 'Quayside' })
    await saveFloorPlanSetup({
      productionId: production.id,
      floorPlanId: plan.id,
      sceneId: scene.id,
      shotId: shot.id,
      markers: [{ id: 'cam', kind: 'camera', x: 100, y: 100, rotation: 0, label: 'A' }],
    })

    const forSecond = byKind((await loadDayPackSources({ productionId: production.id, shootDayId: day.shootDay.id, shootDayUnitId: second })).sources)
    const floorPlans = forSecond.get('floor_plans')!
    expect(floorPlans.status).toBe('ready')
    expect(floorPlans.detail).toBe('Generated: 1 setup on 1 plan')
    const [file] = await floorPlans.render()
    expect(file!.stem).toBe('floor-plans')
    expect((await PDFDocument.load(file!.bytes)).getPageCount()).toBe(1)

    // Nothing on Main Unit, so nothing to send.
    const forMain = byKind((await loadDayPackSources({ productionId: production.id, shootDayId: day.shootDay.id, shootDayUnitId: main })).sources)
    expect(forMain.get('floor_plans')?.status).toBe('empty')
  })
})
