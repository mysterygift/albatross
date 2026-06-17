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
import {
  createScene,
  createShootDayWithDefaultMainUnit,
  createShot,
} from '@/lib/db/repositories/schedule'
import { createScriptVersion } from '@/lib/db/repositories/scriptVersions'
import {
  createSectionWithRangesAndCharacters,
  linkShotToSection,
  linkShotToSections,
} from '@/lib/db/repositories/scriptSections'
import { createShotStrip, createStrip } from '@/lib/db/repositories/stripboard-strips'
import { createUnit } from '@/lib/db/repositories/units'
import { getOrCreateShootDayUnit } from '@/lib/db/repositories/shoot-day-units'
import { deriveShootDayScriptSections } from '@/lib/db/shootDayScriptSectionsService'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAllMigrations(db)
  db.exec('PRAGMA foreign_keys = ON')
  dbAdapter = createSqlJsTauriAdapter(db)
  return db
}

// span = (endPage-1)*8 + endEighth - ((startPage-1)*8 + startEighth)
function range(startPage: string, startEighth: number, endPage: string, endEighth: number) {
  return { start_page: startPage, start_eighth: startEighth, end_page: endPage, end_eighth: endEighth }
}

describe('shoot-day script sections derivation (SB5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataSourceOverride = null
  })

  it('derives shot-linked sections from scheduled scenes', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '1' })
    const version = await createScriptVersion({ production_id: production.id, title: 'Script' })
    const section = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'dialogue',
      ranges: [range('1', 0, '1', 4)],
      characters: [{ character_name: 'JANE' }],
    })
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    await linkShotToSection(shot.id, section.id)

    const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    await createShotStrip(production.id, shot.id, shootDay.id, shootDayUnitId)

    const summary = await deriveShootDayScriptSections(shootDay.id)

    expect(summary.productionId).toBe(production.id)
    expect(summary.sceneIds).toEqual([scene.id])
    expect(summary.includedSectionIds).toEqual([section.id])
    expect(summary.fallbackSectionIds).toEqual([])
    expect(summary.linkedShotIds).toEqual([shot.id])
    expect(summary.scriptVersionIds).toEqual([version.id])
    expect(summary.totalEstimatedEighths).toBe(4)
    expect(summary.characterNames).toEqual(['JANE'])
    expect(summary.warnings).toEqual([])
  })

  it('falls back to the full-scene section when no shot-linked sections exist', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '1' })
    const version = await createScriptVersion({ production_id: production.id, title: 'Script' })
    const wholeScene = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'action',
      label: 'Scene 1 — Full Scene',
      ranges: [range('1', 0, '2', 0)], // span 8
    })
    await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'dialogue',
      ranges: [range('1', 0, '1', 4)], // span 4
    })

    const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    // Schedule the scene directly (no shot links).
    await createStrip({
      production_id: production.id,
      shoot_day_id: shootDay.id,
      shoot_day_unit_id: shootDayUnitId,
      strip_type: 'SCENE',
      scene_id: scene.id,
    })

    const summary = await deriveShootDayScriptSections(shootDay.id)

    expect(summary.includedSectionIds).toEqual([])
    expect(summary.fallbackSectionIds).toEqual([wholeScene.id])
    expect(summary.totalEstimatedEighths).toBe(8)
    expect(summary.warnings.map((w) => w.code)).toContain('scene_fallback_full_scene')
  })

  it('warns when a scheduled scene has no script sections', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '1' })

    const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    await createStrip({
      production_id: production.id,
      shoot_day_id: shootDay.id,
      shoot_day_unit_id: shootDayUnitId,
      strip_type: 'SCENE',
      scene_id: scene.id,
    })

    const summary = await deriveShootDayScriptSections(shootDay.id)

    expect(summary.includedSectionIds).toEqual([])
    expect(summary.fallbackSectionIds).toEqual([])
    const warning = summary.warnings.find((w) => w.code === 'scene_no_sections')
    expect(warning?.sceneId).toBe(scene.id)
  })

  it('warns when a scheduled shot has no linked section', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '1' })
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })

    const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    await createShotStrip(production.id, shot.id, shootDay.id, shootDayUnitId)

    const summary = await deriveShootDayScriptSections(shootDay.id)

    expect(summary.linkedShotIds).toEqual([])
    const warning = summary.warnings.find((w) => w.code === 'shot_no_linked_section')
    expect(warning?.shotId).toBe(shot.id)
  })

  it('calculates total estimated eighths across included sections', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '1' })
    const version = await createScriptVersion({ production_id: production.id, title: 'Script' })
    const sectionA = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'dialogue',
      ranges: [range('1', 0, '1', 4)], // span 4
    })
    const sectionB = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'action',
      ranges: [range('1', 0, '2', 0)], // span 8
    })
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    await linkShotToSections(shot.id, [sectionA.id, sectionB.id])

    const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    await createShotStrip(production.id, shot.id, shootDay.id, shootDayUnitId)

    const summary = await deriveShootDayScriptSections(shootDay.id)
    expect(summary.totalEstimatedEighths).toBe(12)
  })

  it('detects partial-scene coverage', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({
      production_id: production.id,
      scene_number: '1',
      page_eighths: 8,
    })
    const version = await createScriptVersion({ production_id: production.id, title: 'Script' })
    const section = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'dialogue',
      ranges: [range('1', 0, '1', 4)], // span 4 < 8
    })
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    await linkShotToSection(shot.id, section.id)

    const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    await createShotStrip(production.id, shot.id, shootDay.id, shootDayUnitId)

    const summary = await deriveShootDayScriptSections(shootDay.id)
    expect(summary.partialSceneIds).toEqual([scene.id])
  })

  it('scopes derivation to a single shoot-day unit', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const version = await createScriptVersion({ production_id: production.id, title: 'Script' })

    const sceneMain = await createScene({ production_id: production.id, scene_number: '1' })
    const sectionMain = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: sceneMain.id,
      section_type: 'dialogue',
      ranges: [range('1', 0, '1', 4)],
    })
    const { shot: shotMain } = await createShot({ scene_id: sceneMain.id, shot_number: '1A' })
    await linkShotToSection(shotMain.id, sectionMain.id)

    const sceneSecond = await createScene({ production_id: production.id, scene_number: '2' })
    const sectionSecond = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: sceneSecond.id,
      section_type: 'dialogue',
      ranges: [range('2', 0, '2', 4)],
    })
    const { shot: shotSecond } = await createShot({ scene_id: sceneSecond.id, shot_number: '2A' })
    await linkShotToSection(shotSecond.id, sectionSecond.id)

    const { shootDay, shootDayUnitId: mainUnitDayId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    await createShotStrip(production.id, shotMain.id, shootDay.id, mainUnitDayId)

    const secondUnit = await createUnit({ production_id: production.id, name: '2nd Unit' })
    const secondUnitDay = await getOrCreateShootDayUnit(shootDay.id, secondUnit.id)
    await createShotStrip(production.id, shotSecond.id, shootDay.id, secondUnitDay.id)

    const mainSummary = await deriveShootDayScriptSections(shootDay.id, {
      shootDayUnitId: mainUnitDayId,
    })
    expect(mainSummary.unitId).toBeTruthy()
    expect(mainSummary.sceneIds).toEqual([sceneMain.id])
    expect(mainSummary.includedSectionIds).toEqual([sectionMain.id])

    const secondSummary = await deriveShootDayScriptSections(shootDay.id, {
      shootDayUnitId: secondUnitDay.id,
    })
    expect(secondSummary.unitId).toBe(secondUnit.id)
    expect(secondSummary.sceneIds).toEqual([sceneSecond.id])
    expect(secondSummary.includedSectionIds).toEqual([sectionSecond.id])
  })

  it('warns when included sections span mixed script versions', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '1' })
    const versionA = await createScriptVersion({ production_id: production.id, title: 'v1' })
    const versionB = await createScriptVersion({ production_id: production.id, title: 'v2' })
    const sectionA = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: versionA.id,
      scene_id: scene.id,
      section_type: 'dialogue',
      ranges: [range('1', 0, '1', 4)],
    })
    const sectionB = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: versionB.id,
      scene_id: scene.id,
      section_type: 'action',
      ranges: [range('1', 4, '1', 8)],
    })
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    await linkShotToSections(shot.id, [sectionA.id, sectionB.id])

    const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    await createShotStrip(production.id, shot.id, shootDay.id, shootDayUnitId)

    const summary = await deriveShootDayScriptSections(shootDay.id)
    expect(summary.scriptVersionIds.sort()).toEqual([versionA.id, versionB.id].sort())
    expect(summary.warnings.map((w) => w.code)).toContain('mixed_script_version')
  })

  it('warns when a linked section references an older script revision than latest', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '1' })
    const older = await createScriptVersion({
      production_id: production.id,
      title: 'Old',
      version_label: 'v1',
    })
    const newer = await createScriptVersion({
      production_id: production.id,
      title: 'New',
      version_label: 'v2',
    })
    await dbAdapter.execute(
      `UPDATE script_versions SET created_at = $1 WHERE id = $2`,
      ['2000-01-01T00:00:00.000Z', older.id]
    )
    await dbAdapter.execute(
      `UPDATE script_versions SET created_at = $1 WHERE id = $2`,
      ['2000-01-02T00:00:00.000Z', newer.id]
    )
    const section = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: older.id,
      scene_id: scene.id,
      section_type: 'dialogue',
      ranges: [range('1', 0, '1', 4)],
    })
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    await linkShotToSection(shot.id, section.id)

    const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    await createShotStrip(production.id, shot.id, shootDay.id, shootDayUnitId)

    const summary = await deriveShootDayScriptSections(shootDay.id)
    expect(summary.warnings.map((w) => w.code)).toContain('outdated_script_version')
  })

  it('ignores data from other productions', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '1' })
    const version = await createScriptVersion({ production_id: production.id, title: 'Script' })
    const section = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'dialogue',
      ranges: [range('1', 0, '1', 4)],
    })
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    await linkShotToSection(shot.id, section.id)

    const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    await createShotStrip(production.id, shot.id, shootDay.id, shootDayUnitId)

    // Second production with its own scheduled scene/shot/section on its own day.
    const otherProd = await createProduction({ name: 'Other', notes: null }, { skipBudgetSeed: true })
    const otherScene = await createScene({ production_id: otherProd.id, scene_number: '1' })
    const otherVersion = await createScriptVersion({ production_id: otherProd.id, title: 'Other' })
    const otherSection = await createSectionWithRangesAndCharacters({
      production_id: otherProd.id,
      script_version_id: otherVersion.id,
      scene_id: otherScene.id,
      section_type: 'dialogue',
      ranges: [range('1', 0, '1', 8)],
    })
    const { shot: otherShot } = await createShot({ scene_id: otherScene.id, shot_number: '1A' })
    await linkShotToSection(otherShot.id, otherSection.id)
    const { shootDay: otherDay, shootDayUnitId: otherUnit } = await createShootDayWithDefaultMainUnit({
      productionId: otherProd.id,
      shootDate: '2026-06-02',
    })
    await createShotStrip(otherProd.id, otherShot.id, otherDay.id, otherUnit)

    const summary = await deriveShootDayScriptSections(shootDay.id)
    expect(summary.productionId).toBe(production.id)
    expect(summary.includedSectionIds).toEqual([section.id])
    expect(summary.includedSectionIds).not.toContain(otherSection.id)
    expect(summary.sceneIds).toEqual([scene.id])
  })

  it('returns a neutral summary for remote-server productions', async () => {
    await makeDb()
    const production = await createProduction({ name: 'P', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '1' })
    const version = await createScriptVersion({ production_id: production.id, title: 'Script' })
    const section = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'dialogue',
      ranges: [range('1', 0, '1', 4)],
    })
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    await linkShotToSection(shot.id, section.id)
    const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    await createShotStrip(production.id, shot.id, shootDay.id, shootDayUnitId)

    dataSourceOverride = 'remote_server'
    const summary = await deriveShootDayScriptSections(shootDay.id)
    expect(summary.includedSectionIds).toEqual([])
    expect(summary.sceneIds).toEqual([])
    expect(summary.warnings).toEqual([])
    expect(summary.productionId).toBe(production.id)
  })
})
