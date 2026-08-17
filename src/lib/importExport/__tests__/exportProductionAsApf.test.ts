import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  exportProductionAsApf,
  exportProductionAsApfForActor,
} from '@/lib/importExport/exportProduction'
import { parseApfArchiveBytes } from '@/lib/importExport/readApfArchive'
import { documentFixtureRow, emptyApfTables, minimalProductionRow, TEST_PRODUCTION_ID } from '@/test/apf/fixtures'

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/db/repositories/production', () => ({
  getProductionById: vi.fn(),
}))

vi.mock('@/lib/importExport/exportLoadProductionData', () => ({
  loadApfV1ProductionTables: vi.fn(),
}))

vi.mock('@/lib/importExport/collectApfDocumentFiles', () => ({
  collectApfDocumentBundledEntries: vi.fn(),
}))

vi.mock('@/lib/access/projectAccessService', () => ({
  requireProjectViewAccess: vi.fn(),
}))

import { collectApfDocumentBundledEntries } from '@/lib/importExport/collectApfDocumentFiles'
import { loadApfV1ProductionTables } from '@/lib/importExport/exportLoadProductionData'
import { getProductionById } from '@/lib/db/repositories/production'
import { writeFile } from '@tauri-apps/plugin-fs'
import { requireProjectViewAccess } from '@/lib/access/projectAccessService'

describe('exportProductionAsApf', () => {
  beforeEach(() => {
    vi.mocked(getProductionById).mockReset()
    vi.mocked(loadApfV1ProductionTables).mockReset()
    vi.mocked(collectApfDocumentBundledEntries).mockReset()
    vi.mocked(writeFile).mockReset()
    vi.mocked(writeFile).mockResolvedValue(undefined)
    vi.mocked(requireProjectViewAccess).mockReset()
    vi.mocked(requireProjectViewAccess).mockResolvedValue(undefined)
  })

  it('writes a parseable .apf with manifest, data, and bundled document entries', async () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    tables.documents = [documentFixtureRow()]
    const pdf = new TextEncoder().encode('pdf-bytes')

    vi.mocked(getProductionById).mockResolvedValue({
      id: TEST_PRODUCTION_ID,
      name: 'Fixture Production',
      slug: 'fixture-prod',
      currency_code: 'GBP',
      notes: null,
      client_id: null,
      delivery_date: null,
      is_episodic: false,
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
      deleted_at: null,
      wrapped_at: null,
      archived_at: null,
      created_from_template: null,
    })
    vi.mocked(loadApfV1ProductionTables).mockResolvedValue(tables)
    vi.mocked(collectApfDocumentBundledEntries).mockResolvedValue({
      entries: [
        {
          archivePath: 'files/documents/22222222-2222-4222-8222-222222222222/spec.pdf',
          bytes: pdf,
          documentId: '22222222-2222-4222-8222-222222222222',
        },
      ],
      missingDocumentFileIds: [],
    })

    await exportProductionAsApf(TEST_PRODUCTION_ID, '/tmp/out.apf')

    expect(writeFile).toHaveBeenCalledTimes(1)
    const [, bytes] = vi.mocked(writeFile).mock.calls[0]!
    expect(bytes).toBeInstanceOf(Uint8Array)
    const parsed = parseApfArchiveBytes(bytes as Uint8Array)
    expect(parsed.normalized.manifest.production.id).toBe(TEST_PRODUCTION_ID)
    expect(parsed.normalized.data.tables.documents).toHaveLength(1)
    expect(new TextDecoder().decode(parsed.index.get('files/documents/22222222-2222-4222-8222-222222222222/spec.pdf')!)).toBe(
      'pdf-bytes'
    )
  })

  it('throws when production is missing', async () => {
    vi.mocked(getProductionById).mockResolvedValue(null)
    await expect(exportProductionAsApf('missing', '/tmp/x.apf')).rejects.toThrow(/not found/i)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('does not load or write APF data before project view access is granted', async () => {
    vi.mocked(requireProjectViewAccess).mockRejectedValue(new Error('Forbidden'))

    await expect(
      exportProductionAsApfForActor({
        db: { dialect: 'postgres' } as never,
        actor: { id: 'user-1', username: 'viewer', role: 'user' },
        productionId: TEST_PRODUCTION_ID,
        outputPath: '/tmp/denied.apf',
      }),
    ).rejects.toThrow('Forbidden')

    expect(getProductionById).not.toHaveBeenCalled()
    expect(loadApfV1ProductionTables).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('intentionally preserves identifying fields in an authorized APF export', async () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    tables.people = [
      {
        id: 'person-1',
        production_id: TEST_PRODUCTION_ID,
        name: 'Morgan Camera',
        email: 'morgan@example.test',
        phone: '+44 7700 900123',
      },
    ]
    tables.locations = [
      {
        id: 'location-1',
        production_id: TEST_PRODUCTION_ID,
        name: 'Private Residence',
        address: '12 Sensitive Street, London',
      },
    ]
    tables.vendors = [
      {
        id: 'vendor-1',
        production_id: TEST_PRODUCTION_ID,
        company_name: 'Private Supplier',
        primary_contact_full_name: 'Taylor Vendor',
        primary_contact_email: 'taylor@example.test',
      },
    ]
    vi.mocked(getProductionById).mockResolvedValue({
      id: TEST_PRODUCTION_ID,
      name: 'Fixture Production',
      slug: 'fixture-prod',
    } as never)
    vi.mocked(loadApfV1ProductionTables).mockResolvedValue(tables)
    vi.mocked(collectApfDocumentBundledEntries).mockResolvedValue({
      entries: [],
      missingDocumentFileIds: [],
    })

    await exportProductionAsApfForActor({
      db: { dialect: 'postgres' } as never,
      actor: { id: 'user-1', username: 'viewer', role: 'user' },
      productionId: TEST_PRODUCTION_ID,
      outputPath: '/tmp/authorized.apf',
    })

    expect(requireProjectViewAccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'user-1' }),
      TEST_PRODUCTION_ID,
    )
    const [, bytes] = vi.mocked(writeFile).mock.calls[0]!
    const exported = parseApfArchiveBytes(bytes as Uint8Array).normalized.data.tables
    expect(exported.people[0]).toMatchObject({
      name: 'Morgan Camera',
      email: 'morgan@example.test',
      phone: '+44 7700 900123',
    })
    expect(exported.locations[0]).toMatchObject({
      name: 'Private Residence',
      address: '12 Sensitive Street, London',
    })
    expect(exported.vendors[0]).toMatchObject({
      primary_contact_full_name: 'Taylor Vendor',
      primary_contact_email: 'taylor@example.test',
    })
  })
})
