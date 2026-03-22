import { beforeEach, describe, expect, it, vi } from 'vitest'

import { collectApfDocumentBundledEntries } from '@/lib/importExport/collectApfDocumentFiles'
import { documentFixtureRow, TEST_DOCUMENT_ID } from '@/test/apf/fixtures'

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 1 },
  readFile: vi.fn(),
}))

import { readFile } from '@tauri-apps/plugin-fs'

describe('collectApfDocumentBundledEntries', () => {
  beforeEach(() => {
    vi.mocked(readFile).mockReset()
  })

  it('maps host-local file_path to canonical zip path under files/documents/ (not exporting raw paths)', async () => {
    const payload = new Uint8Array([1, 2, 3, 4])
    vi.mocked(readFile).mockResolvedValue(payload)
    const row = documentFixtureRow({ file_path: 'C:\\Users\\someone\\secret\\spec.pdf' })
    const { entries, missingDocumentFileIds } = await collectApfDocumentBundledEntries([row])
    expect(missingDocumentFileIds).toEqual([])
    expect(entries).toHaveLength(1)
    expect(entries[0]!.archivePath).toBe(`files/documents/${TEST_DOCUMENT_ID}/spec.pdf`)
    expect(entries[0]!.documentId).toBe(TEST_DOCUMENT_ID)
    expect(entries[0]!.bytes).toEqual(payload)
    expect(readFile).toHaveBeenCalledWith('C:\\Users\\someone\\secret\\spec.pdf', { baseDir: 1 })
  })

  it('lists missing ids when readFile fails', async () => {
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
    const row = documentFixtureRow()
    const { entries, missingDocumentFileIds } = await collectApfDocumentBundledEntries([row])
    expect(entries).toHaveLength(0)
    expect(missingDocumentFileIds).toContain(TEST_DOCUMENT_ID)
  })
})
