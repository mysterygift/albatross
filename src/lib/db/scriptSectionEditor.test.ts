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
import { createScene } from '@/lib/db/repositories/schedule'
import { createScriptVersion } from '@/lib/db/repositories/scriptVersions'
import {
  createSectionWithRangesAndCharacters,
  listCharactersBySection,
  listRangesBySection,
  listSectionsByScriptVersion,
  replaceSectionRanges,
  softDeleteSectionWithChildren,
  updateScriptSection,
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
  const production = await createProduction({ name: 'Editor test', notes: null }, { skipBudgetSeed: true })
  const scene = await createScene({ production_id: production.id, scene_number: '1' })
  const version = await createScriptVersion({ production_id: production.id, title: 'Shooting Script' })
  return { production, scene, version }
}

describe('script section editor actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('softDeleteSectionWithChildren removes the section and its ranges and characters', async () => {
    await makeDb()
    const { production, scene, version } = await seedBase()

    const section = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'custom',
      is_manual: true,
      ranges: [{ start_page: '1', start_eighth: 0, end_page: '1', end_eighth: 4 }],
      characters: [{ character_name: 'JANE' }],
    })

    expect(await listRangesBySection(section.id)).toHaveLength(1)
    expect(await listCharactersBySection(section.id)).toHaveLength(1)

    await softDeleteSectionWithChildren(section.id)

    expect(await listSectionsByScriptVersion(version.id)).toHaveLength(0)
    expect(await listRangesBySection(section.id)).toHaveLength(0)
    expect(await listCharactersBySection(section.id)).toHaveLength(0)
  })

  it('preserves generated sections when deleting a manual section', async () => {
    await makeDb()
    const { production, scene, version } = await seedBase()

    const generated = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'action',
      is_manual: false,
    })
    const manual = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'custom',
      is_manual: true,
    })

    await softDeleteSectionWithChildren(manual.id)

    const remaining = await listSectionsByScriptVersion(version.id)
    expect(remaining.map((s) => s.id)).toEqual([generated.id])
    expect(remaining[0]!.is_manual).toBe(0)
  })

  it('edits manual section metadata and replaces its range', async () => {
    await makeDb()
    const { production, scene, version } = await seedBase()

    const section = await createSectionWithRangesAndCharacters({
      production_id: production.id,
      script_version_id: version.id,
      scene_id: scene.id,
      section_type: 'custom',
      label: 'Original',
      status: 'unplanned',
      is_manual: true,
      ranges: [{ start_page: '1', start_eighth: 0, end_page: '1', end_eighth: 2 }],
    })

    const updated = await updateScriptSection(section.id, {
      label: 'Renamed',
      section_type: 'stunt',
      status: 'planned',
      notes: 'be careful',
    })
    expect(updated.label).toBe('Renamed')
    expect(updated.section_type).toBe('stunt')
    expect(updated.status).toBe('planned')
    expect(updated.notes).toBe('be careful')

    await replaceSectionRanges(section.id, [{ start_page: '2', start_eighth: 1, end_page: '3', end_eighth: 8 }])
    const ranges = await listRangesBySection(section.id)
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toMatchObject({ start_page: '2', start_eighth: 1, end_page: '3', end_eighth: 8 })
  })
})
