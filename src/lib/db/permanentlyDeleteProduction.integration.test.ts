/**
 * Permanently deleting a production must remove every row that belongs to it, with foreign keys
 * enforced as in the app (sqlx turns them on). Uses the Toothpick demo, which fills most tables.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs from 'sql.js'

import { importProductionFromApf } from '@/lib/importExport/importProduction'
import { permanentlyDeleteProduction } from '@/lib/db/repositories/production'
import { resetApfImportPragmaCache } from '@/lib/importExport/planImportStatements'
import { apfNodeFsTestContext } from '@/test/apf/apfNodeFsTestContext'
import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'
import { sqlJsApfE2eContext } from '@/test/apf/sqlJsApfE2eContext'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { setTestDataEncryptionKeyForTests } from '@/lib/security/dataEncryptionContext'
import {
  apfE2eExecuteBatchMock,
  sequentialExecuteBatchOnDb,
} from '@/test/apf/apfE2eExecuteBatchMock'

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  const { sqlJsApfE2eContext: ctx } = await import('@/test/apf/sqlJsApfE2eContext')
  const { apfE2eExecuteBatchMock: e2eBatch } = await import('@/test/apf/apfE2eExecuteBatchMock')
  return {
    ...actual,
    getDb: async () => {
      if (!ctx.adapter) throw new Error('sqlJsApfE2eContext.adapter not initialised')
      return ctx.adapter as never
    },
    runInSerializedTransaction: (fn: () => Promise<unknown>) => fn(),
    executeBatch: e2eBatch,
  }
})

vi.mock('@tauri-apps/plugin-fs', async () => {
  const pathMod = await import('node:path')
  const fs = await import('node:fs/promises')
  const { apfNodeFsTestContext: fsCtx } = await import('@/test/apf/apfNodeFsTestContext')
  const APP = 42
  return {
    BaseDirectory: { AppData: APP },
    readFile: async (p: string, opts?: { baseDir?: number }) => {
      const full = opts?.baseDir === APP ? pathMod.join(fsCtx.appDataRoot, p) : p
      const buf = await fs.readFile(full)
      return new Uint8Array(buf)
    },
    writeFile: async (p: string, data: Uint8Array, opts?: { baseDir?: number }) => {
      if (opts?.baseDir === APP) {
        const full = pathMod.join(fsCtx.appDataRoot, p)
        await fs.mkdir(pathMod.dirname(full), { recursive: true })
        await fs.writeFile(full, data)
        return
      }
      await fs.mkdir(pathMod.dirname(p), { recursive: true })
      await fs.writeFile(p, data)
    },
    mkdir: async (p: string, opts?: { baseDir?: number; recursive?: boolean }) => {
      const full = opts?.baseDir === APP ? pathMod.join(fsCtx.appDataRoot, p) : p
      await fs.mkdir(full, { recursive: opts?.recursive ?? false })
    },
    remove: async (p: string, opts?: { baseDir?: number }) => {
      const full = opts?.baseDir === APP ? pathMod.join(fsCtx.appDataRoot, p) : p
      try {
        await fs.rm(full, { force: true, recursive: true })
      } catch {
        /* ok */
      }
    },
  }
})

const DEMO_APF = join(process.cwd(), 'demo/Toothpick-Manchester-Demo.apf')

describe('permanentlyDeleteProduction (sql.js + migrations, foreign keys on)', () => {
  let workDir: string

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'albatross-delete-'))
    apfNodeFsTestContext.appDataRoot = join(workDir, 'appdata')
    await mkdir(apfNodeFsTestContext.appDataRoot, { recursive: true })
    const SQL = await initSqlJs({
      locateFile: (file: string) => join(process.cwd(), 'node_modules/sql.js/dist', file),
    })
    const raw = new SQL.Database()
    raw.exec('PRAGMA foreign_keys = ON')
    applyAlbatrossMigrationsSqlJs(raw)
    sqlJsApfE2eContext.rawDb = raw
    sqlJsApfE2eContext.adapter = createSqlJsTauriAdapter(raw)
  }, 120_000)

  afterAll(() => {
    setTestDataEncryptionKeyForTests(null)
    sqlJsApfE2eContext.adapter = null
    sqlJsApfE2eContext.rawDb?.close()
    sqlJsApfE2eContext.rawDb = null
    return rm(workDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    setTestDataEncryptionKeyForTests(new Uint8Array(32).fill(11))
    resetApfImportPragmaCache()
    apfE2eExecuteBatchMock.mockImplementation(sequentialExecuteBatchOnDb)
  })

  it('deletes the imported demo production and everything under it', async () => {
    const imp = await importProductionFromApf(DEMO_APF)
    if (!imp.ok) throw imp.error
    const raw = sqlJsApfE2eContext.rawDb!
    /** Rows of a query as objects (the project's sql.js typings only expose prepare/bind/step). */
    const rows = (sql: string, params: unknown[] = []): Record<string, unknown>[] => {
      const stmt = raw.prepare(sql)
      stmt.bind(params)
      const out: Record<string, unknown>[] = []
      while (stmt.step()) out.push(stmt.getAsObject())
      stmt.free()
      return out
    }
    const productionId = String(rows('SELECT id FROM productions')[0]!.id)
    // The demo has crew availability, whose missing cascade used to block the delete.
    expect(rows('SELECT id FROM crew_availability WHERE production_id = ?', [productionId]).length).toBeGreaterThan(0)

    await permanentlyDeleteProduction(productionId)

    expect(rows('SELECT id FROM productions WHERE id = ?', [productionId])).toEqual([])
    const leftovers: string[] = []
    for (const { name } of rows("SELECT name FROM sqlite_master WHERE type = 'table'")) {
      const table = String(name)
      const cols = rows(`PRAGMA table_info("${table}")`).map((c) => String(c.name))
      if (!cols.includes('production_id')) continue
      const n = Number(rows(`SELECT COUNT(*) AS n FROM "${table}" WHERE production_id = ?`, [productionId])[0]!.n)
      if (n > 0) leftovers.push(`${table}: ${n}`)
    }
    expect(leftovers).toEqual([])
    expect(rows('PRAGMA foreign_key_check')).toEqual([])
  }, 60_000)
})
