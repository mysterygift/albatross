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
import {
  createSectionWithRangesAndCharacters,
  linkShotToSection,
  listSectionsByScriptVersion,
  listSectionsByShot,
} from '@/lib/db/repositories/scriptSections'
import { getScriptVersionById, listScriptVersionsByProduction } from '@/lib/db/repositories/scriptVersions'
import { generateScriptVersionFromScenes } from '@/lib/db/scriptSectionGenerationService'
import {
  applySafeShotLinkRemaps,
  reconcileScriptVersions,
} from '@/lib/db/scriptSectionReconciliationService'

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

function parsed(sceneNumber: string, content?: string): ParsedScene {
  return {
    scene_number: sceneNumber,
    title: `SCENE ${sceneNumber}`,
    int_ext: 'INT',
    day_night: 'DAY',
    content: content ?? `INT. SCENE ${sceneNumber} - DAY\nJANE\nHello.`,
    page_eighths: 8,
    start_page: '1',
    end_page: '1',
    start_offset: 0,
    end_offset: 30,
    characters: ['JANE'],
  }
}

async function importVersion(
  productionId: string,
  sceneNumber: string,
  opts: { content?: string; link?: boolean; versionLabel?: string } = {}
) {
  const scene = await createScene({ production_id: productionId, scene_number: sceneNumber })
  const version = await generateScriptVersionFromScenes({
    productionId,
    title: 'Script',
    versionLabel: opts.versionLabel ?? null,
    linkToPreviousVersion: opts.link ?? true,
    scenes: [{ sceneId: scene.id, parsed: parsed(sceneNumber, opts.content) }],
  })
  return { scene, version: version! }
}

describe('script section reconciliation (SB8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataSourceOverride = null
  })

  it('links a new import to the previous script version when enabled', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Rev test', notes: null }, { skipBudgetSeed: true })
    const v1 = await importVersion(production.id, '1', { link: false, versionLabel: 'v1' })
    const v2 = await importVersion(production.id, '1', { link: true, versionLabel: 'v2' })

    expect(v2.version.previous_script_version_id).toBe(v1.version.id)
    const reloadedV1 = await getScriptVersionById(v1.version.id)
    expect(reloadedV1!.version_label).toBe('v1')
    expect(await listScriptVersionsByProduction(production.id)).toHaveLength(2)
  })

  it('keeps old versions and sections intact when importing a new version', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Preserve', notes: null }, { skipBudgetSeed: true })
    const v1 = await importVersion(production.id, '1')
    const v1Sections = await listSectionsByScriptVersion(v1.version.id)

    await importVersion(production.id, '1')

    expect(await listSectionsByScriptVersion(v1.version.id)).toHaveLength(v1Sections.length)
    expect(v1Sections[0]!.id).toBe((await listSectionsByScriptVersion(v1.version.id))[0]!.id)
  })

  it('scopes generated sections to their originating script version', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Scope', notes: null }, { skipBudgetSeed: true })
    const v1 = await importVersion(production.id, '1')
    const v2 = await importVersion(production.id, '1')

    for (const section of await listSectionsByScriptVersion(v1.version.id)) {
      expect(section.script_version_id).toBe(v1.version.id)
    }
    for (const section of await listSectionsByScriptVersion(v2.version.id)) {
      expect(section.script_version_id).toBe(v2.version.id)
    }
  })

  it('reconciles unchanged revisions into matched sections', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Match', notes: null }, { skipBudgetSeed: true })
    const v1 = await importVersion(production.id, '1')
    const v2 = await importVersion(production.id, '1')

    const report = await reconcileScriptVersions(v1.version.id, v2.version.id)
    expect(report.matched.length).toBeGreaterThan(0)
    expect(report.changed).toHaveLength(0)
    expect(report.matched.every((p) => p.classification === 'exact')).toBe(true)
  })

  it('classifies content edits as changed and flags linked shots for review', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Changed', notes: null }, { skipBudgetSeed: true })
    const v1 = await importVersion(production.id, '1')
    const { shot } = await createShot({ scene_id: v1.scene.id, shot_number: '1A' })
    const oldFull = (await listSectionsByScriptVersion(v1.version.id)).find((s) =>
      s.label?.includes('Full Scene')
    )!
    await linkShotToSection(shot.id, oldFull.id)

    const v2 = await importVersion(production.id, '1', {
      content: 'INT. SCENE 1 - DAY\nJANE\nRevised dialogue here.',
    })

    const report = await reconcileScriptVersions(v1.version.id, v2.version.id)
    expect(report.changed.some((p) => p.old.label?.includes('Full Scene'))).toBe(true)
    expect(report.reviewRequiredShotLinks.some((l) => l.shotId === shot.id)).toBe(true)
    expect(report.remappableShotLinks).toHaveLength(0)
  })

  it('reports removed and new sections', async () => {
    await makeDb()
    const production = await createProduction({ name: 'AddRemove', notes: null }, { skipBudgetSeed: true })
    const v1 = await importVersion(production.id, '1')
    const v2 = await importVersion(production.id, '2')

    const report = await reconcileScriptVersions(v1.version.id, v2.version.id)
    expect(report.removed.some((r) => r.sceneNumber === '1')).toBe(true)
    expect(report.added.some((a) => a.sceneNumber === '2')).toBe(true)
  })

  it('remaps safe generated shot links to matched new sections', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Remap', notes: null }, { skipBudgetSeed: true })
    const v1 = await importVersion(production.id, '1')
    const { shot } = await createShot({ scene_id: v1.scene.id, shot_number: '1A' })
    const oldFull = (await listSectionsByScriptVersion(v1.version.id)).find((s) =>
      s.label?.includes('Full Scene')
    )!
    await linkShotToSection(shot.id, oldFull.id)

    const v2 = await importVersion(production.id, '1')
    const report = await reconcileScriptVersions(v1.version.id, v2.version.id)
    expect(report.remappableShotLinks.length).toBeGreaterThan(0)

    const result = await applySafeShotLinkRemaps(report)
    expect(result.remappedCount).toBeGreaterThan(0)

    const linked = await listSectionsByShot(shot.id)
    expect(linked.some((s) => s.script_version_id === v2.version.id)).toBe(true)
    expect(await listSectionsByScriptVersion(v1.version.id)).toContainEqual(
      expect.objectContaining({ id: oldFull.id })
    )
  })

  it('does not auto-remap manual section links', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Manual', notes: null }, { skipBudgetSeed: true })
    const v1 = await importVersion(production.id, '1')
    const manual = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: v1.version.id,
      scene_id: v1.scene.id,
      section_type: 'custom',
      label: 'Scene 1 — Full Scene',
      is_manual: true,
      ranges: [{ start_page: '1', start_eighth: 0, end_page: '1', end_eighth: 8 }],
    })
    const { shot } = await createShot({ scene_id: v1.scene.id, shot_number: '1A' })
    await linkShotToSection(shot.id, manual.id)

    const v2 = await importVersion(production.id, '1')
    const report = await reconcileScriptVersions(v1.version.id, v2.version.id)
    expect(report.remappableShotLinks.some((l) => l.oldSectionId === manual.id)).toBe(false)
    expect(report.reviewRequiredShotLinks.some((l) => l.oldSectionId === manual.id)).toBe(true)

    const result = await applySafeShotLinkRemaps(report)
    expect(result.remappedCount).toBe(0)
    const linked = await listSectionsByShot(shot.id)
    expect(linked[0]!.id).toBe(manual.id)
  })

  it('applySafeShotLinkRemaps is idempotent on a second run', async () => {
    await makeDb()
    const production = await createProduction({ name: 'Idempotent', notes: null }, { skipBudgetSeed: true })
    const v1 = await importVersion(production.id, '1')
    const { shot } = await createShot({ scene_id: v1.scene.id, shot_number: '1A' })
    const oldFull = (await listSectionsByScriptVersion(v1.version.id)).find((s) =>
      s.label?.includes('Full Scene')
    )!
    await linkShotToSection(shot.id, oldFull.id)
    const v2 = await importVersion(production.id, '1')

    const report = await reconcileScriptVersions(v1.version.id, v2.version.id)
    const first = await applySafeShotLinkRemaps(report)
    expect(first.remappedCount).toBeGreaterThan(0)
    const second = await applySafeShotLinkRemaps(report)
    expect(second.remappedCount).toBe(0)
    expect(second.skippedCount).toBeGreaterThan(0)
  })
})
