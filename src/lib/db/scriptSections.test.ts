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

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  mkdir: vi.fn(async () => {}),
  readFile: vi.fn(async () => new Uint8Array()),
  writeFile: vi.fn(async () => {}),
}))

import { createProduction } from '@/lib/db/repositories/production'
import {
  createScene,
  createShootDayWithDefaultMainUnit,
  createShot,
} from '@/lib/db/repositories/schedule'
import { createShotStrip } from '@/lib/db/repositories/stripboard-strips'
import { createScriptVersion, listScriptVersionsByProduction } from '@/lib/db/repositories/scriptVersions'
import {
  createSectionWithRangesAndCharacters,
  getLinkedSectionCountsByShotIds,
  getLinkedShotCountsBySectionIds,
  linkShotToSection,
  linkShotToSections,
  listCharactersBySection,
  listRangesBySection,
  listRangesBySectionIds,
  listSectionsByScene,
  listSectionsByScriptVersion,
  listSectionsByShot,
  listSectionsForShootDay,
  listShotsBySection,
  replaceShotSectionLinks,
  unlinkShotFromSection,
} from '@/lib/db/repositories/scriptSections'

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

async function seedBase() {
  const production = await createProduction({ name: 'Script test', notes: null }, { skipBudgetSeed: true })
  const scene = await createScene({ production_id: production.id, scene_number: '1' })
  const version = await createScriptVersion({ production_id: production.id, title: 'Shooting Script' })
  return { production, scene, version }
}

describe('script sections repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a section with ranges and characters transactionally', async () => {
    await makeDb()
    const { production, scene, version } = await seedBase()

    const section = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'dialogue',
      label: 'Opening',
      ranges: [
        { start_page: '1', start_eighth: 0, end_page: '1', end_eighth: 4 },
        { start_page: '2', start_eighth: 0, end_page: '2', end_eighth: 8 },
      ],
      characters: [{ character_name: 'JANE' }, { character_name: 'JOHN' }],
    })

    expect(section.id).toBeTruthy()
    expect(section.section_type).toBe('dialogue')
    expect(section.status).toBe('unplanned')

    const ranges = await listRangesBySection(section.id)
    const characters = await listCharactersBySection(section.id)
    expect(ranges).toHaveLength(2)
    expect(characters).toHaveLength(2)
    expect(characters.map((c) => c.character_name).sort()).toEqual(['JANE', 'JOHN'])
  })

  it('lists sections by scene and by script version', async () => {
    await makeDb()
    const { production, scene, version } = await seedBase()
    await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'action',
    })

    expect(await listSectionsByScene(scene.id)).toHaveLength(1)
    expect(await listSectionsByScriptVersion(version.id)).toHaveLength(1)
  })

  it('links and unlinks a shot to a section', async () => {
    await makeDb()
    const { production, scene, version } = await seedBase()
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    const section = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'dialogue',
    })

    await linkShotToSection(shot.id, section.id, { coverage_notes: 'wide' })
    expect((await listSectionsByShot(shot.id)).map((s) => s.id)).toEqual([section.id])

    await unlinkShotFromSection(shot.id, section.id)
    expect(await listSectionsByShot(shot.id)).toHaveLength(0)

    // Re-linking after unlink is idempotent (respects UNIQUE(shot_id, script_section_id)).
    await linkShotToSection(shot.id, section.id)
    expect((await listSectionsByShot(shot.id)).map((s) => s.id)).toEqual([section.id])
  })

  it('lists sections for a shoot day via scheduled shot strips', async () => {
    await makeDb()
    const { production, scene, version } = await seedBase()
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    const section = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'dialogue',
    })
    await linkShotToSection(shot.id, section.id)

    const { shootDay, shootDayUnitId } = await createShootDayWithDefaultMainUnit({
      productionId: production.id,
      shootDate: '2026-06-01',
    })
    await createShotStrip(production.id, shot.id, shootDay.id, shootDayUnitId)

    const sections = await listSectionsForShootDay(shootDay.id)
    expect(sections.map((s) => s.id)).toEqual([section.id])
  })

  it('duplicateProduction copies script sections data', async () => {
    await makeDb()
    const { production, scene, version } = await seedBase()
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    const section = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'dialogue',
      label: 'Opening',
      ranges: [{ start_page: '1', start_eighth: 0, end_page: '1', end_eighth: 4 }],
      characters: [{ character_name: 'JANE' }],
    })
    await linkShotToSection(shot.id, section.id)

    const { duplicateProduction } = await import('@/lib/db/duplicateProduction')
    const copy = await duplicateProduction(production.id, 'Script Copy')

    const copyVersions = await listScriptVersionsByProduction(copy.id)
    expect(copyVersions).toHaveLength(1)
    expect(copyVersions[0]!.title).toBe('Shooting Script')
    expect(copyVersions[0]!.id).not.toBe(version.id)

    const copySections = await listSectionsByScriptVersion(copyVersions[0]!.id)
    expect(copySections).toHaveLength(1)
    expect(copySections[0]!.label).toBe('Opening')
    expect(copySections[0]!.id).not.toBe(section.id)

    const copyScenes = await dbAdapter.select<Array<{ id: string }>>(
      `SELECT id FROM scenes WHERE production_id = $1 AND deleted_at IS NULL`,
      [copy.id]
    )
    const copyShots = await dbAdapter.select<Array<{ id: string }>>(
      `SELECT id FROM shots WHERE scene_id = $1 AND deleted_at IS NULL`,
      [copyScenes[0]!.id]
    )
    expect((await listSectionsByShot(copyShots[0]!.id)).map((s) => s.label)).toEqual(['Opening'])
  })
})

describe('shot <-> section links (SB4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function seedSceneWithSections(count: number) {
    const { production, scene, version } = await seedBase()
    const sections = []
    for (let i = 0; i < count; i++) {
      sections.push(
        await createSectionWithRangesAndCharacters({
          production_id: production.id,
          script_version_id: version.id,
          scene_id: scene.id,
          section_type: 'dialogue',
          label: `Section ${i + 1}`,
        })
      )
    }
    return { production, scene, version, sections }
  }

  it('links one shot to one section', async () => {
    await makeDb()
    const { scene, sections } = await seedSceneWithSections(1)
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })

    await linkShotToSection(shot.id, sections[0]!.id)
    expect((await listSectionsByShot(shot.id)).map((s) => s.id)).toEqual([sections[0]!.id])
  })

  it('links one shot to multiple sections in one batch', async () => {
    await makeDb()
    const { scene, sections } = await seedSceneWithSections(3)
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })

    await linkShotToSections(shot.id, [sections[0]!.id, sections[1]!.id, sections[2]!.id])
    const linked = await listSectionsByShot(shot.id)
    // Ordered by sort_index, which follows the input order.
    expect(linked.map((s) => s.id)).toEqual([sections[0]!.id, sections[1]!.id, sections[2]!.id])
  })

  it('prevents duplicate links (idempotent)', async () => {
    await makeDb()
    const { scene, sections } = await seedSceneWithSections(1)
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })

    await linkShotToSection(shot.id, sections[0]!.id)
    await linkShotToSection(shot.id, sections[0]!.id)
    await linkShotToSections(shot.id, [sections[0]!.id, sections[0]!.id])
    expect(await listSectionsByShot(shot.id)).toHaveLength(1)
  })

  it('unlinks a single shot-section link', async () => {
    await makeDb()
    const { scene, sections } = await seedSceneWithSections(2)
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })

    await linkShotToSections(shot.id, [sections[0]!.id, sections[1]!.id])
    await unlinkShotFromSection(shot.id, sections[0]!.id)
    expect((await listSectionsByShot(shot.id)).map((s) => s.id)).toEqual([sections[1]!.id])
  })

  it('replaces all links for a shot (add, remove, reorder)', async () => {
    await makeDb()
    const { scene, sections } = await seedSceneWithSections(3)
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })

    await linkShotToSections(shot.id, [sections[0]!.id, sections[1]!.id])
    // Replace: drop section 0, keep section 1, add section 2 — and reorder.
    await replaceShotSectionLinks(shot.id, [sections[2]!.id, sections[1]!.id])

    const linked = await listSectionsByShot(shot.id)
    expect(linked.map((s) => s.id)).toEqual([sections[2]!.id, sections[1]!.id])

    // Clearing all links works too.
    await replaceShotSectionLinks(shot.id, [])
    expect(await listSectionsByShot(shot.id)).toHaveLength(0)
  })

  it('rejects linking a shot and section from different productions', async () => {
    await makeDb()
    const { scene } = await seedSceneWithSections(0)
    const { shot } = await createShot({ scene_id: scene.id, shot_number: '1A' })

    // A second production with its own scene/version/section.
    const otherProduction = await createProduction(
      { name: 'Other', notes: null },
      { skipBudgetSeed: true }
    )
    const otherScene = await createScene({ production_id: otherProduction.id, scene_number: '1' })
    const otherVersion = await createScriptVersion({
      production_id: otherProduction.id,
      title: 'Other Script',
    })
    const otherSection = await createSectionWithRangesAndCharacters({
      production_id: otherProduction.id,
      script_version_id: otherVersion.id,
      scene_id: otherScene.id,
      section_type: 'dialogue',
    })

    await expect(linkShotToSection(shot.id, otherSection.id)).rejects.toThrow(/different productions/)
    await expect(replaceShotSectionLinks(shot.id, [otherSection.id])).rejects.toThrow(
      /different productions/
    )
    expect(await listSectionsByShot(shot.id)).toHaveLength(0)
  })

  it('lists shots linked to a section (reverse lookup)', async () => {
    await makeDb()
    const { scene, sections } = await seedSceneWithSections(1)
    const { shot: shotA } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    const { shot: shotB } = await createShot({ scene_id: scene.id, shot_number: '1B' })

    await linkShotToSection(shotA.id, sections[0]!.id)
    await linkShotToSection(shotB.id, sections[0]!.id)

    const shots = await listShotsBySection(sections[0]!.id)
    expect(shots.map((s) => s.shot_number)).toEqual(['1A', '1B'])
  })

  it('reports coverage counts for shots and sections, and batched ranges', async () => {
    await makeDb()
    const { production, scene, version } = await seedBase()
    const covered = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'dialogue',
      ranges: [{ start_page: '1', start_eighth: 0, end_page: '1', end_eighth: 4 }],
    })
    const uncovered = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'action',
    })
    const { shot: linkedShot } = await createShot({ scene_id: scene.id, shot_number: '1A' })
    const { shot: bareShot } = await createShot({ scene_id: scene.id, shot_number: '1B' })

    await linkShotToSection(linkedShot.id, covered.id)

    const shotCounts = await getLinkedSectionCountsByShotIds([linkedShot.id, bareShot.id])
    expect(shotCounts.get(linkedShot.id)).toBe(1)
    expect(shotCounts.has(bareShot.id)).toBe(false)

    const sectionCounts = await getLinkedShotCountsBySectionIds([covered.id, uncovered.id])
    expect(sectionCounts.get(covered.id)).toBe(1)
    expect(sectionCounts.has(uncovered.id)).toBe(false)

    const ranges = await listRangesBySectionIds([covered.id, uncovered.id])
    expect(ranges.get(covered.id)).toHaveLength(1)
    expect(ranges.has(uncovered.id)).toBe(false)
  })
})
