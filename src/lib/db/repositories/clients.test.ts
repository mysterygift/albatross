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

import {
  countProductionsForClient,
  createClient,
  getClientById,
  listClients,
  listClientsWithProjectCounts,
  softDeleteClient,
  updateClient,
} from '@/lib/db/repositories/clients'
import { createProduction, getProductionById, updateProduction } from '@/lib/db/repositories/production'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAllMigrations(db)
  dbAdapter = createSqlJsTauriAdapter(db)
  return db
}

describe('clients repository', () => {
  beforeEach(async () => {
    await makeDb()
  })

  it('createClient and listClients', async () => {
    const c = await createClient({
      name: 'Acme Corp',
      email: 'hello@acme.test',
      phone: '+15550100100',
    })
    expect(c.name).toBe('Acme Corp')
    const listed = await listClients()
    expect(listed.some((x) => x.id === c.id)).toBe(true)
  })

  it('updateClient changes fields', async () => {
    const c = await createClient({ name: 'Before', email: null, phone: null })
    const updated = await updateClient(c.id, {
      name: 'After',
      email: 'contact@client.test',
      phone: '+441234567890',
    })
    expect(updated.name).toBe('After')
    expect(updated.email).toBe('contact@client.test')
    expect(updated.phone).toBe('+441234567890')
  })

  it('softDeleteClient removes from listClients and clears production links', async () => {
    const c = await createClient({ name: 'To Delete' })
    const prod = await createProduction(
      { name: 'Linked Prod', notes: null },
      { skipBudgetSeed: true, clientId: c.id }
    )
    await softDeleteClient(c.id)
    expect(await getClientById(c.id)).toBeNull()
    expect((await listClients()).some((x) => x.id === c.id)).toBe(false)
    const refreshed = await getProductionById(prod.id)
    expect(refreshed?.client_id).toBeNull()
  })

  it('countProductionsForClient and listClientsWithProjectCounts', async () => {
    const client = await createClient({ name: 'Counted' })
    await createProduction(
      { name: 'Linked', notes: null },
      { skipBudgetSeed: true, clientId: client.id }
    )
    expect(await countProductionsForClient(client.id)).toBe(1)
    const rows = await listClientsWithProjectCounts()
    const row = rows.find((r) => r.id === client.id)
    expect(row?.project_count).toBe(1)
  })
})

describe('createProduction with client and delivery date', () => {
  beforeEach(async () => {
    await makeDb()
  })

  it('creates production linked to existing client', async () => {
    const client = await createClient({ name: 'Existing Client' })
    const prod = await createProduction(
      { name: 'With Client', notes: null },
      { skipBudgetSeed: true, clientId: client.id, deliveryDate: '2026-12-01' }
    )
    expect(prod.client_id).toBe(client.id)
    expect(prod.delivery_date).toBe('2026-12-01')
  })

  it('creates new client and production atomically', async () => {
    const prod = await createProduction(
      { name: 'New Client Prod', notes: null },
      {
        skipBudgetSeed: true,
        newClient: { name: 'Inline Client', email: 'c@test.com', phone: '123' },
        deliveryDate: '2026-06-15',
      }
    )
    expect(prod.client_id).toBeTruthy()
    const client = await getClientById(prod.client_id!)
    expect(client?.name).toBe('Inline Client')
    expect(client?.email).toBe('c@test.com')
    expect(prod.delivery_date).toBe('2026-06-15')
  })

  it('updateProduction can change client and delivery date', async () => {
    const prod = await createProduction({ name: 'To Update', notes: null }, { skipBudgetSeed: true })
    const client = await createClient({ name: 'Later Client' })
    const updated = await updateProduction(prod.id, {
      clientId: client.id,
      deliveryDate: '2027-01-20',
    })
    expect(updated.client_id).toBe(client.id)
    expect(updated.delivery_date).toBe('2027-01-20')
  })
})
