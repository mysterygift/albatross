import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import {
  buildSidesDraftModel,
  defaultSidesFilters,
  type SidesBuilderSource,
  type SidesSectionEntry,
} from '@/lib/db/sidesBuilderService'
import type { Scene, ScriptSection } from '@/lib/db/types'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

const writeFileMock = vi.hoisted(() => vi.fn())
const mkdirMock = vi.hoisted(() => vi.fn())
const removeMock = vi.hoisted(() => vi.fn())
const generateSidesPdfMock = vi.hoisted(() => vi.fn())

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
  remove: removeMock,
}))

vi.mock('@/lib/pdf/sides', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdf/sides')>()
  return { ...actual, generateSidesPdf: generateSidesPdfMock }
})

import { createProduction } from '@/lib/db/repositories/production'
import { createScriptVersion } from '@/lib/db/repositories/scriptVersions'
import { createShootDayWithDefaultMainUnit } from '@/lib/db/repositories/schedule'
import { listDocumentsByProduction } from '@/lib/db/repositories/document'
import { listSidesExportsByShootDay } from '@/lib/db/repositories/sidesExports'
import { exportShootDaySides, type SidesExportMetadata } from '@/lib/db/sidesExportService'

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

const soft = { created_at: 't', updated_at: 't', deleted_at: null as string | null }

function scene(over: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    production_id: 'prod-1',
    episode_id: null,
    scene_number: '1',
    heading: 'INT. KITCHEN - DAY',
    title: null,
    description: null,
    int_ext: 'INT',
    day_night: 'DAY',
    page_eighths: 8,
    location_id: null,
    duration_minutes: null,
    ...soft,
    ...over,
  }
}

function section(over: Partial<ScriptSection> = {}): ScriptSection {
  return {
    id: 'sec-1',
    production_id: 'prod-1',
    script_version_id: 'sv-1',
    scene_id: 'scene-1',
    episode_id: null,
    label: 'Opening',
    section_type: 'dialogue',
    status: 'planned',
    notes: null,
    is_manual: 0,
    ranges_user_edited: 0,
    ...soft,
    ...over,
  }
}

function entry(over: Partial<SidesSectionEntry> = {}): SidesSectionEntry {
  const sec = over.section ?? section()
  const scn = over.scene ?? scene()
  return {
    sectionId: sec.id,
    section: sec,
    scene: scn,
    episodeId: scn.episode_id,
    episodeName: null,
    episodeSortOrder: null,
    unitId: 'unit-1',
    locationId: null,
    locationName: null,
    ranges: [],
    characterNames: ['JANE'],
    linkedShotNumbers: [],
    scriptText: 'Some script text',
    origin: 'included',
    isPartialScene: false,
    isViaShotsOnly: false,
    isEstimated: false,
    estimatedEighths: 4,
    startPageSort: 0,
    ...over,
  }
}

async function seedContext() {
  const production = await createProduction({ name: 'Sides Test', notes: null }, { skipBudgetSeed: true })
  const version = await createScriptVersion({
    production_id: production.id,
    title: 'Shooting Script',
    version_label: 'Blue',
  })
  const { shootDay, mainUnitId } = await createShootDayWithDefaultMainUnit({
    productionId: production.id,
    shootDate: '2026-06-01',
  })
  return { production, version, shootDay, mainUnitId }
}

function buildSource(
  over: Partial<SidesBuilderSource> & {
    productionId: string
    shootDayId: string
    unitId: string | null
    scriptVersionIds: string[]
  }
): SidesBuilderSource {
  return {
    shootDayId: over.shootDayId,
    productionId: over.productionId,
    unitId: over.unitId,
    shootDate: '2026-06-01',
    unitName: 'Main Unit',
    scheduledSceneIds: ['scene-1'],
    scriptVersionIds: over.scriptVersionIds,
    scriptVersionLabelsById: over.scriptVersionLabelsById ?? Object.fromEntries(
      over.scriptVersionIds.map((id) => [id, id])
    ),
    latestScriptVersionIdByEpisodeScope: over.latestScriptVersionIdByEpisodeScope ?? {
      '': over.scriptVersionIds[0] ?? '',
    },
    totalEstimatedEighths: 4,
    entries: over.entries ?? [entry()],
    sb5Warnings: [],
  }
}

describe('exportShootDaySides (SB7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generateSidesPdfMock.mockResolvedValue(new Uint8Array([37, 80, 68, 70]))
  })

  it('blocks export when no sections are selected', async () => {
    await makeDb()
    const { production, version, shootDay, mainUnitId } = await seedContext()
    const source = buildSource({
      productionId: production.id,
      shootDayId: shootDay.id,
      unitId: mainUnitId,
      scriptVersionIds: [version.id],
    })
    const model = buildSidesDraftModel(source, defaultSidesFilters(), {
      overrides: { 'sec-1': false },
    })

    await expect(
      exportShootDaySides({ source, model, filters: defaultSidesFilters() })
    ).rejects.toThrow(/no sections selected/i)

    expect(generateSidesPdfMock).not.toHaveBeenCalled()
    expect(writeFileMock).not.toHaveBeenCalled()
    expect(await listSidesExportsByShootDay(shootDay.id)).toHaveLength(0)
  })

  it('records selected section IDs, filters and warnings in metadata', async () => {
    await makeDb()
    const { production, version, shootDay, mainUnitId } = await seedContext()
    const source = buildSource({
      productionId: production.id,
      shootDayId: shootDay.id,
      unitId: mainUnitId,
      scriptVersionIds: [version.id],
      entries: [
        entry({ section: section({ id: 'sec-1' }) }),
        entry({ section: section({ id: 'sec-2', status: 'omitted' }) }),
      ],
    })
    const filters = { ...defaultSidesFilters(), characterName: 'JANE' }
    const model = buildSidesDraftModel(source, filters, { overrides: {} })

    const { exportRecord } = await exportShootDaySides({ source, model, filters })

    const metadata = JSON.parse(exportRecord.metadata_json!) as SidesExportMetadata
    expect(metadata.selectedSectionIds.sort()).toEqual(['sec-1', 'sec-2'])
    expect(metadata.filters.characterName).toBe('JANE')
    expect(metadata.scriptVersionIds).toEqual([version.id])
    expect(metadata.warnings.some((w) => w.code === 'omitted_section_selected')).toBe(true)
  })

  it('links the generated PDF to the production and shoot day', async () => {
    await makeDb()
    const { production, version, shootDay, mainUnitId } = await seedContext()
    const source = buildSource({
      productionId: production.id,
      shootDayId: shootDay.id,
      unitId: mainUnitId,
      scriptVersionIds: [version.id],
    })
    const model = buildSidesDraftModel(source, defaultSidesFilters(), { overrides: {} })

    const { document, exportRecord } = await exportShootDaySides({
      source,
      model,
      filters: defaultSidesFilters(),
    })

    expect(document.production_id).toBe(production.id)
    expect(document.entity_id).toBe(shootDay.id)
    expect(document.mime_type).toBe('application/pdf')
    expect(exportRecord.shoot_day_id).toBe(shootDay.id)
    expect(exportRecord.production_id).toBe(production.id)
    expect(exportRecord.document_id).toBe(document.id)
    expect(exportRecord.script_version_id).toBe(version.id)
    expect(writeFileMock).toHaveBeenCalledTimes(1)

    const docs = await listDocumentsByProduction(production.id)
    expect(docs.map((d) => d.id)).toContain(document.id)
  })

  it('preserves previous exports when exporting again', async () => {
    await makeDb()
    const { production, version, shootDay, mainUnitId } = await seedContext()
    const source = buildSource({
      productionId: production.id,
      shootDayId: shootDay.id,
      unitId: mainUnitId,
      scriptVersionIds: [version.id],
    })
    const model = buildSidesDraftModel(source, defaultSidesFilters(), { overrides: {} })

    const first = await exportShootDaySides({ source, model, filters: defaultSidesFilters() })
    const second = await exportShootDaySides({ source, model, filters: defaultSidesFilters() })

    const exports = await listSidesExportsByShootDay(shootDay.id)
    expect(exports).toHaveLength(2)
    expect(first.exportRecord.id).not.toBe(second.exportRecord.id)
    expect(first.document.id).not.toBe(second.document.id)
  })

  it('stores all script version ids in export metadata when sections span versions', async () => {
    await makeDb()
    const { production, version, shootDay, mainUnitId } = await seedContext()
    const versionB = await createScriptVersion({
      production_id: production.id,
      title: 'Rev 2',
      version_label: 'v2',
    })
    const source = buildSource({
      productionId: production.id,
      shootDayId: shootDay.id,
      unitId: mainUnitId,
      scriptVersionIds: [version.id, versionB.id],
      entries: [
        entry({ section: section({ id: 'sec-a', script_version_id: version.id }) }),
        entry({ section: section({ id: 'sec-b', script_version_id: versionB.id }) }),
      ],
    })
    const model = buildSidesDraftModel(source, defaultSidesFilters(), { overrides: {} })
    const { exportRecord } = await exportShootDaySides({
      source,
      model,
      filters: defaultSidesFilters(),
    })
    const metadata = JSON.parse(exportRecord.metadata_json!) as { scriptVersionIds: string[] }
    expect(metadata.scriptVersionIds.sort()).toEqual([version.id, versionB.id].sort())
    expect(exportRecord.script_version_id).toBeNull()
  })

  it('does not leave an export record or orphan file when the DB write fails', async () => {
    await makeDb()
    const { production, version, mainUnitId } = await seedContext()
    // A non-existent shoot day id makes the export INSERT fail its FK, rolling back the document too.
    const source = buildSource({
      productionId: production.id,
      shootDayId: 'missing-shoot-day',
      unitId: mainUnitId,
      scriptVersionIds: [version.id],
    })
    const model = buildSidesDraftModel(source, defaultSidesFilters(), { overrides: {} })

    await expect(
      exportShootDaySides({ source, model, filters: defaultSidesFilters() })
    ).rejects.toThrow()

    // File was written, then cleaned up after the failed DB write.
    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(removeMock).toHaveBeenCalledTimes(1)
    expect(await listSidesExportsByShootDay('missing-shoot-day')).toHaveLength(0)
    expect(await listDocumentsByProduction(production.id)).toHaveLength(0)
  })
})
