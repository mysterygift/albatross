/**
 * Programmatic `.apf` fixtures for Vitest (no large binary blobs in git).
 */
import { buildApfZipBytes, type ApfZipBundledFile } from '@/lib/importExport/buildApfArchive'
import { buildApfExportManifest } from '@/lib/importExport/buildExportManifest'
import { buildApfV1ExportDataFile, countTableRows } from '@/lib/importExport/buildExportPayload'
import { APF_MANIFEST_ENTRY_PATH, APF_V1_DATA_ENTRY_PATH } from '@/lib/importExport/constants'
import { apfDocumentBundledZipPath } from '@/lib/importExport/documentPaths'
import type { ApfManifestV1 } from '@/lib/importExport/manifest'
import type { ApfTableRow, ApfV1DataFile, ApfV1Tables } from '@/lib/importExport/payload'
import { APF_V1_TABLE_KEYS } from '@/lib/importExport/tableKeys'
import { strToU8, zipSync } from 'fflate'

export const TEST_PRODUCTION_ID = '11111111-1111-4111-8111-111111111111'
export const TEST_DOCUMENT_ID = '22222222-2222-4222-8222-222222222222'

export function emptyApfTables(): ApfV1Tables {
  const tables = {} as ApfV1Tables
  for (const k of APF_V1_TABLE_KEYS) {
    tables[k] = []
  }
  return tables
}

/** Representative production row keys aligned with typical export (see migrations on `productions`). */
export function minimalProductionRow(overrides: Partial<ApfTableRow> = {}): ApfTableRow {
  return {
    id: TEST_PRODUCTION_ID,
    name: 'Fixture Production',
    notes: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    deleted_at: null,
    slug: 'fixture-prod',
    archived_at: null,
    currency_code: 'GBP',
    wrapped_at: null,
    created_from_template: null,
    is_episodic: 0,
    client_id: null,
    delivery_date: null,
    ...overrides,
  }
}

/** Document row as in `data/production.json`; `file_path` may be a bogus host path (import rewrites). */
export function documentFixtureRow(overrides: Partial<ApfTableRow> = {}): ApfTableRow {
  return {
    id: TEST_DOCUMENT_ID,
    production_id: TEST_PRODUCTION_ID,
    entity_type: null,
    entity_id: null,
    file_name: 'spec.pdf',
    file_path: '/Users/example/Library/Containers/evil/spec.pdf',
    mime_type: 'application/pdf',
    created_at: '2025-01-02T00:00:00.000Z',
    updated_at: '2025-01-02T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

export function buildFixtureDataAndManifest(params: {
  tables: ApfV1Tables
  bundledDocumentIds?: string[]
  missingDocumentFileIds?: string[]
}): { manifest: ApfManifestV1; dataFile: ApfV1DataFile } {
  const dataFile = buildApfV1ExportDataFile(params.tables)
  const prod = params.tables.productions[0]
  if (!prod || typeof prod.id !== 'string') {
    throw new Error('fixtures: expected exactly one productions row')
  }
  const manifest = buildApfExportManifest({
    productionId: String(prod.id),
    productionName: typeof prod.name === 'string' ? prod.name : 'Fixture',
    slug: prod.slug != null && String(prod.slug).length > 0 ? String(prod.slug) : undefined,
    exportedAtIso: '2025-03-22T12:00:00.000Z',
    tableRowCounts: countTableRows(params.tables),
    bundledDocumentIds: params.bundledDocumentIds ?? [],
    missingDocumentFileIds: params.missingDocumentFileIds ?? [],
  })
  return { manifest, dataFile }
}

export function buildValidApfZipBytes(params: {
  tables: ApfV1Tables
  bundled?: ApfZipBundledFile[]
  bundledDocumentIds?: string[]
}): Uint8Array {
  const { manifest, dataFile } = buildFixtureDataAndManifest({
    tables: params.tables,
    bundledDocumentIds: params.bundledDocumentIds,
  })
  return buildApfZipBytes(manifest, dataFile, params.bundled ?? [])
}

export function buildMinimalProductionZip(): Uint8Array {
  const tables = emptyApfTables()
  tables.productions = [minimalProductionRow()]
  return buildValidApfZipBytes({ tables })
}

export function buildProductionWithBundledDocumentZip(pdfBytes: Uint8Array = new TextEncoder().encode('%PDF-1.4 fixture')): Uint8Array {
  const tables = emptyApfTables()
  tables.productions = [minimalProductionRow()]
  const doc = documentFixtureRow()
  tables.documents = [doc]
  const bundled: ApfZipBundledFile[] = [
    {
      archivePath: apfDocumentBundledZipPath(String(doc.id), String(doc.file_name)),
      bytes: pdfBytes,
    },
  ]
  return buildValidApfZipBytes({
    tables,
    bundled,
    bundledDocumentIds: [String(doc.id)],
  })
}

/** ZIP that has magic bytes but is not a readable archive. */
export function corruptZipAfterMagic(): Uint8Array {
  const b = new Uint8Array(64)
  b[0] = 0x50
  b[1] = 0x4b
  b[2] = 0xff
  b[3] = 0xff
  return b
}

/** Valid zip layout but `manifest.json` is not valid APF manifest JSON shape. */
export function zipWithInvalidManifestJson(): Uint8Array {
  return zipSync({
    [APF_MANIFEST_ENTRY_PATH]: strToU8('{"not":"a manifest"}'),
    [APF_V1_DATA_ENTRY_PATH]: strToU8('{}'),
  })
}

/** Valid zip with manifest only (missing data/production.json). */
export function zipMissingDataEntry(manifest: ApfManifestV1): Uint8Array {
  return zipSync({
    [APF_MANIFEST_ENTRY_PATH]: strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
  })
}
