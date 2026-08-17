import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { defaultParser } from '@/lib/script-parser'
import { createProduction } from '@/lib/db/repositories/production'
import { createScene, listScenesByProduction } from '@/lib/db/repositories/schedule'
import { generateScriptVersionFromScenes } from '@/lib/db/scriptSectionGenerationService'
import { listScriptPagesByScriptVersion } from '@/lib/db/repositories/scriptPages'
import { listSectionsByScriptVersion } from '@/lib/db/repositories/scriptSections'
import { listScriptVersionsByProduction } from '@/lib/db/repositories/scriptVersions'
import {
  locationIdForParsedName,
  resolveImportLocations,
} from '@/lib/db/scriptImportLocationService'
import { effectiveParsedLocation } from '@/lib/schedule/scriptImportReview'
import { listLocationsByProduction } from '@/lib/db/repositories/location'
import { linkLocationScene } from '@/lib/db/repositories/location-scene'
import { listLocationIdsByScene } from '@/lib/db/repositories/location-scene'
import { setTestDataEncryptionKeyForTests } from '@/lib/security/dataEncryptionContext'

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

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

async function makeDb(): Promise<void> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAllMigrations(db)
  db.exec('PRAGMA foreign_keys = ON')
  dbAdapter = createSqlJsTauriAdapter(db)
}

const SAMPLE_SCRIPT = `INT. WAREHOUSE - DAY

JADE works the lock.

EXT. ALLEY - NIGHT

They run.

INT. VAULT - DAY

Door opens.
`

describe('script import flow (parser → scenes → generation)', () => {
  beforeEach(async () => {
    setTestDataEncryptionKeyForTests(new Uint8Array(32).fill(17))
    vi.clearAllMocks()
    await makeDb()
  })

  afterEach(() => setTestDataEncryptionKeyForTests(null))

  it('chains parse, scene create, and section generation', async () => {
    const production = await createProduction({ name: 'Import flow', notes: null }, { skipBudgetSeed: true })
    const parsed = await defaultParser.parse({ type: 'text', content: SAMPLE_SCRIPT })
    expect(parsed.length).toBeGreaterThanOrEqual(2)
    expect(parsed[0]).toMatchObject({ location: 'WAREHOUSE', int_ext: 'INT' })

    const locationNames = parsed
      .map((s) => effectiveParsedLocation(s))
      .filter((loc): loc is string => !!loc?.trim())
    const locationMap = await resolveImportLocations(production.id, locationNames)

    const created: Array<{ sceneId: string; parsed: (typeof parsed)[number] }> = []
    for (const scene of parsed) {
      const locationId = locationIdForParsedName(locationMap, effectiveParsedLocation(scene))
      const row = await createScene({
        production_id: production.id,
        scene_number: scene.scene_number,
        title: scene.title,
        int_ext: scene.int_ext ?? undefined,
        day_night: scene.day_night ?? undefined,
        location_id: locationId,
      })
      if (locationId) {
        await linkLocationScene(locationId, row.id)
      }
      created.push({ sceneId: row.id, parsed: scene })
    }

    const locations = await listLocationsByProduction(production.id)
    expect(locations.map((l) => l.name).sort()).toEqual(['ALLEY', 'VAULT', 'WAREHOUSE'])

    const scenes = await listScenesByProduction(production.id)
    for (const sc of scenes) {
      expect(sc.location_id).not.toBeNull()
      const linked = await listLocationIdsByScene(sc.id)
      expect(linked).toContain(sc.location_id)
    }

    const version = await generateScriptVersionFromScenes({
      productionId: production.id,
      title: 'Imported',
      versionLabel: 'v1',
      linkToPreviousVersion: false,
      scenes: created,
    })
    expect(version).not.toBeNull()

    const versions = await listScriptVersionsByProduction(production.id)
    expect(versions).toHaveLength(1)

    const pages = await listScriptPagesByScriptVersion(version!.id)
    expect(pages.length).toBeGreaterThan(0)

    const sections = await listSectionsByScriptVersion(version!.id)
    expect(sections.length).toBeGreaterThan(0)
  })
})
