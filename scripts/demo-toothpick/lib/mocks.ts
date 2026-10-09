/**
 * Test-environment shims shared by the generator and verifier: the app's SQLite client is routed
 * to an in-memory sql.js database built from the real migrations, and Tauri's fs plugin to a temp
 * directory. Mirrors src/lib/importExport/__tests__/apf-e2e-sqljs.integration.test.ts. `now` and
 * `uuid` are made deterministic so regenerating the project is reproducible.
 */
import { createHash } from 'node:crypto'
import { vi } from 'vitest'

vi.mock('@/lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/client')>()
  const { sqlJsApfE2eContext: ctx } = await import('@/test/apf/sqlJsApfE2eContext')
  const { apfE2eExecuteBatchMock: batch } = await import('@/test/apf/apfE2eExecuteBatchMock')
  let n = 0
  return {
    ...actual,
    getDb: async () => {
      if (!ctx.adapter) throw new Error('sqlJsApfE2eContext.adapter not initialised')
      return ctx.adapter as never
    },
    runInSerializedTransaction: (fn: () => Promise<unknown>) => fn(),
    executeBatch: batch,
    now: () => '2026-09-14T09:00:00.000Z',
    uuid: () => {
      const h = createHash('sha1').update(`toothpick-script-rows/${n++}`).digest('hex').slice(0, 32).split('')
      h[12] = '5'
      h[16] = ['8', '9', 'a', 'b'][parseInt(h[16]!, 16) % 4]!
      const s = h.join('')
      return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`
    },
  }
})

vi.mock('@tauri-apps/plugin-fs', async () => {
  const pathMod = await import('node:path')
  const fs = await import('node:fs/promises')
  const { apfNodeFsTestContext: fsCtx } = await import('@/test/apf/apfNodeFsTestContext')
  const APP = 42
  const resolve = (p: string, opts?: { baseDir?: number }) => (opts?.baseDir === APP ? pathMod.join(fsCtx.appDataRoot, p) : p)
  return {
    BaseDirectory: { AppData: APP },
    readFile: async (p: string, opts?: { baseDir?: number }) => new Uint8Array(await fs.readFile(resolve(p, opts))),
    writeFile: async (p: string, data: Uint8Array, opts?: { baseDir?: number }) => {
      const full = resolve(p, opts)
      await fs.mkdir(pathMod.dirname(full), { recursive: true })
      await fs.writeFile(full, data)
    },
    mkdir: async (p: string, opts?: { baseDir?: number; recursive?: boolean }) => {
      await fs.mkdir(resolve(p, opts), { recursive: opts?.recursive ?? false })
    },
    remove: async (p: string, opts?: { baseDir?: number }) => {
      await fs.rm(resolve(p, opts), { force: true, recursive: true }).catch(() => undefined)
    },
  }
})
