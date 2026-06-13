import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import type { ParsedScene } from '@/lib/script-parser'

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
import { createScene, createShot } from '@/lib/db/repositories/schedule'
import { createPerson } from '@/lib/db/repositories/person'
import { listScriptVersionsByProduction } from '@/lib/db/repositories/scriptVersions'
import { listScriptPagesByScriptVersion, updateScriptPage } from '@/lib/db/repositories/scriptPages'
import {
  createSectionWithRangesAndCharacters,
  getScriptSectionById,
  linkShotToSection,
  listCharactersBySection,
  listRangesBySection,
  listSectionsByScriptVersion,
  listSectionsByShot,
  replaceSectionRanges,
  updateScriptSection,
} from '@/lib/db/repositories/scriptSections'
import {
  generateScriptVersionFromScenes,
  regenerateSectionsForScriptVersion,
} from '@/lib/db/scriptSectionGenerationService'

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

function parsed(sceneNumber: string, opts: Partial<ParsedScene> = {}): ParsedScene {
  return {
    scene_number: sceneNumber,
    title: `SCENE ${sceneNumber}`,
    int_ext: 'INT',
    day_night: 'DAY',
    content: `INT. SCENE ${sceneNumber} - DAY\nJANE\nHello.`,
    page_eighths: 4,
    start_page: '1',
    end_page: '1',
    start_offset: 0,
    end_offset: 30,
    characters: ['JANE', 'BOB'],
    ...opts,
  }
}

async function seedAndGenerate() {
  const production = await createProduction({ name: 'Gen test', notes: null }, { skipBudgetSeed: true })
  // JANE is resolvable cast; BOB is not.
  await createPerson({ production_id: production.id, name: 'Jane Actor', is_cast: 1, role_name: 'JANE' })

  const sceneA = await createScene({ production_id: production.id, scene_number: '1' })
  const sceneB = await createScene({ production_id: production.id, scene_number: '2' })

  const version = await generateScriptVersionFromScenes({
    productionId: production.id,
    title: 'Shooting Script',
    scenes: [
      { sceneId: sceneA.id, parsed: parsed('1') },
      { sceneId: sceneB.id, parsed: parsed('2') },
    ],
  })
  return { production, sceneA, sceneB, version: version! }
}

describe('script section generation service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataSourceOverride = null
  })

  it('creates exactly one script version per import', async () => {
    await makeDb()
    const { production } = await seedAndGenerate()
    const versions = await listScriptVersionsByProduction(production.id)
    expect(versions).toHaveLength(1)
    expect(versions[0]!.title).toBe('Shooting Script')
  })

  it('optionally links a new import to the latest prior script version', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Link test', notes: null }, { skipBudgetSeed: true })
    const sceneA = await createScene({ production_id: production.id, scene_number: '1' })
    const v1 = await generateScriptVersionFromScenes({
      productionId: production.id,
      title: 'First',
      versionLabel: 'v1',
      linkToPreviousVersion: false,
      scenes: [{ sceneId: sceneA.id, parsed: parsed('1') }],
    })
    const sceneB = await createScene({ production_id: production.id, scene_number: '1' })
    const v2 = await generateScriptVersionFromScenes({
      productionId: production.id,
      title: 'Second',
      versionLabel: 'v2',
      linkToPreviousVersion: true,
      scenes: [{ sceneId: sceneB.id, parsed: parsed('1') }],
    })
    expect(v1!.previous_script_version_id).toBeNull()
    expect(v2!.previous_script_version_id).toBe(v1!.id)
  })

  it('creates one script page per physical page slice', async () => {
    await makeDb()
    const { version } = await seedAndGenerate()
    const pages = await listScriptPagesByScriptVersion(version.id)
    expect(pages).toHaveLength(2)
    expect(pages[0]!.content).toContain('SCENE 1')
    expect(pages.map((p) => p.page_index)).toEqual([0, 1])
  })

  it('does not generate full-scene sections', async () => {
    await makeDb()
    const { version } = await seedAndGenerate()
    const sections = await listSectionsByScriptVersion(version.id)
    const fullScene = sections.filter((s) => s.label?.endsWith('Full Scene'))
    expect(fullScene).toHaveLength(0)
  })

  it('generates line-snapped page/eighth sections', async () => {
    await makeDb()
    const { version } = await seedAndGenerate()
    const sections = await listSectionsByScriptVersion(version.id)
    const pageSections = sections.filter((s) => s.label?.includes('Page'))
    expect(pageSections.length).toBeGreaterThanOrEqual(2)
    expect(pageSections[0]!.label).toMatch(/Scene \d+ — Page \d+, \d\/8–\d\/8/)
    expect(pageSections.every((s) => s.is_manual === 0 && s.status === 'unplanned')).toBe(true)
  })

  it('populates section ranges with offsets for generated sections', async () => {
    await makeDb()
    const { version } = await seedAndGenerate()
    const sections = await listSectionsByScriptVersion(version.id)
    const pageSection = sections.find((s) => s.label?.startsWith('Scene 1 — Page'))!
    const ranges = await listRangesBySection(pageSection.id)
    expect(ranges).toHaveLength(1)
    expect(ranges[0]!.start_page).toBe('1')
    expect(ranges[0]!.start_offset).not.toBeNull()
    expect(ranges[0]!.end_offset).not.toBeNull()
  })

  it('populates section characters from parsed cues, resolving cast where possible', async () => {
    await makeDb()
    const { version } = await seedAndGenerate()
    const sections = await listSectionsByScriptVersion(version.id)
    const pageSection = sections.find((s) => s.label?.startsWith('Scene 1 — Page'))!
    const characters = await listCharactersBySection(pageSection.id)
    const byName = new Map(characters.map((c) => [c.character_name, c.person_id]))
    expect(byName.get('JANE')).toBeTruthy()
    expect(byName.has('BOB')).toBe(false)
  })

  it('skips generation for remote-server productions', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Remote', notes: null }, { skipBudgetSeed: true })
    const scene = await createScene({ production_id: production.id, scene_number: '1' })
    dataSourceOverride = 'remote_server'

    const result = await generateScriptVersionFromScenes({
      productionId: production.id,
      title: 'Shooting Script',
      scenes: [{ sceneId: scene.id, parsed: parsed('1') }],
    })
    expect(result).toBeNull()
    expect(await listScriptVersionsByProduction(production.id)).toHaveLength(0)
  })

  it('rolls back the whole import transaction on failure (no partial rows)', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Rollback', notes: null }, { skipBudgetSeed: true })

    await expect(
      generateScriptVersionFromScenes({
        productionId: production.id,
        title: 'Shooting Script',
        // Non-existent scene id violates the FK on script_pages/sections -> rollback.
        scenes: [{ sceneId: 'does-not-exist', parsed: parsed('1') }],
      })
    ).rejects.toThrow()

    expect(await listScriptVersionsByProduction(production.id)).toHaveLength(0)
  })

  it('regeneration preserves unchanged non-manual section ids and never deletes custom ones', async () => {
    await makeDb()
    const { production, sceneA, version } = await seedAndGenerate()

    const manual = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: sceneA.id,
      section_type: 'custom',
      label: 'My custom note',
      is_manual: true,
    })

    const before = await listSectionsByScriptVersion(version.id)
    const beforePageIds = before.filter((s) => s.label?.startsWith('Scene 1 — Page')).map((s) => s.id)
    expect(beforePageIds.length).toBeGreaterThan(0)

    await regenerateSectionsForScriptVersion(version.id)

    const after = await listSectionsByScriptVersion(version.id)
    const stillManual = after.find((s) => s.id === manual.id)
    expect(stillManual).toBeTruthy()
    expect(stillManual!.is_manual).toBe(1)
    const afterPageIds = after.filter((s) => s.label?.startsWith('Scene 1 — Page')).map((s) => s.id)
    expect(afterPageIds).toEqual(beforePageIds)
  })

  it('preserves shot links to non-manual sections across an unchanged regeneration', async () => {
    await makeDb()
    const { production, sceneA, version } = await seedAndGenerate()
    const { shot } = await createShot({ scene_id: sceneA.id, shot_number: '1A' })

    const sections = await listSectionsByScriptVersion(version.id)
    const pageSections = sections.filter((s) => s.label?.startsWith('Scene 1 — Page'))
    expect(pageSections.length).toBeGreaterThan(0)
    const pageSection = pageSections[0]!
    const manual = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: sceneA.id,
      section_type: 'custom',
      label: 'Manual coverage',
      is_manual: true,
    })

    await linkShotToSection(shot.id, pageSection.id)
    await linkShotToSection(shot.id, manual.id)
    expect(await listSectionsByShot(shot.id)).toHaveLength(2)

    await regenerateSectionsForScriptVersion(version.id)

    const linked = await listSectionsByShot(shot.id)
    expect(linked.map((s) => s.id).sort()).toEqual([pageSection.id, manual.id].sort())
  })

  it('cleans up shot links when a generated section has no overlapping replacement', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Remap', notes: null }, { skipBudgetSeed: true })
    const sceneA = await createScene({ production_id: production.id, scene_number: '1' })
    const longContent = Array.from({ length: 48 }, (_, i) => `ACTION LINE ${i + 1}`).join('\n')
    const version = await generateScriptVersionFromScenes({
      productionId: production.id,
      scenes: [{ sceneId: sceneA.id, parsed: parsed('1', { content: longContent }) }],
    })
    const { shot } = await createShot({ scene_id: sceneA.id, shot_number: '1A' })

    const before = await listSectionsByScriptVersion(version!.id)
    const pageSections = before.filter((s) => s.label?.startsWith('Scene 1 — Page'))
    expect(pageSections.length).toBeGreaterThan(1)
    const lastSection = pageSections[pageSections.length - 1]!
    await linkShotToSection(shot.id, lastSection.id)

    const pages = await listScriptPagesByScriptVersion(version!.id)
    await updateScriptPage(pages[0]!.id, { content: 'INT. ROOM - DAY\nJANE\nHello.' })

    await regenerateSectionsForScriptVersion(version!.id)

    const linked = await listSectionsByShot(shot.id)
    expect(linked).toHaveLength(0)
  })

  it('keeps manual-section links across regeneration even when generated sections change', async () => {
    await makeDb()
    const { production, sceneA, version } = await seedAndGenerate()
    const { shot } = await createShot({ scene_id: sceneA.id, shot_number: '1A' })

    const manual = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: sceneA.id,
      section_type: 'custom',
      label: 'Manual coverage',
      is_manual: true,
    })
    await linkShotToSection(shot.id, manual.id)

    const pages = await listScriptPagesByScriptVersion(version.id)
    const sceneAPage = pages.find((p) => p.scene_id === sceneA.id)!
    await updateScriptPage(sceneAPage.id, {
      content: 'INT. ROOM - DAY\n\nMuch longer content.\n'.repeat(20),
    })

    await regenerateSectionsForScriptVersion(version.id)

    const linked = await listSectionsByShot(shot.id)
    expect(linked.map((s) => s.id)).toEqual([manual.id])
  })

  it('preserves user-edited ranges across regeneration', async () => {
    await makeDb()
    const { version } = await seedAndGenerate()
    const sections = await listSectionsByScriptVersion(version.id)
    const pageSection = sections.find((s) => s.label?.startsWith('Scene 1 — Page'))!

    await replaceSectionRanges(
      pageSection!.id,
      [{ start_page: '1', start_eighth: 2, end_page: '1', end_eighth: 4 }],
      { markUserEdited: true }
    )

    const pages = await listScriptPagesByScriptVersion(version.id)
    await updateScriptPage(pages[0]!.id, { content: 'Rewritten page content\n'.repeat(30) })

    await regenerateSectionsForScriptVersion(version.id)

    const ranges = await listRangesBySection(pageSection!.id)
    expect(ranges[0]!.start_eighth).toBe(2)
    expect(ranges[0]!.end_eighth).toBe(4)
    const updated = await getScriptSectionById(pageSection!.id)
    expect(updated!.ranges_user_edited).toBe(1)
  })
})
