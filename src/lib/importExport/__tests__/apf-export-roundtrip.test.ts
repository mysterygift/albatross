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
import { DOCUMENT_ENTITY_TYPES } from '@/lib/documents/catalog'
import { apfDocumentBundledZipPath } from '@/lib/importExport/documentPaths'

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

  it('round-trips vendor invoice attachment metadata (entity_type vendor_invoice)', () => {
    const invoiceId = '33333333-3333-4333-8333-333333333333'
    const vendorId = '44444444-4444-4444-8444-444444444444'
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    tables.vendors = [
      {
        id: vendorId,
        production_id: TEST_PRODUCTION_ID,
        company_name: 'Fixture Vendor',
        primary_contact_full_name: null,
        primary_contact_email: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        deleted_at: null,
      },
    ]
    tables.vendor_invoices = [
      {
        id: invoiceId,
        production_id: TEST_PRODUCTION_ID,
        vendor_id: vendorId,
        po_id: null,
        invoice_number: 'INV-FIXTURE',
        issue_date: '2025-01-10',
        due_date: null,
        amount: 120,
        tax: null,
        currency_code: 'GBP',
        status: 'received',
        notes: null,
        created_at: '2025-01-10T00:00:00.000Z',
        updated_at: '2025-01-10T00:00:00.000Z',
        deleted_at: null,
      },
    ]
    tables.documents = [
      documentFixtureRow({
        entity_type: DOCUMENT_ENTITY_TYPES.vendorInvoice,
        entity_id: invoiceId,
        file_name: 'invoice.pdf',
      }),
    ]
    const pdf = new TextEncoder().encode('%PDF vendor invoice')
    const doc = tables.documents[0]!
    const bytes = buildValidApfZipBytes({
      tables,
      bundled: [
        {
          archivePath: apfDocumentBundledZipPath(String(doc.id), String(doc.file_name)),
          bytes: pdf,
        },
      ],
      bundledDocumentIds: [String(doc.id)],
    })
    const { index, normalized } = parseApfArchiveBytes(bytes)
    const importedDoc = normalized.data.tables.documents[0]!
    expect(importedDoc.entity_type).toBe(DOCUMENT_ENTITY_TYPES.vendorInvoice)
    expect(importedDoc.entity_id).toBe(invoiceId)
    expect(normalized.data.tables.vendor_invoices).toHaveLength(1)
    const zipPath = `files/documents/${TEST_DOCUMENT_ID}/invoice.pdf`
    expect(index.has(zipPath)).toBe(true)
  })

  it('round-trips identifying fields without privacy redaction', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    tables.people = [
      {
        id: 'person-privacy-1',
        production_id: TEST_PRODUCTION_ID,
        name: 'Morgan Camera',
        email: 'morgan@example.test',
        phone: '+44 7700 900123',
        agent_name: 'Alex Agent',
        agent_email: 'alex.agent@example.test',
        agent_phone: '+44 7700 900456',
      },
    ]
    tables.locations = [
      {
        id: 'location-privacy-1',
        production_id: TEST_PRODUCTION_ID,
        name: 'Private Residence',
        address: '12 Sensitive Street, London',
      },
    ]
    tables.vendors = [
      {
        id: 'vendor-privacy-1',
        production_id: TEST_PRODUCTION_ID,
        company_name: 'Private Supplier',
        primary_contact_full_name: 'Taylor Vendor',
        primary_contact_email: 'taylor@example.test',
        primary_contact_phone: '+44 7700 900789',
        address: '44 Supplier Road, London',
      },
    ]

    const parsed = parseApfArchiveBytes(buildValidApfZipBytes({ tables })).normalized.data.tables

    expect(parsed.people[0]).toEqual(tables.people[0])
    expect(parsed.locations[0]).toEqual(tables.locations[0])
    expect(parsed.vendors[0]).toEqual(tables.vendors[0])
  })
})
