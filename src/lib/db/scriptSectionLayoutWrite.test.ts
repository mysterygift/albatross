import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
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

import { createProduction } from '@/lib/db/repositories/production'
import { createScene, createShootDayWithDefaultMainUnit, createShot } from '@/lib/db/repositories/schedule'
import { createScriptVersion } from '@/lib/db/repositories/scriptVersions'
import { createScriptPage } from '@/lib/db/repositories/scriptPages'
import { createShotStrip } from '@/lib/db/repositories/stripboard-strips'
import { createSlate, createTake, setSceneProgress } from '@/lib/db/repositories/scriptSupervisor'
import {
  applyScriptSectionLayout,
  createSectionWithRangesAndCharacters,
  linkShotToSection,
  listRangesByScriptVersion,
  listSectionsByScriptVersion,
  listShotsBySection,
} from '@/lib/db/repositories/scriptSections'
import { buildSceneLines, rangeForRun, type LineRun } from '@/lib/db/scriptSectionLayout'
import { loadScriptVersionSectionProgress } from '@/lib/db/scriptSectionStatusService'
import { deriveSectionStatus } from '@/lib/db/scriptSectionStatus'
import type { ScriptPage } from '@/lib/db/types'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

const TEXT = Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? 'MAGGIE' : `Line ${i} of the scene.`)).join('\n')

async function setup() {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAllMigrations(db)
  db.exec('PRAGMA foreign_keys = ON')
  dbAdapter = createSqlJsTauriAdapter(db)

  const production = await createProduction({ name: 'Layout test', notes: null }, { skipBudgetSeed: true })
  const scene = await createScene({ production_id: production.id, scene_number: '12' })
  const version = await createScriptVersion({ production_id: production.id, title: 'Shooting Script' })
  const page: ScriptPage = await createScriptPage({
    script_version_id: version.id,
    scene_id: scene.id,
    page_number: '14',
    page_index: 0,
    content: TEXT,
  })
  const lines = buildSceneLines([page])
  const make = async (run: LineRun) =>
    createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'action',
      is_manual: false,
      ranges: [rangeForRun(lines, run)],
    })
  const a = await make({ from: 0, to: 3 })
  const b = await make({ from: 4, to: 7 })
  const c = await make({ from: 8, to: 11 })
  const d = await make({ from: 12, to: 15 })
  const shot = async (n: string) => (await createShot({ scene_id: scene.id, shot_number: n })).shot
  return { production, scene, version, lines, a, b, c, d, shot }
}

const base = (ctx: Awaited<ReturnType<typeof setup>>) => ({
  production_id: ctx.production.id,
  script_version_id: ctx.version.id,
  scene_id: ctx.scene.id,
  episode_id: null,
})

describe('applyScriptSectionLayout', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reshapes the edited section, trims a neighbour and moves an absorbed neighbour’s shots', async () => {
    const ctx = await setup()
    const shotC = await ctx.shot('12C')
    await linkShotToSection(shotC.id, ctx.c.id)

    await applyScriptSectionLayout({
      ...base(ctx),
      current: { id: ctx.b.id, label: null, cut: false, range: rangeForRun(ctx.lines, { from: 2, to: 11 }), characters: [] },
      updates: [{ sectionId: ctx.a.id, range: rangeForRun(ctx.lines, { from: 0, to: 1 }), characters: [] }],
      removals: [ctx.c.id],
      splits: [],
    })

    const sections = await listSectionsByScriptVersion(ctx.version.id)
    expect(sections.map((s) => s.id).sort()).toEqual([ctx.a.id, ctx.b.id, ctx.d.id].sort())
    expect(sections.find((s) => s.id === ctx.b.id)!.ranges_user_edited).toBe(1)
    expect(sections.find((s) => s.id === ctx.a.id)!.ranges_user_edited).toBe(1)

    const ranges = await listRangesByScriptVersion(ctx.version.id)
    expect(ranges.get(ctx.b.id)).toHaveLength(1)
    expect(ranges.get(ctx.b.id)![0]).toMatchObject({
      start_offset: ctx.lines[2]!.startOffset,
      end_offset: ctx.lines[11]!.endOffset,
    })
    expect(ranges.get(ctx.a.id)![0]!.end_offset).toBe(ctx.lines[1]!.endOffset)
    expect((await listShotsBySection(ctx.b.id)).map((s) => s.shot_number)).toEqual(['12C'])
  })

  it('creates a section and carves a split-off section that keeps the source’s shots', async () => {
    const ctx = await setup()
    const shotC = await ctx.shot('12C')
    await linkShotToSection(shotC.id, ctx.c.id)

    const newId = await applyScriptSectionLayout({
      ...base(ctx),
      current: { id: null, label: 'Scene 12 — insert', cut: false, range: rangeForRun(ctx.lines, { from: 9, to: 9 }), characters: [] },
      updates: [{ sectionId: ctx.c.id, range: rangeForRun(ctx.lines, { from: 8, to: 8 }), characters: [] }],
      removals: [],
      splits: [{ sourceSectionId: ctx.c.id, label: 'Scene 12 — tail', range: rangeForRun(ctx.lines, { from: 10, to: 11 }), characters: [] }],
    })

    const sections = await listSectionsByScriptVersion(ctx.version.id)
    expect(sections).toHaveLength(6)
    const created = sections.find((s) => s.id === newId)!
    expect(created).toMatchObject({ is_manual: 1, section_type: 'custom', status: 'unplanned', label: 'Scene 12 — insert' })
    const tail = sections.find((s) => s.label === 'Scene 12 — tail')!
    expect(tail.section_type).toBe('action')
    expect((await listShotsBySection(tail.id)).map((s) => s.shot_number)).toEqual(['12C'])
    expect((await listShotsBySection(ctx.c.id)).map((s) => s.shot_number)).toEqual(['12C'])
  })

  it('stores Cut as the omitted status', async () => {
    const ctx = await setup()
    await applyScriptSectionLayout({
      ...base(ctx),
      current: { id: ctx.d.id, label: null, cut: true, range: rangeForRun(ctx.lines, { from: 12, to: 15 }), characters: [] },
      updates: [],
      removals: [],
      splits: [],
    })
    const d = (await listSectionsByScriptVersion(ctx.version.id)).find((s) => s.id === ctx.d.id)!
    expect(d.status).toBe('omitted')
  })
})

describe('loadScriptVersionSectionProgress', () => {
  beforeEach(() => vi.clearAllMocks())

  it('derives Covered, Scheduled and Shot from links, the stripboard and printed takes', async () => {
    const ctx = await setup()
    const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: ctx.production.id,
      shootDate: '2026-10-08',
    })
    const covered = await ctx.shot('12A')
    const scheduled = await ctx.shot('12B')
    const shot = await ctx.shot('12C')
    await linkShotToSection(covered.id, ctx.a.id)
    await linkShotToSection(scheduled.id, ctx.b.id)
    await linkShotToSection(shot.id, ctx.c.id)
    await createShotStrip(ctx.production.id, scheduled.id, shootDay.id, shootDayUnitId)
    await createShotStrip(ctx.production.id, shot.id, shootDay.id, shootDayUnitId)
    const slate = await createSlate({
      production_id: ctx.production.id,
      shoot_day_id: shootDay.id,
      scene_id: ctx.scene.id,
      shot_id: shot.id,
    })
    await createTake(slate.id, { status: 'print' })

    const progress = await loadScriptVersionSectionProgress(ctx.production.id, ctx.version.id)
    const statusOf = (id: string) =>
      deriveSectionStatus({ cut: false, shots: progress.shotsBySectionId.get(id) ?? [] })
    expect(statusOf(ctx.a.id)).toBe('covered')
    expect(statusOf(ctx.b.id)).toBe('scheduled')
    expect(statusOf(ctx.c.id)).toBe('shot')
    expect(statusOf(ctx.d.id)).toBe('no_coverage')
    expect(progress.shotsBySectionId.get(ctx.c.id)![0]!.printedTakes[0]).toMatch(/^Slate \d+ T1$/)
    expect(progress.shotsBySectionId.get(ctx.b.id)![0]!.shootDays[0]!.id).toBe(shootDay.id)
  })

  it('counts a scene the script supervisor marked complete as shot, and omitted as cut', async () => {
    const ctx = await setup()
    const { shootDay } = await createShootDayWithDefaultMainUnit({
      productionId: ctx.production.id,
      shootDate: '2026-10-08',
    })
    const s = await ctx.shot('12A')
    await linkShotToSection(s.id, ctx.a.id)
    await setSceneProgress(ctx.production.id, ctx.scene.id, {
      marked_status: 'complete',
      completed_shoot_day_id: shootDay.id,
    })
    let progress = await loadScriptVersionSectionProgress(ctx.production.id, ctx.version.id)
    expect(deriveSectionStatus({ cut: false, shots: progress.shotsBySectionId.get(ctx.a.id)! })).toBe('shot')

    await setSceneProgress(ctx.production.id, ctx.scene.id, { marked_status: 'omitted' })
    progress = await loadScriptVersionSectionProgress(ctx.production.id, ctx.version.id)
    expect(progress.omittedSceneIds.has(ctx.scene.id)).toBe(true)
  })
})
