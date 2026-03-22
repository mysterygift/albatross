import { describe, expect, it } from 'vitest'

import { buildApfV1ExportDataFile } from '@/lib/importExport/buildExportPayload'
import { parseApfArchiveBytes } from '@/lib/importExport/readApfArchive'
import type { ApfTableRow } from '@/lib/importExport/payload'
import {
  buildProductionWithBundledDocumentZip,
  buildValidApfZipBytes,
  documentFixtureRow,
  emptyApfTables,
  minimalProductionRow,
  TEST_DOCUMENT_ID,
  TEST_PRODUCTION_ID,
} from '@/test/apf/fixtures'

describe('export artifact → parse round-trip (no DB)', () => {
  it('preserves production id and core fields', () => {
    const tables = emptyApfTables()
    const prod = minimalProductionRow({ name: 'Round Trip Name', slug: 'round-trip' })
    tables.productions = [prod]
    const bytes = buildValidApfZipBytes({ tables })
    const { normalized } = parseApfArchiveBytes(bytes)
    const p = normalized.data.tables.productions[0]!
    expect(p.id).toBe(TEST_PRODUCTION_ID)
    expect(p.name).toBe('Round Trip Name')
    expect(p.slug).toBe('round-trip')
  })

  it('preserves multiple included tables and sorts row order deterministically in JSON', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const u2: ApfTableRow = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      production_id: TEST_PRODUCTION_ID,
      name: 'B Unit',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
      deleted_at: null,
    }
    const u1: ApfTableRow = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      production_id: TEST_PRODUCTION_ID,
      name: 'A Unit',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
      deleted_at: null,
    }
    tables.units = [u2, u1]
    const a = buildApfV1ExportDataFile(tables)
    const b = buildApfV1ExportDataFile(tables)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const bytes = buildValidApfZipBytes({ tables })
    const { normalized } = parseApfArchiveBytes(bytes)
    expect(normalized.data.tables.units.map((r) => r.id)).toEqual([u1.id, u2.id])
  })

  it('round-trips bundled document bytes and keeps archive paths under files/documents/', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    tables.documents = [documentFixtureRow()]
    const pdf = new TextEncoder().encode('%PDF-1.4 roundtrip')
    const bytes = buildProductionWithBundledDocumentZip(pdf)
    const { index, normalized } = parseApfArchiveBytes(bytes)
    expect(normalized.data.tables.documents).toHaveLength(1)
    const zipPath = `files/documents/${TEST_DOCUMENT_ID}/spec.pdf`
    expect(index.has(zipPath)).toBe(true)
    expect(new TextDecoder().decode(index.get(zipPath)!)).toBe('%PDF-1.4 roundtrip')
  })
})
