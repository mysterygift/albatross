import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>
let dataSourceOverride: 'local_sqlite' | 'remote_server' | null = null

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

vi.mock('@/lib/db/projectDataSource', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/projectDataSource')>()
  return {
    ...actual,
    getEffectiveDataSourceForProduction: vi.fn(async (id: string) =>
      dataSourceOverride ?? actual.getEffectiveDataSourceForProduction(id)
    ),
  }
})

import { createProduction } from '@/lib/db/repositories/production'
import { createScene, createShootDayWithDefaultMainUnit } from '@/lib/db/repositories/schedule'
import {
  SCRIPT_SUPERVISOR_REMOTE_ERROR,
  SLATING_SYSTEM_LOCKED_ERROR,
  createSlate,
  getNextSlatePreview,
  getSlatingSystem,
  setSlatingSystem,
  createTake,
  listSlatesByScene,
  listSlatesByShootDay,
  listTakesBySlateIds,
  softDeleteSlate,
  updateSlate,
  updateTake,
} from '@/lib/db/repositories/scriptSupervisor'
import { getDayLog, saveDayLog, setSceneProgress } from '@/lib/db/repositories/scriptSupervisor'
import { loadShootProgress } from '@/lib/db/scriptSupervisorProgressService'
import {
  createTramline,
  ensureScriptElements,
  listScriptElementsForScene,
  loadLinedScene,
  restoreTramline,
  setTramlineSegment,
  setTramlineSegments,
  softDeleteTramline,
} from '@/lib/db/repositories/scriptLining'
import { layoutLinedScript } from '@/lib/script-supervisor/lining'
import {
  buildContinuityMediaInsert,
  createAnnotation,
  listAnnotationsForScene,
  listAnnotationsForSlate,
  listContinuityMediaForSlate,
  updateAnnotation,
} from '@/lib/db/repositories/scriptAnnotations'
import {
  listScenesShotOnDay,
  loadContinuityDay,
  loadDayCoverage,
  loadMarkedUpScenes,
} from '@/lib/db/scriptSupervisorExportService'
import { buildContinuitySheets, buildEditorsLogCsv } from '@/lib/script-supervisor/continuitySheets'
import { planMarkedUpScript } from '@/lib/script-supervisor/markedUpScript'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

async function setup() {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAllMigrations(db)
  db.exec('PRAGMA foreign_keys = ON')
  dbAdapter = createSqlJsTauriAdapter(db)

  const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
  const scene = await createScene({ production_id: production.id, scene_number: '23', page_eighths: 11 })
  const { shootDay: day1 } = await createShootDayWithDefaultMainUnit({
    productionId: production.id,
    shootDate: '2026-10-06',
  })
  const { shootDay: day2 } = await createShootDayWithDefaultMainUnit({
    productionId: production.id,
    shootDate: '2026-10-07',
  })
  return { production, scene, day1, day2 }
}

describe('script supervisor slates and takes (SS1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataSourceOverride = null
  })

  it('numbers slates consecutively across shoot days, with separate unit series', async () => {
    const { production, scene, day1, day2 } = await setup()
    const base = { production_id: production.id, scene_id: scene.id }

    await createSlate({ ...base, shoot_day_id: day1.id, shot_type: 'master', shot_code: 'WS' })
    await createSlate({ ...base, shoot_day_id: day1.id, shot_type: 'single', shot_code: 'MS' })
    const day2First = await createSlate({ ...base, shoot_day_id: day2.id })
    const secondUnit = await createSlate({ ...base, shoot_day_id: day2.id, slate_prefix: 'x' })

    expect(day2First.slate_number).toBe(3)
    expect(secondUnit.slate_prefix).toBe('X')
    expect(secondUnit.slate_number).toBe(1)
    expect((await listSlatesByShootDay(day1.id)).map((s) => s.slate_number)).toEqual([1, 2])
    expect(await listSlatesByScene(scene.id)).toHaveLength(4)
  })

  it('rejects a live duplicate number but frees it once the slate is deleted', async () => {
    const { production, day1 } = await setup()
    const first = await createSlate({ production_id: production.id, shoot_day_id: day1.id, slate_number: 212 })

    await expect(
      createSlate({ production_id: production.id, shoot_day_id: day1.id, slate_number: 212 })
    ).rejects.toThrow('Slate 212 is already in use')

    const other = await createSlate({ production_id: production.id, shoot_day_id: day1.id })
    expect(other.slate_number).toBe(213)
    await expect(updateSlate(other.id, { slate_number: 212 })).rejects.toThrow('Slate 212 is already in use')

    await softDeleteSlate(first.id)
    const reused = await updateSlate(other.id, { slate_number: 212, lens: '50mm' })
    expect(reused.slate_number).toBe(212)
    expect(reused.lens).toBe('50mm')
  })

  it('logs takes in sequence, clears NG reasons off NG, and deletes takes with their slate', async () => {
    const { production, day1 } = await setup()
    const slate = await createSlate({ production_id: production.id, shoot_day_id: day1.id })

    const t1 = await createTake(slate.id, { status: 'ng', ng_reason: 'focus', duration_ms: 48_000 })
    const t2 = await createTake(slate.id, { duration_ms: 51_400 })
    expect([t1.take_number, t2.take_number]).toEqual([1, 2])
    expect(t1.ng_reason).toBe('focus')

    const printed = await updateTake(t1.id, { status: 'print' })
    expect(printed.status).toBe('print')
    expect(printed.ng_reason).toBeNull()

    await softDeleteSlate(slate.id)
    expect(await listTakesBySlateIds([slate.id])).toEqual([])
    expect(await listSlatesByShootDay(day1.id)).toEqual([])
  })

  it('refuses writes for server-published productions and shoot days from another production', async () => {
    const { production, day1 } = await setup()
    const other = await createProduction({ name: 'Other', notes: null }, { skipBudgetSeed: true })

    await expect(createSlate({ production_id: other.id, shoot_day_id: day1.id })).rejects.toThrow(
      'Shoot day belongs to a different production'
    )

    dataSourceOverride = 'remote_server'
    await expect(createSlate({ production_id: production.id, shoot_day_id: day1.id })).rejects.toThrow(
      SCRIPT_SUPERVISOR_REMOTE_ERROR
    )
  })
})

describe('slating system per production (SS2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataSourceOverride = null
  })

  it('defaults to UK and locks once a slate is logged', async () => {
    const { production, day1 } = await setup()
    expect(await getSlatingSystem(production.id)).toBe('uk')

    const slate = await createSlate({ production_id: production.id, shoot_day_id: day1.id })
    await expect(setSlatingSystem(production.id, 'us')).rejects.toThrow(SLATING_SYSTEM_LOCKED_ERROR)

    await softDeleteSlate(slate.id)
    await setSlatingSystem(production.id, 'us')
    expect(await getSlatingSystem(production.id)).toBe('us')
  })

  it('numbers US slates by scene and setup letter', async () => {
    const { production, scene, day1 } = await setup()
    await setSlatingSystem(production.id, 'us')
    const base = { production_id: production.id, shoot_day_id: day1.id, scene_id: scene.id }

    await expect(createSlate({ production_id: production.id, shoot_day_id: day1.id })).rejects.toThrow(
      'US slating needs a scene'
    )
    const master = await createSlate(base)
    const a = await createSlate(base)
    expect([master.slating_system, master.slate_number, a.slate_number]).toEqual(['us', 1, 2])
    expect((await getNextSlatePreview(production.id, { sceneId: scene.id }))?.label).toBe('23B')

    await expect(createSlate({ ...base, setup_letter: 'A' })).rejects.toThrow('Slate 23A is already in use')
    await expect(createSlate({ ...base, setup_letter: 'I' })).rejects.toThrow('not a setup letter')
    const d = await createSlate({ ...base, setup_letter: 'd' })
    expect(d.slate_number).toBe(5)
  })
})

describe('shooting progress (SS4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataSourceOverride = null
  })

  it('shows a part-shot scene with its slates, takes and credited pages, and per-day pages', async () => {
    const { production, scene, day1, day2 } = await setup()
    const scene10 = await createScene({ production_id: production.id, scene_number: '10', page_eighths: 6 })
    await createScene({ production_id: production.id, scene_number: '2', page_eighths: 8 })

    const a = await createSlate({ production_id: production.id, shoot_day_id: day1.id, scene_id: scene.id })
    await createTake(a.id, { status: 'print' })
    await createTake(a.id, { status: 'ng', ng_reason: 'sound' })
    await createSlate({ production_id: production.id, shoot_day_id: day2.id, scene_id: scene.id })
    await createSlate({ production_id: production.id, shoot_day_id: day2.id, scene_id: scene10.id })

    await setSceneProgress(production.id, scene.id, { marked_status: null, credited_eighths: 4 })
    await setSceneProgress(production.id, scene10.id, { marked_status: 'complete', completed_shoot_day_id: day2.id })

    const progress = await loadShootProgress(production.id)
    expect(progress.rows.map((r) => r.scene.scene_number)).toEqual(['2', '10', '23'])
    const part = progress.rows.find((r) => r.scene.id === scene.id)!
    expect(part).toMatchObject({ status: 'part_shot', slates: 2, takes: 2, prints: 1, shotEighths: 4, totalEighths: 11 })
    expect(progress.totals).toMatchObject({ scenes: 3, complete: 1, partShot: 1, notShot: 1, shotEighths: 10, totalEighths: 25 })
    expect(progress.days.map((d) => [d.shootDate, d.completedEighths, d.slates])).toEqual([
      ['2026-10-06', 0, 1],
      ['2026-10-07', 6, 2],
    ])
  })

  it('needs a shoot day to mark a scene complete', async () => {
    const { production, scene } = await setup()
    await expect(setSceneProgress(production.id, scene.id, { marked_status: 'complete' })).rejects.toThrow(
      'Choose the shoot day the scene was completed on'
    )
  })
})

describe('day log and scene timing (SS5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataSourceOverride = null
  })

  it('saves actual times as a patch and normalises them to HH:MM', async () => {
    const { production, day1 } = await setup()
    await saveDayLog(production.id, day1.id, { first_shot_time: '810', remarks: ' Rain delay ' })
    await saveDayLog(production.id, day1.id, { wrap_time: '19:45' })
    const log = await getDayLog(day1.id)
    expect(log).toMatchObject({ first_shot_time: '08:10', wrap_time: '19:45', remarks: 'Rain delay', call_time: null })
    await expect(saveDayLog(production.id, day1.id, { call_time: '7am' })).rejects.toThrow('is not a time')
  })

  it('keeps earlier scene marks when only timing or notes change', async () => {
    const { production, scene, day1 } = await setup()
    await createSlate({ production_id: production.id, shoot_day_id: day1.id, scene_id: scene.id })
    await setSceneProgress(production.id, scene.id, { marked_status: 'complete', completed_shoot_day_id: day1.id })
    await setSceneProgress(production.id, scene.id, { timed_seconds: 95 })
    await setSceneProgress(production.id, scene.id, { notes: 'Good' })
    const row = (await loadShootProgress(production.id)).rows.find((r) => r.scene.id === scene.id)!
    expect(row).toMatchObject({ status: 'complete', completedShootDayId: day1.id, timedSeconds: 95, notes: 'Good' })
  })
})

describe('lining (SS6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataSourceOverride = null
  })

  async function seedScript(productionId: string, sceneId: string) {
    const ts = '2026-10-01T00:00:00Z'
    await dbAdapter.execute(
      `INSERT INTO script_versions (id, production_id, is_locked, created_at, updated_at) VALUES ('v1', $1, 0, $2, $2)`,
      [productionId, ts]
    )
    const pages: Array<[string, string, number, string]> = [
      ['pg31', '31', 0, 'INT. EDIT SUITE - NIGHT\n\nMonitors glow.\n\nMARCUS\nSince lunch.'],
      ['pg32', '32', 1, 'ELENA\nEvery take but one.\n\nBeat. Marcus pulls up a chair.'],
    ]
    for (const [id, page, index, content] of pages) {
      await dbAdapter.execute(
        `INSERT INTO script_pages (id, script_version_id, scene_id, page_number, page_index, content, created_at, updated_at)
         VALUES ($1, 'v1', $2, $3, $4, $5, $6, $6)`,
        [id, sceneId, page, index, content, ts]
      )
    }
  }

  it('generates elements once and draws tramlines across a page break with labels', async () => {
    const { production, scene, day1 } = await setup()
    await seedScript(production.id, scene.id)
    expect(await ensureScriptElements('v1')).toBe(5)
    expect(await ensureScriptElements('v1')).toBe(5)
    const els = await listScriptElementsForScene('v1', scene.id)

    const master = await createSlate({ production_id: production.id, shoot_day_id: day1.id, scene_id: scene.id, shot_type: 'master', shot_code: 'WS' })
    await createTake(master.id, { status: 'print' })
    const single = await createSlate({ production_id: production.id, shoot_day_id: day1.id, scene_id: scene.id, shot_type: 'single', shot_code: 'MS', description: 'Elena' })
    await createTramline({ slateId: master.id, scriptVersionId: 'v1', startElementId: els[4]!.id, endElementId: els[1]!.id })
    const t2 = await createTramline({ slateId: single.id, scriptVersionId: 'v1', startElementId: els[2]!.id, endElementId: els[3]!.id })
    await setTramlineSegment(t2, els[2]!.id, 'off')
    await expect(
      createTramline({ slateId: single.id, scriptVersionId: 'v1', startElementId: els[2]!.id, endElementId: els[3]!.id })
    ).rejects.toThrow('already has a tramline')

    const lined = await loadLinedScene(production.id, scene.id)
    const layout = layoutLinedScript(lined!.elements, lined!.tramlines)
    expect(layout.columns.map((c) => c.label)).toEqual(['1/1 WS', '2 MS Elena'])
    const pageBreak = layout.rows.find((r) => r.pageBreakBefore)!
    expect(pageBreak.element.page_number).toBe('32')
    expect(pageBreak.cells.map((c) => c.state)).toEqual(['on', 'on'])
    expect(layout.rows[2]!.cells.map((c) => c.state)).toEqual(['on', 'off'])
  })

  it('applies segment changes together and restores a deleted tramline (undo)', async () => {
    const { production, scene, day1 } = await setup()
    await seedScript(production.id, scene.id)
    await ensureScriptElements('v1')
    const els = await listScriptElementsForScene('v1', scene.id)
    const slate = await createSlate({ production_id: production.id, shoot_day_id: day1.id, scene_id: scene.id })
    const t = await createTramline({ slateId: slate.id, scriptVersionId: 'v1', startElementId: els[1]!.id, endElementId: els[4]!.id })

    await setTramlineSegments(t, [
      { elementId: els[2]!.id, state: 'off' },
      { elementId: els[3]!.id, state: 'not_covered' },
    ])
    let lined = await loadLinedScene(production.id, scene.id)
    expect(layoutLinedScript(lined!.elements, lined!.tramlines).rows.map((r) => r.cells[0]?.state ?? null)).toEqual([
      null, 'on', 'off', 'not_covered', 'on',
    ])

    await softDeleteTramline(t)
    expect((await loadLinedScene(production.id, scene.id))!.tramlines).toHaveLength(0)
    await restoreTramline(t)
    lined = await loadLinedScene(production.id, scene.id)
    expect(lined!.tramlines.map((x) => [x.id, x.startElementId, x.endElementId])).toEqual([[t, els[1]!.id, els[4]!.id]])
  })

  it('returns null for a scene that is not in any imported script', async () => {
    const { production, scene } = await setup()
    expect(await loadLinedScene(production.id, scene.id)).toBeNull()
  })
})

describe('notes and continuity photos (SS8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataSourceOverride = null
  })

  it('records a line change against takes and shows it on the scene and the slate', async () => {
    const { production, scene, day1 } = await setup()
    await dbAdapter.execute(
      `INSERT INTO script_versions (id, production_id, is_locked, created_at, updated_at) VALUES ('v1', $1, 0, 't', 't')`,
      [production.id]
    )
    await dbAdapter.execute(
      `INSERT INTO script_pages (id, script_version_id, scene_id, page_number, page_index, content, created_at, updated_at)
       VALUES ('pg', 'v1', $1, '31', 0, 'INT. EDIT SUITE - NIGHT\n\nELENA\nThere is no cutaway.', 't', 't')`,
      [scene.id]
    )
    const lined = await loadLinedScene(production.id, scene.id)
    const speech = lined!.elements[1]!
    const slate = await createSlate({ production_id: production.id, shoot_day_id: day1.id, scene_id: scene.id })
    const t1 = await createTake(slate.id)
    const t2 = await createTake(slate.id)

    const id = await createAnnotation({ elementId: speech.id, kind: 'ad_lib', text: '+ “Nobody ever does.”', slateId: slate.id, takeIds: [t2.id] })
    await expect(createAnnotation({ elementId: speech.id, kind: 'note', text: '   ' })).rejects.toThrow('Write what changed')

    const onScene = await listAnnotationsForScene('v1', scene.id)
    expect(onScene).toHaveLength(1)
    expect(onScene[0]).toMatchObject({ elementId: speech.id, slateLabel: '1', takeNumbers: [2] })

    await updateAnnotation(id, { kind: 'line_change', takeIds: [t1.id, t2.id] })
    expect((await listAnnotationsForSlate(slate.id))[0]).toMatchObject({ kind: 'line_change', takeNumbers: [1, 2] })
  })

  it('files a continuity photo against a take with tidy tags', async () => {
    const { production, scene, day1 } = await setup()
    const slate = await createSlate({ production_id: production.id, shoot_day_id: day1.id, scene_id: scene.id })
    const take = await createTake(slate.id)
    await dbAdapter.execute(
      `INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
       VALUES ('doc1', $1, 'continuity_photo', $2, 'c.jpg', 'attachments/p/doc1-c.jpg', 'image/jpeg', 't', 't')`,
      [production.id, slate.id]
    )
    for (const st of buildContinuityMediaInsert({
      productionId: production.id, documentId: 'doc1', slateId: slate.id, takeId: take.id, sceneId: scene.id, tags: ['Props', 'wardrobe'],
    })) {
      await dbAdapter.execute(st.sql, st.bindValues)
    }
    const photos = await listContinuityMediaForSlate(slate.id)
    expect(photos).toHaveLength(1)
    expect(photos[0]).toMatchObject({ takeNumber: 1, tags: 'wardrobe,props', filePath: 'attachments/p/doc1-c.jpg' })
  })
})

describe('exports (SS9)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataSourceOverride = null
  })

  async function seed() {
    const ctx = await setup()
    const { production, scene, day1 } = ctx
    const other = await createScene({ production_id: production.id, scene_number: '24', page_eighths: 4 })
    await dbAdapter.execute(
      `INSERT INTO script_versions (id, production_id, is_locked, created_at, updated_at) VALUES ('v1', $1, 0, 't', 't')`,
      [production.id]
    )
    await dbAdapter.execute(
      `INSERT INTO script_pages (id, script_version_id, scene_id, page_number, page_index, content, created_at, updated_at)
       VALUES ('pg', 'v1', $1, '31', 0, 'INT. EDIT SUITE - NIGHT\n\nMonitors glow.\n\nELENA\nThere is no cutaway.', 't', 't')`,
      [scene.id]
    )
    const els = (await loadLinedScene(production.id, scene.id))!.elements
    const master = await createSlate({ production_id: production.id, shoot_day_id: day1.id, scene_id: scene.id, shot_type: 'master', shot_code: 'WS', camera_roll: 'A014' })
    const t1 = await createTake(master.id, { status: 'ng', ng_reason: 'focus', duration_ms: 12_000 })
    const t2 = await createTake(master.id, { status: 'print', duration_ms: 95_000 })
    await createTramline({ slateId: master.id, scriptVersionId: 'v1', startElementId: els[1]!.id, endElementId: els[2]!.id })
    await createAnnotation({ elementId: els[2]!.id, kind: 'ad_lib', text: '+ “Nobody ever does.”', slateId: master.id, takeIds: [t2.id] })
    // A second scene slated later the same day, with no script.
    const wild = await createSlate({ production_id: production.id, shoot_day_id: day1.id, scene_id: other.id, sound_mode: 'wild_track' })
    return { ...ctx, other, els, master, wild, t1, t2 }
  }

  it('loads the day for continuity sheets with notes on their lines', async () => {
    const { day1, master } = await seed()
    const slates = await loadContinuityDay(day1.id)
    expect(slates.map((s) => [s.label, s.sceneNumber, s.takes.length])).toEqual([['1', '23', 2], ['2', '24', 0]])
    expect(slates[0]!.notes).toMatchObject([{ kind: 'ad_lib', takeNumbers: [2], excerpt: 'ELENA: There is no cutaway.' }])
    const sheets = buildContinuitySheets({ productionName: 'P', shootDate: '2026-10-06', dayNumber: 1, totalShootDays: 2, slates })
    expect(sheets.sheets[0]).toMatchObject({ slateId: master.id, printed: 'Print 2' })
    expect(sheets.sheets[0]!.scriptNotes).toEqual([{ line: 'ELENA: There is no cutaway.', text: 'T2 · Ad-lib: + “Nobody ever does.”' }])
    const csv = buildEditorsLogCsv({ productionName: 'P', shootDate: '2026-10-06', dayNumber: 1, totalShootDays: 2, slates })
    expect(csv.trimEnd().split('\r\n')).toHaveLength(1 + 2 + 1)
  })

  it('exports marked-up pages from the same layout as the Script view and checks two-tramline coverage', async () => {
    const { production, day1, day2, scene } = await seed()
    const scenes = await listScenesShotOnDay(day1.id)
    expect(scenes.map((s) => s.sceneNumber)).toEqual(['23', '24'])
    expect(await listScenesShotOnDay(day2.id)).toEqual([])

    const { scenes: inputs, missing } = await loadMarkedUpScenes(production.id, scenes)
    expect(missing.map((m) => m.sceneNumber)).toEqual(['24'])
    const lined = await loadLinedScene(production.id, scene.id)
    const onScreen = layoutLinedScript(lined!.elements, lined!.tramlines)
    expect(inputs[0]!.layout).toEqual(onScreen)
    const page = planMarkedUpScript(inputs).pages[0]!
    expect(page.lanes.map((l) => l.label)).toEqual(onScreen.columns.map((c) => c.label))
    expect(page.pieces.map((p) => p.cells.map((c) => c.state))).toEqual(onScreen.rows.map((r) => r.cells.map((c) => c.state)))
    expect(page.pieces.flatMap((p) => p.lines.filter((l) => l.kind === 'note').map((l) => l.text))).toEqual(['T2 · 1 · Ad-lib: + “Nobody ever does.”'])

    const coverage = await loadDayCoverage(production.id, day1.id)
    expect(coverage.map((c) => [c.sceneNumber, c.state, c.underCovered])).toEqual([
      ['23', 'under', 2],
      ['24', 'no_script', 0],
    ])
  })
})
