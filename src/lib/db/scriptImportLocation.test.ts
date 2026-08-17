import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { createProduction } from '@/lib/db/repositories/production'
import { createLocation, listLocationsByProduction } from '@/lib/db/repositories/location'
import { setTestDataEncryptionKeyForTests } from '@/lib/security/dataEncryptionContext'
import {
  locationIdForParsedName,
  normalizeLocationKey,
  resolveImportLocations,
} from '@/lib/db/scriptImportLocationService'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  return {
    ...actual,
    getDb: vi.fn(async () => dbAdapter),
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

describe('normalizeLocationKey', () => {
  it('trims, collapses whitespace, and uppercases', () => {
    expect(normalizeLocationKey("  Ship's   Deck  ")).toBe("SHIP'S DECK")
  })

  it('normalizes unicode dashes and apostrophes', () => {
    expect(normalizeLocationKey('KITCHEN – DAY')).toBe('KITCHEN - DAY')
    expect(normalizeLocationKey("JOHN'S APARTMENT")).toBe("JOHN'S APARTMENT")
    expect(normalizeLocationKey('JOHN\u2019S APARTMENT')).toBe("JOHN'S APARTMENT")
  })
})

describe('resolveImportLocations', () => {
  beforeEach(async () => {
    setTestDataEncryptionKeyForTests(new Uint8Array(32).fill(16))
    vi.clearAllMocks()
    await makeDb()
  })

  afterEach(() => setTestDataEncryptionKeyForTests(null))

  it('matches existing locations case-insensitively', async () => {
    const production = await createProduction({ name: 'Loc match', notes: null }, { skipBudgetSeed: true })
    const kitchen = await createLocation({
      production_id: production.id,
      name: 'Kitchen',
      booked_status: 'unbooked',
    })

    const map = await resolveImportLocations(production.id, ['KITCHEN', 'kitchen'])
    expect(map.get(normalizeLocationKey('KITCHEN'))).toBe(kitchen.id)
    expect(map.size).toBe(1)

    const locations = await listLocationsByProduction(production.id)
    expect(locations).toHaveLength(1)
  })

  it('creates missing locations as unbooked', async () => {
    const production = await createProduction({ name: 'Loc create', notes: null }, { skipBudgetSeed: true })

    const map = await resolveImportLocations(production.id, ['WAREHOUSE', 'ALLEY'])
    expect(map.size).toBe(2)

    const locations = await listLocationsByProduction(production.id)
    expect(locations.map((l) => l.name).sort()).toEqual(['ALLEY', 'WAREHOUSE'])
    expect(locations.every((l) => l.booked_status === 'unbooked')).toBe(true)
  })

  it('dedupes repeated names within one batch', async () => {
    const production = await createProduction({ name: 'Loc dedupe', notes: null }, { skipBudgetSeed: true })

    await resolveImportLocations(production.id, ['KITCHEN', 'Kitchen', 'KITCHEN'])

    const locations = await listLocationsByProduction(production.id)
    expect(locations).toHaveLength(1)
    expect(locations[0]!.name).toBe('KITCHEN')
  })

  it('dedupes punctuation variants within one batch', async () => {
    const production = await createProduction({ name: 'Loc punct', notes: null }, { skipBudgetSeed: true })

    await resolveImportLocations(production.id, ['KITCHEN', 'kitchen', 'KITCHEN – LOFT'])

    const locations = await listLocationsByProduction(production.id)
    expect(locations).toHaveLength(2)
    expect(locations.map((l) => normalizeLocationKey(l.name)).sort()).toEqual([
      'KITCHEN',
      'KITCHEN - LOFT',
    ])
  })
})

describe('locationIdForParsedName', () => {
  it('returns null for empty parsed location', () => {
    const map = new Map([['KITCHEN', 'loc-1']])
    expect(locationIdForParsedName(map, null)).toBeNull()
    expect(locationIdForParsedName(map, '  ')).toBeNull()
  })

  it('looks up by normalized key', () => {
    const map = new Map([[normalizeLocationKey('Kitchen'), 'loc-1']])
    expect(locationIdForParsedName(map, 'KITCHEN')).toBe('loc-1')
  })
})
