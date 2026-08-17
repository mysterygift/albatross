import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    executeBatch: async (
      db: { execute: (sql: string, bindValues?: unknown[]) => Promise<unknown> },
      statements: Array<{ sql: string; bindValues: unknown[] }>
    ) => {
      for (const statement of statements) await db.execute(statement.sql, statement.bindValues)
    },
  }
})

import { createPerson, listPeopleByProduction, updatePerson } from '@/lib/db/repositories/person'
import { createLocation, listLocationsByProduction, updateLocation } from '@/lib/db/repositories/location'
import { createVendor, listVendors, updateVendor } from '@/lib/db/repositories/vendors'
import { backfillSensitiveEntityEncryptionIfNeeded } from '@/lib/db/migrations/backfillSensitiveEntityEncryption'
import { reencryptAllClientFields } from '@/lib/db/migrations/reencryptClientFields'
import { EncryptionKeyUnavailableError, setTestDataEncryptionKeyForTests } from './dataEncryptionContext'
import { decryptPersonFields, encryptPersonFields } from './sensitiveEntityFieldCrypto'

const PROD = 'prod-sensitive'
const TS = '2026-08-17T12:00:00.000Z'
const DEK = new Uint8Array(32).fill(19)

function applyMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

beforeEach(async () => {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyMigrations(db)
  dbAdapter = createSqlJsTauriAdapter(db)
  await dbAdapter.execute(
    `INSERT INTO productions (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3)`,
    [PROD, 'Sensitive production', TS]
  )
  setTestDataEncryptionKeyForTests(DEK)
})

afterEach(() => setTestDataEncryptionKeyForTests(null))

describe('sensitive entity field encryption', () => {
  it('round-trips identifying fields and rejects the wrong key', async () => {
    const encrypted = await encryptPersonFields({
      name: 'Alex Rivera', email: 'alex@example.test', phone: '+44 7000', department: 'Camera',
      notes: 'Home address on file', cast_number: '7', agent_name: 'Sam Agent',
      agent_email: 'sam@agency.test', agent_phone: '+44 7111', role_name: 'Lead',
    })
    expect(String(encrypted.name)).toMatch(/^v1:/)
    expect(String(encrypted.name)).not.toContain('Alex')
    expect((await decryptPersonFields(encrypted)).agent_email).toBe('sam@agency.test')

    setTestDataEncryptionKeyForTests(new Uint8Array(32).fill(20))
    await expect(decryptPersonFields(encrypted)).rejects.toThrow()
  })

  it('encrypts repository writes, decrypts CRUD reads, and sorts in memory', async () => {
    const zoe = await createPerson({
      production_id: PROD, name: 'Zoe Person', is_cast: 1, email: 'zoe@example.test',
      department: 'Cast', agent_name: 'Private Agent', role_name: 'Hero', notes: 'Sensitive note',
    })
    await createPerson({ production_id: PROD, name: 'Amy Person', is_cast: 0, phone: '+44 7001' })
    const location = await createLocation({
      production_id: PROD, name: 'Private Home', booked_status: 'hold', address: '1 Secret Street',
      what3words: 'private.home.entry', parking_info: 'Rear gate', notes: 'Owner details',
    })
    const vendor = await createVendor({
      production_id: PROD, company_name: 'Identity Ltd', primary_contact_full_name: 'Morgan Lee',
      primary_contact_email: 'morgan@identity.test',
    })

    const rawPerson = (await dbAdapter.select<Record<string, unknown>[]>(`SELECT * FROM people WHERE id = $1`, [zoe.id]))[0]!
    const rawLocation = (await dbAdapter.select<Record<string, unknown>[]>(`SELECT * FROM locations WHERE id = $1`, [location.id]))[0]!
    const rawVendor = (await dbAdapter.select<Record<string, unknown>[]>(`SELECT * FROM vendors WHERE id = $1`, [vendor.id]))[0]!
    expect([rawPerson.name, rawPerson.email, rawPerson.agent_name, rawPerson.notes]).toEqual(
      expect.arrayContaining([expect.stringMatching(/^v1:/), expect.stringMatching(/^v1:/), expect.stringMatching(/^v1:/), expect.stringMatching(/^v1:/)])
    )
    expect([rawLocation.name, rawLocation.address, rawLocation.what3words]).toEqual(
      expect.arrayContaining([expect.stringMatching(/^v1:/), expect.stringMatching(/^v1:/), expect.stringMatching(/^v1:/)])
    )
    expect([rawVendor.company_name, rawVendor.primary_contact_full_name, rawVendor.primary_contact_email]).toEqual(
      expect.arrayContaining([expect.stringMatching(/^v1:/), expect.stringMatching(/^v1:/), expect.stringMatching(/^v1:/)])
    )
    const outbox = await dbAdapter.select<Array<{ payload_json: string }>>(
      `SELECT payload_json FROM outbox WHERE entity IN ('people', 'locations', 'vendors')`
    )
    const persistedPayloads = outbox.map((row) => row.payload_json).join('\n')
    expect(persistedPayloads).not.toContain('zoe@example.test')
    expect(persistedPayloads).not.toContain('1 Secret Street')
    expect(persistedPayloads).not.toContain('morgan@identity.test')

    expect((await listPeopleByProduction(PROD)).map((person) => person.name)).toEqual(['Amy Person', 'Zoe Person'])
    expect((await listLocationsByProduction(PROD))[0]?.address).toBe('1 Secret Street')
    expect((await listVendors(PROD))[0]?.primary_contact_email).toBe('morgan@identity.test')
    expect((await updatePerson(zoe.id, { agent_phone: '+44 7999' })).agent_phone).toBe('+44 7999')
    expect((await updateLocation(location.id, { parking_info: 'Front gate' })).parking_info).toBe('Front gate')
    expect((await updateVendor(vendor.id, { primary_contact_full_name: 'Taylor Lee' })).primary_contact_full_name).toBe('Taylor Lee')
  })

  it('backfills legacy plaintext rows and fails closed without the DEK', async () => {
    await dbAdapter.execute(
      `INSERT INTO people (id, production_id, name, is_cast, email, agent_name, created_at, updated_at)
       VALUES ('legacy-person', $1, 'Legacy Person', 1, 'legacy@example.test', 'Legacy Agent', $2, $2)`,
      [PROD, TS]
    )
    await dbAdapter.execute(
      `INSERT INTO locations (id, production_id, name, booked_status, address, created_at, updated_at)
       VALUES ('legacy-location', $1, 'Legacy House', 'unbooked', '2 Old Road', $2, $2)`,
      [PROD, TS]
    )
    await dbAdapter.execute(
      `INSERT INTO vendors (id, production_id, company_name, primary_contact_email, created_at, updated_at)
       VALUES ('legacy-vendor', $1, 'Legacy Vendor', 'legacy@vendor.test', $2, $2)`,
      [PROD, TS]
    )
    expect(await backfillSensitiveEntityEncryptionIfNeeded(dbAdapter)).toBe(3)
    const raw = await dbAdapter.select<Array<{ name: string }>>(`SELECT name FROM people WHERE id = 'legacy-person'`)
    expect(raw[0]?.name).toMatch(/^v1:/)
    expect((await listPeopleByProduction(PROD))[0]?.name).toBe('Legacy Person')

    setTestDataEncryptionKeyForTests(null)
    await expect(listPeopleByProduction(PROD)).rejects.toBeInstanceOf(EncryptionKeyUnavailableError)
    await expect(listLocationsByProduction(PROD)).rejects.toBeInstanceOf(EncryptionKeyUnavailableError)
    await expect(listVendors(PROD)).rejects.toBeInstanceOf(EncryptionKeyUnavailableError)
  })

  it('rotates protected entity ciphertext to a replacement DEK', async () => {
    await createPerson({ production_id: PROD, name: 'Rotating Person', is_cast: 1, email: 'rotate@example.test' })
    await createLocation({ production_id: PROD, name: 'Rotating Place', booked_status: 'booked', address: '3 Rotate Lane' })
    await createVendor({ production_id: PROD, company_name: 'Rotating Vendor', primary_contact_email: 'rotate@vendor.test' })

    const replacementDek = new Uint8Array(32).fill(27)
    expect(await reencryptAllClientFields(dbAdapter, { fromDek: DEK, toDek: replacementDek })).toBe(3)
    setTestDataEncryptionKeyForTests(replacementDek)
    expect((await listPeopleByProduction(PROD))[0]?.email).toBe('rotate@example.test')
    expect((await listLocationsByProduction(PROD))[0]?.address).toBe('3 Rotate Lane')
    expect((await listVendors(PROD))[0]?.primary_contact_email).toBe('rotate@vendor.test')
  })
})
