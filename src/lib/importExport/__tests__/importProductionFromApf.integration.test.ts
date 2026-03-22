import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApfImportConflictError, ApfImportDbError, ApfImportIoError } from '@/lib/importExport/errors'
import { importProductionFromApf } from '@/lib/importExport/importProduction'
import { resetApfImportPragmaCache } from '@/lib/importExport/planImportStatements'
import {
  buildMinimalProductionZip,
  buildProductionWithBundledDocumentZip,
  buildValidApfZipBytes,
  documentFixtureRow,
  emptyApfTables,
  minimalProductionRow,
  TEST_DOCUMENT_ID,
  TEST_PRODUCTION_ID,
} from '@/test/apf/fixtures'
import { createMockApfImportDb } from '@/test/apf/mockImportDb'
import { apfDocumentBundledZipPath } from '@/lib/importExport/documentPaths'

vi.mock('@/lib/db/client', () => ({
  getDb: vi.fn(),
  runInSerializedTransaction: (fn: () => Promise<unknown>) => fn(),
  executeBatch: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  readFile: vi.fn(),
  remove: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
}))

import { executeBatch, getDb } from '@/lib/db/client'
import { mkdir, readFile, remove, writeFile } from '@tauri-apps/plugin-fs'

/** Satisfies `@tauri-apps/plugin-fs` `readFile` mock typing (`ArrayBuffer` vs `ArrayBufferLike`). */
function asReadFileResult(bytes: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(bytes) as Uint8Array<ArrayBuffer>
}

describe('importProductionFromApf (mocked I/O + DB)', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
    vi.mocked(executeBatch).mockReset()
    vi.mocked(readFile).mockReset()
    vi.mocked(remove).mockReset()
    vi.mocked(mkdir).mockReset()
    vi.mocked(writeFile).mockReset()
    vi.mocked(writeFile).mockResolvedValue(undefined)
    vi.mocked(executeBatch).mockResolvedValue(undefined as never)
    resetApfImportPragmaCache()
  })

  it('imports minimal archive: commits SQL batch and does not write attachments', async () => {
    vi.mocked(readFile).mockResolvedValue(asReadFileResult(buildMinimalProductionZip()))
    vi.mocked(getDb).mockResolvedValue(
      createMockApfImportDb({
        tableSamples: { productions: minimalProductionRow() },
      }) as never
    )

    const result = await importProductionFromApf('/tmp/import.apf')
    expect(result.ok).toBe(true)
    expect(writeFile).not.toHaveBeenCalled()
    expect(executeBatch).toHaveBeenCalledTimes(1)
    const stmts = vi.mocked(executeBatch).mock.calls[0]![1]
    expect(stmts[0]!.sql).toMatch(/BEGIN/i)
    expect(stmts[stmts.length - 1]!.sql).toMatch(/COMMIT/i)
    const prodInsert = stmts.find((s) => s.sql.includes('INSERT INTO productions'))
    expect(prodInsert?.bindValues).toContain(TEST_PRODUCTION_ID)
  })

  it('rewrites document file_path, writes attachment bytes, and inserts updated row', async () => {
    const pdf = new TextEncoder().encode('attachment-body')
    vi.mocked(readFile).mockResolvedValue(asReadFileResult(buildProductionWithBundledDocumentZip(pdf)))
    vi.mocked(getDb).mockResolvedValue(
      createMockApfImportDb({
        tableSamples: {
          productions: minimalProductionRow(),
          documents: documentFixtureRow(),
        },
      }) as never
    )

    const result = await importProductionFromApf('/tmp/with-doc.apf')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.filesRestored).toBe(1)
    }
    const rel = `attachments/${TEST_PRODUCTION_ID}/${TEST_DOCUMENT_ID}-spec.pdf`
    expect(writeFile).toHaveBeenCalledWith(rel, pdf, { baseDir: 1 })
    const stmts = vi.mocked(executeBatch).mock.calls[0]![1]
    const docInsert = stmts.find((s) => s.sql.includes('INSERT INTO documents'))
    expect(docInsert).toBeDefined()
    expect(JSON.stringify(docInsert!.bindValues)).toContain(rel)
  })

  it('returns IMPORT_CONFLICT when production id already exists (no DB batch, no files)', async () => {
    vi.mocked(readFile).mockResolvedValue(asReadFileResult(buildMinimalProductionZip()))
    vi.mocked(getDb).mockResolvedValue(
      createMockApfImportDb({
        existingProductionIds: [TEST_PRODUCTION_ID],
        tableSamples: { productions: minimalProductionRow() },
      }) as never
    )

    const result = await importProductionFromApf('/tmp/dup.apf')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ApfImportConflictError)
    }
    expect(executeBatch).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('returns IMPORT_CONFLICT on slug collision', async () => {
    vi.mocked(readFile).mockResolvedValue(asReadFileResult(buildMinimalProductionZip()))
    vi.mocked(getDb).mockResolvedValue(
      createMockApfImportDb({
        existingSlug: { slug: 'fixture-prod', id: 'other-prod-id' },
        tableSamples: { productions: minimalProductionRow() },
      }) as never
    )

    const result = await importProductionFromApf('/tmp/slug.apf')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ApfImportConflictError)
      expect((result.error as ApfImportConflictError).conflict).toBe('slug')
    }
    expect(executeBatch).not.toHaveBeenCalled()
  })

  it('imports when document row has no zip entry: no attachment write, warning, DB still commits', async () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    tables.documents = [documentFixtureRow()]
    const bytes = buildValidApfZipBytes({ tables, bundled: [], bundledDocumentIds: [] })
    vi.mocked(readFile).mockResolvedValue(asReadFileResult(bytes))
    vi.mocked(getDb).mockResolvedValue(
      createMockApfImportDb({
        tableSamples: {
          productions: minimalProductionRow(),
          documents: documentFixtureRow(),
        },
      }) as never
    )

    const result = await importProductionFromApf('/tmp/no-zip-doc.apf')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.filesRestored).toBe(0)
      expect(result.warnings.length).toBeGreaterThan(0)
    }
    expect(writeFile).not.toHaveBeenCalled()
    expect(executeBatch).toHaveBeenCalled()
  })

  it('rolls back extracted files when executeBatch fails at COMMIT', async () => {
    const pdf = new TextEncoder().encode('will-rollback')
    vi.mocked(readFile).mockResolvedValue(asReadFileResult(buildProductionWithBundledDocumentZip(pdf)))
    vi.mocked(getDb).mockResolvedValue(
      createMockApfImportDb({
        tableSamples: {
          productions: minimalProductionRow(),
          documents: documentFixtureRow(),
        },
      }) as never
    )
    vi.mocked(executeBatch).mockRejectedValue(new Error('SQLITE_CONSTRAINT'))

    const result = await importProductionFromApf('/tmp/fail.apf')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ApfImportDbError)
    }
    const rel = `attachments/${TEST_PRODUCTION_ID}/${TEST_DOCUMENT_ID}-spec.pdf`
    expect(remove).toHaveBeenCalledWith(rel, { baseDir: 1 })
  })

  it('removes partially written attachments when a later document write fails', async () => {
    const docA = documentFixtureRow({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      file_name: 'first.pdf',
    })
    const docB = documentFixtureRow({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      file_name: 'second.pdf',
    })
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    tables.documents = [docA, docB]
    const bytes = buildValidApfZipBytes({
      tables,
      bundled: [
        { archivePath: apfDocumentBundledZipPath(String(docA.id), 'first.pdf'), bytes: new Uint8Array([1]) },
        { archivePath: apfDocumentBundledZipPath(String(docB.id), 'second.pdf'), bytes: new Uint8Array([2]) },
      ],
      bundledDocumentIds: [String(docA.id), String(docB.id)].sort(),
    })
    vi.mocked(readFile).mockResolvedValue(asReadFileResult(bytes))
    vi.mocked(getDb).mockResolvedValue(
      createMockApfImportDb({
        tableSamples: {
          productions: minimalProductionRow(),
          documents: docA,
        },
      }) as never
    )
    vi.mocked(writeFile).mockImplementation(async (path) => {
      if (String(path).includes('bbbbbbbb')) {
        throw new Error('disk full')
      }
    })

    const result = await importProductionFromApf('/tmp/partial.apf')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ApfImportIoError)
    }
    expect(executeBatch).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith(`attachments/${TEST_PRODUCTION_ID}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-first.pdf`, {
      baseDir: 1,
    })
  })
})
