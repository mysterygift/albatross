import { beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

let dbAdapter: ReturnType<typeof createSqlJsTauriAdapter>

const writeFileMock = vi.hoisted(() => vi.fn())
const writeTextFileMock = vi.hoisted(() => vi.fn())
const mkdirMock = vi.hoisted(() => vi.fn())
const removeMock = vi.hoisted(() => vi.fn())

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
  writeTextFile: writeTextFileMock,
  remove: removeMock,
}))

import { createProduction } from '@/lib/db/repositories/production'
import { listDocumentsByProduction } from '@/lib/db/repositories/document'
import { persistProductionDocument } from '@/lib/documents/persistDocument'
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

describe('persistProductionDocument', () => {
  beforeEach(async () => {
    writeFileMock.mockReset()
    writeTextFileMock.mockReset()
    mkdirMock.mockReset()
    removeMock.mockReset()
    mkdirMock.mockResolvedValue(undefined)
    writeFileMock.mockResolvedValue(undefined)
    writeTextFileMock.mockResolvedValue(undefined)
    removeMock.mockResolvedValue(undefined)

    const SQL = await initSqlJs()
    const db = new SQL.Database()
    applyAllMigrations(db)
    dbAdapter = createSqlJsTauriAdapter(db)
  })

  it('writes PDF bytes and inserts a documents row', async () => {
    const production = await createProduction({ name: 'Persist Test Production', notes: null })
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])

    const result = await persistProductionDocument({
      productionId: production.id,
      fileName: 'test-export.pdf',
      bytes,
      mimeType: 'application/pdf',
      entityType: DOCUMENT_ENTITY_TYPES.budgetCsv,
    })

    expect(writeFileMock).toHaveBeenCalled()
    expect(result.documentId).toBeTruthy()
    expect(result.relativePath).toContain(production.id)

    const docs = await listDocumentsByProduction(production.id)
    expect(docs).toHaveLength(1)
    expect(docs[0]!.entity_type).toBe(DOCUMENT_ENTITY_TYPES.budgetCsv)
    expect(docs[0]!.file_name).toBe('test-export.pdf')
  })

  it('writes text content when isText is true', async () => {
    const production = await createProduction({ name: 'CSV Persist Production', notes: null })

    await persistProductionDocument({
      productionId: production.id,
      fileName: 'report.csv',
      bytes: 'a,b,c',
      mimeType: 'text/csv',
      entityType: DOCUMENT_ENTITY_TYPES.budgetCsv,
      isText: true,
    })

    expect(writeTextFileMock).toHaveBeenCalled()
    const docs = await listDocumentsByProduction(production.id)
    expect(docs[0]!.mime_type).toBe('text/csv')
  })

  it('removes file when database insert fails', async () => {
    const production = await createProduction({ name: 'Rollback Production', notes: null })
    const { executeBatch } = await import('@/lib/db/client')
    vi.mocked(executeBatch).mockRejectedValueOnce(new Error('DB failure'))

    await expect(
      persistProductionDocument({
        productionId: production.id,
        fileName: 'orphan.pdf',
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'application/pdf',
        entityType: DOCUMENT_ENTITY_TYPES.cueSheet,
      })
    ).rejects.toThrow('DB failure')

    expect(removeMock).toHaveBeenCalled()
    expect(await listDocumentsByProduction(production.id)).toHaveLength(0)
  })
})
