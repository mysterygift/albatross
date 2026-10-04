import { describe, expect, it } from 'vitest'

import {
  APF_MAX_SUPPORTED_FORMAT_VERSION,
  APF_MIN_SUPPORTED_FORMAT_VERSION,
  CURRENT_APF_FORMAT_VERSION,
} from '@/lib/importExport/constants'
import {
  assertApfImportableFormatVersion,
  doesApfFormatRequireMigration,
  getApfFormatCompatibility,
  isApfFormatVersionTooNew,
  isApfFormatVersionTooOld,
} from '@/lib/importExport/compatibility'
import { ApfInvalidDataError, ApfUnknownFormatVersionError, ApfUnsupportedFormatVersionError } from '@/lib/importExport/errors'
import { migrateApfToCurrentVersion, migrateScenesDropHeading } from '@/lib/importExport/migrate'
import { normalizeApfManifestAndData } from '@/lib/importExport/pipeline'
import { parseApfV1DataFileJson } from '@/lib/importExport/payload'
import { APF_V9_TABLE_KEYS } from '@/lib/importExport/tableKeys'
import { buildFixtureDataAndManifest, emptyApfTables, minimalProductionRow, TEST_PRODUCTION_ID } from '@/test/apf/fixtures'

describe('getApfFormatCompatibility', () => {
  it('classifies current version as supported_current', () => {
    expect(getApfFormatCompatibility(CURRENT_APF_FORMAT_VERSION)).toEqual({ status: 'supported_current' })
  })

  it('classifies above max as unsupported_too_new', () => {
    expect(getApfFormatCompatibility(APF_MAX_SUPPORTED_FORMAT_VERSION + 1)).toMatchObject({
      status: 'unsupported_too_new',
      maxSupported: APF_MAX_SUPPORTED_FORMAT_VERSION,
    })
  })

  it('classifies below min as unsupported_too_old', () => {
    expect(getApfFormatCompatibility(APF_MIN_SUPPORTED_FORMAT_VERSION - 1)).toMatchObject({
      status: 'unsupported_too_old',
      minSupported: APF_MIN_SUPPORTED_FORMAT_VERSION,
    })
  })
})

describe('assertApfImportableFormatVersion', () => {
  it('allows supported range', () => {
    expect(() => assertApfImportableFormatVersion(CURRENT_APF_FORMAT_VERSION)).not.toThrow()
  })

  it('throws ApfUnsupportedFormatVersionError when too new', () => {
    expect(() => assertApfImportableFormatVersion(APF_MAX_SUPPORTED_FORMAT_VERSION + 1)).toThrow(
      ApfUnsupportedFormatVersionError
    )
  })

  it('throws ApfUnknownFormatVersionError when too old', () => {
    expect(() => assertApfImportableFormatVersion(0)).toThrow(ApfUnknownFormatVersionError)
  })
})

describe('isApfFormatVersionTooNew / TooOld / doesApfFormatRequireMigration', () => {
  it('matches compatibility helpers at boundaries', () => {
    expect(isApfFormatVersionTooNew(APF_MAX_SUPPORTED_FORMAT_VERSION + 1)).toBe(true)
    expect(isApfFormatVersionTooNew(APF_MAX_SUPPORTED_FORMAT_VERSION)).toBe(false)
    expect(isApfFormatVersionTooOld(APF_MIN_SUPPORTED_FORMAT_VERSION - 1)).toBe(true)
    expect(isApfFormatVersionTooOld(APF_MIN_SUPPORTED_FORMAT_VERSION)).toBe(false)
    expect(doesApfFormatRequireMigration(CURRENT_APF_FORMAT_VERSION)).toBe(false)
    expect(doesApfFormatRequireMigration(1)).toBe(true)
  })
})

describe('normalizeApfManifestAndData', () => {
  it('normalizes a v1 package from raw JSON objects', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    const normalized = normalizeApfManifestAndData(manifest, dataFile)
    expect(normalized.manifest.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
    expect(normalized.data.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
  })

  it('rejects manifest/data formatVersion mismatch', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    const badData = { ...dataFile, formatVersion: 99 }
    expect(() => normalizeApfManifestAndData(manifest, badData)).toThrow(ApfInvalidDataError)
  })

  it('migrates legacy v1 shape (no episodic keys) to current format', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const { manifest: fullManifest, dataFile } = buildFixtureDataAndManifest({ tables })
    const manifestV1 = { ...fullManifest, formatVersion: 1 }
    const dataV1 = JSON.parse(JSON.stringify(dataFile)) as typeof dataFile
    dataV1.formatVersion = 1
    delete (dataV1.tables as Record<string, unknown>).episodes
    delete (dataV1.tables as Record<string, unknown>).shooting_blocs
    const prow = dataV1.tables.productions[0] as Record<string, unknown>
    delete prow.is_episodic

    const normalized = normalizeApfManifestAndData(manifestV1, dataV1)
    expect(normalized.manifest.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
    expect(normalized.data.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
    expect(normalized.data.tables.episodes).toEqual([])
    expect(normalized.data.tables.shooting_blocs).toEqual([])
    expect((normalized.data.tables.productions[0] as Record<string, unknown>).is_episodic).toBe(0)
  })
})

describe('migrateApfToCurrentVersion', () => {
  it('is a no-op when file is already at CURRENT_APF_FORMAT_VERSION', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    const out = migrateApfToCurrentVersion({ manifest, data: dataFile })
    expect(out.manifest.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
    expect(out.data.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
  })

  it('runs v1→v2 when manifest and data declare formatVersion 1', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const { manifest: m2, dataFile: d2 } = buildFixtureDataAndManifest({ tables })
    const manifest = { ...m2, formatVersion: 1 as const }
    const data = JSON.parse(JSON.stringify(d2)) as (typeof d2 & { formatVersion: number })
    data.formatVersion = 1
    const out = migrateApfToCurrentVersion({ manifest, data })
    expect(out.manifest.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
    expect(out.data.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
    expect(Array.isArray(out.data.tables.episodes)).toBe(true)
  })

  it('v2→v3 synthesizes budget_revisions referenced by budget rows', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const revId = 'rev-import-1'
    tables.fringe_rules = [
      {
        id: 'fr-1',
        production_id: TEST_PRODUCTION_ID,
        budget_revision_id: revId,
        name: 'Fringe',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        deleted_at: null,
      },
    ]
    const { manifest: m3, dataFile: d3 } = buildFixtureDataAndManifest({ tables })
    const manifest = { ...m3, formatVersion: 2 as const }
    const data = JSON.parse(JSON.stringify(d3)) as (typeof d3 & { formatVersion: number })
    data.formatVersion = 2
    delete (data.tables as Record<string, unknown>).budget_revisions
    delete (data.tables as Record<string, unknown>).floats
    delete (data.tables as Record<string, unknown>).float_expense_links

    const out = migrateApfToCurrentVersion({ manifest, data })
    expect(out.data.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
    expect(out.data.tables.budget_revisions).toHaveLength(1)
    expect(out.data.tables.budget_revisions[0]!.id).toBe(revId)
  })

  it('v4→v5 adds an empty vendor_purchase_order_amendments table and keeps link rows', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    tables.vendor_purchase_order_expenses = [
      { id: 'l1', vendor_purchase_order_id: 'po1', expense_id: 'e1', created_at: 't', updated_at: 't' },
    ]
    const { manifest: m5, dataFile: d5 } = buildFixtureDataAndManifest({ tables })
    const manifest = { ...m5, formatVersion: 4 as const }
    const data = JSON.parse(JSON.stringify(d5)) as (typeof d5 & { formatVersion: number })
    data.formatVersion = 4
    delete (data.tables as Record<string, unknown>).vendor_purchase_order_amendments

    const out = migrateApfToCurrentVersion({ manifest, data })
    expect(out.data.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
    expect(out.data.tables.vendor_purchase_order_amendments).toEqual([])
    expect(out.data.tables.vendor_purchase_order_expenses).toHaveLength(1)
  })

  it('v5→v6 adds an empty expense_receipts table', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const { manifest: m6, dataFile: d6 } = buildFixtureDataAndManifest({ tables })
    const manifest = { ...m6, formatVersion: 5 as const }
    const data = JSON.parse(JSON.stringify(d6)) as (typeof d6 & { formatVersion: number })
    data.formatVersion = 5
    delete (data.tables as Record<string, unknown>).expense_receipts

    const out = migrateApfToCurrentVersion({ manifest, data })
    expect(out.data.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
    expect(out.data.tables.expense_receipts).toEqual([])
  })

  it('v6→v7 backfills PO currency (NULL) and derives approval from status', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const po = (id: string, status: string, approval: number) => ({
      id,
      production_id: 'p1',
      vendor_id: 'v1',
      po_number: id,
      status,
      approval,
      created_at: 't',
      updated_at: 't',
    })
    tables.vendor_purchase_orders = [
      po('ticked-draft', 'draft', 1),
      po('ticked-issued', 'issued', 1),
      po('plain-issued', 'issued', 0),
      po('approved', 'approved', 0),
      po('closed', 'closed', 0),
      po('cancelled', 'cancelled', 1),
    ]
    const { manifest: m7, dataFile: d7 } = buildFixtureDataAndManifest({ tables })
    const manifest = { ...m7, formatVersion: 6 as const }
    const data = JSON.parse(JSON.stringify(d7)) as (typeof d7 & { formatVersion: number })
    data.formatVersion = 6

    const out = migrateApfToCurrentVersion({ manifest, data })
    expect(out.data.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
    const rows = Object.fromEntries(
      (out.data.tables.vendor_purchase_orders as Array<Record<string, unknown>>).map((r) => [r.id, r])
    )
    expect(rows['ticked-draft']).toMatchObject({ status: 'approved', approval: 1, currency_code: null, exchange_rate: null })
    expect(rows['ticked-issued']).toMatchObject({ status: 'approved', approval: 1 })
    expect(rows['plain-issued']).toMatchObject({ status: 'issued', approval: 0 })
    expect(rows['approved']).toMatchObject({ status: 'approved', approval: 1 })
    expect(rows['closed']).toMatchObject({ status: 'closed', approval: 1 })
    expect(rows['cancelled']).toMatchObject({ status: 'cancelled', approval: 0 })
  })

  it('v8→v9 adds the script sections and script supervisor tables as empty arrays', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const { manifest: m9, dataFile: d9 } = buildFixtureDataAndManifest({ tables })
    const manifest = { ...m9, formatVersion: 8 as const }
    const data = JSON.parse(JSON.stringify(d9)) as (typeof d9 & { formatVersion: number })
    data.formatVersion = 8
    for (const key of APF_V9_TABLE_KEYS) delete (data.tables as Record<string, unknown>)[key]

    const out = migrateApfToCurrentVersion({ manifest, data: data as typeof d9 })
    expect(out.manifest.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
    for (const key of APF_V9_TABLE_KEYS) expect(out.data.tables[key]).toEqual([])
  })

  it('normalizes a v8 file that has none of the v9 table keys', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const { manifest, dataFile } = buildFixtureDataAndManifest({ tables })
    const rawData = JSON.parse(JSON.stringify(dataFile)) as { formatVersion: number; tables: Record<string, unknown> }
    rawData.formatVersion = 8
    for (const key of APF_V9_TABLE_KEYS) delete rawData.tables[key]

    const out = normalizeApfManifestAndData({ ...manifest, formatVersion: 8 }, rawData)
    expect(out.data.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
    expect(out.data.tables.slates).toEqual([])
  })

  it('v3→v4 backfills scenes.title from heading and removes heading', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    tables.scenes = [
      {
        id: 'scene-1',
        production_id: TEST_PRODUCTION_ID,
        scene_number: '1',
        heading: 'INT. KITCHEN - DAY',
        title: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        deleted_at: null,
      },
      {
        id: 'scene-2',
        production_id: TEST_PRODUCTION_ID,
        scene_number: '2',
        heading: 'EXT. PARK - DAY',
        title: 'Park beat',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        deleted_at: null,
      },
    ]
    const { manifest: m4, dataFile: d4 } = buildFixtureDataAndManifest({ tables })
    const manifest = { ...m4, formatVersion: 3 as const }
    const data = JSON.parse(JSON.stringify(d4)) as (typeof d4 & { formatVersion: number })
    data.formatVersion = 3

    const out = migrateApfToCurrentVersion({ manifest, data })
    expect(out.data.formatVersion).toBe(CURRENT_APF_FORMAT_VERSION)
    const scenes = out.data.tables.scenes as Array<Record<string, unknown>>
    expect(scenes[0]!.title).toBe('INT. KITCHEN - DAY')
    expect(scenes[0]).not.toHaveProperty('heading')
    expect(scenes[1]!.title).toBe('Park beat')
    expect(scenes[1]).not.toHaveProperty('heading')
  })

  it('v3→v4 clears legacy UNK day_night on scenes', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    tables.scenes = [
      {
        id: 'scene-unk',
        production_id: TEST_PRODUCTION_ID,
        scene_number: '1',
        day_night: 'UNK',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        deleted_at: null,
      },
    ]
    const { manifest: m4, dataFile: d4 } = buildFixtureDataAndManifest({ tables })
    const manifest = { ...m4, formatVersion: 3 as const }
    const data = JSON.parse(JSON.stringify(d4)) as (typeof d4 & { formatVersion: number })
    data.formatVersion = 3

    const out = migrateApfToCurrentVersion({ manifest, data })
    expect(out.data.tables.scenes[0]!.day_night).toBeNull()
  })

  it('v3→v4 clears legacy UNK int_ext on scenes', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    tables.scenes = [
      {
        id: 'scene-unk-ie',
        production_id: TEST_PRODUCTION_ID,
        scene_number: '2',
        int_ext: 'UNK',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        deleted_at: null,
      },
    ]
    const { manifest: m4, dataFile: d4 } = buildFixtureDataAndManifest({ tables })
    const manifest = { ...m4, formatVersion: 3 as const }
    const data = JSON.parse(JSON.stringify(d4)) as (typeof d4 & { formatVersion: number })
    data.formatVersion = 3

    const out = migrateApfToCurrentVersion({ manifest, data })
    expect(out.data.tables.scenes[0]!.int_ext).toBeNull()
  })
})

describe('migrateScenesDropHeading', () => {
  it('is idempotent when heading is already absent', () => {
    const tables = emptyApfTables()
    tables.scenes = [
      {
        id: 'scene-1',
        production_id: TEST_PRODUCTION_ID,
        scene_number: '1',
        title: 'Existing title',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        deleted_at: null,
      },
    ]
    migrateScenesDropHeading(tables)
    expect(tables.scenes[0]!.title).toBe('Existing title')
    expect(tables.scenes[0]).not.toHaveProperty('heading')
  })
})

describe('parseApfV1DataFileJson', () => {
  it('rejects unknown top-level table keys', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const { dataFile } = buildFixtureDataAndManifest({ tables })
    const raw = JSON.parse(JSON.stringify(dataFile)) as Record<string, unknown>
    ;(raw.tables as Record<string, unknown>).not_a_real_table = []
    expect(() => parseApfV1DataFileJson(raw)).toThrow(ApfInvalidDataError)
  })
})
