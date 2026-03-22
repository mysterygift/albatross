import { describe, expect, it } from 'vitest'

import { APF_MANIFEST_ENTRY_PATH, APF_V1_DATA_ENTRY_PATH } from '@/lib/importExport/constants'
import {
  ApfArchiveLayoutError,
  ApfNotZipPayloadError,
  ApfUnsupportedFormatVersionError,
  ApfZipCorruptError,
} from '@/lib/importExport/errors'
import { parseApfManifestJson } from '@/lib/importExport/manifest'
import { parseApfArchiveBytes } from '@/lib/importExport/readApfArchive'
import { isLikelyZipPayload } from '@/lib/importExport/sniff'
import {
  normalizeApfZipEntryPath,
  normalizeApfZipEntrySet,
  validateApfArchiveLayout,
} from '@/lib/importExport/validateLayout'
import {
  buildMinimalProductionZip,
  buildValidApfZipBytes,
  corruptZipAfterMagic,
  emptyApfTables,
  minimalProductionRow,
  zipMissingDataEntry,
  zipWithInvalidManifestJson,
} from '@/test/apf/fixtures'
import { strToU8, zipSync } from 'fflate'

describe('isLikelyZipPayload', () => {
  it('accepts standard APF bytes from buildApfZipBytes', () => {
    expect(isLikelyZipPayload(buildMinimalProductionZip())).toBe(true)
  })

  it('rejects random bytes', () => {
    expect(isLikelyZipPayload(new Uint8Array([1, 2, 3, 4]))).toBe(false)
  })

  it('rejects empty buffer', () => {
    expect(isLikelyZipPayload(new Uint8Array())).toBe(false)
  })
})

describe('normalizeApfZipEntryPath', () => {
  it('normalizes backslashes and leading segments', () => {
    expect(normalizeApfZipEntryPath('\\data\\production.json')).toBe('data/production.json')
    expect(normalizeApfZipEntryPath('./manifest.json')).toBe('manifest.json')
  })
})

describe('validateApfArchiveLayout', () => {
  it('requires manifest and data paths', () => {
    const ok = validateApfArchiveLayout(
      normalizeApfZipEntrySet([APF_MANIFEST_ENTRY_PATH, APF_V1_DATA_ENTRY_PATH])
    )
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.manifestPath).toBe(APF_MANIFEST_ENTRY_PATH)
      expect(ok.dataPath).toBe(APF_V1_DATA_ENTRY_PATH)
    }
  })

  it('fails when manifest missing', () => {
    const res = validateApfArchiveLayout(normalizeApfZipEntrySet([APF_V1_DATA_ENTRY_PATH]))
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBeInstanceOf(ApfArchiveLayoutError)
      expect(res.error.message).toContain('manifest.json')
    }
  })
})

describe('parseApfArchiveBytes', () => {
  it('parses a minimal valid archive', () => {
    const bytes = buildMinimalProductionZip()
    const { normalized } = parseApfArchiveBytes(bytes)
    expect(normalized.manifest.production.id).toBeDefined()
    expect(normalized.data.tables.productions).toHaveLength(1)
  })

  it('recognizes zip by magic, not by filename', () => {
    const bytes = buildMinimalProductionZip()
    expect(isLikelyZipPayload(bytes)).toBe(true)
    const { normalized } = parseApfArchiveBytes(bytes)
    expect(normalized.data.formatVersion).toBe(1)
  })

  it('rejects non-zip content even if caller named it .apf', () => {
    expect(() => parseApfArchiveBytes(new TextEncoder().encode('not a zip'))).toThrow(ApfNotZipPayloadError)
  })

  it('rejects corrupt zip payload after magic', () => {
    expect(() => parseApfArchiveBytes(corruptZipAfterMagic())).toThrow(ApfZipCorruptError)
  })

  it('rejects missing data/production.json', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const { manifest } = (() => {
      const z = buildValidApfZipBytes({ tables })
      const parsed = parseApfArchiveBytes(z)
      return parsed.normalized
    })()
    const bad = zipMissingDataEntry(manifest)
    expect(() => parseApfArchiveBytes(bad)).toThrow(ApfArchiveLayoutError)
  })

  it('rejects invalid manifest JSON with clear error', () => {
    expect(() => parseApfArchiveBytes(zipWithInvalidManifestJson())).toThrow()
  })

  it('rejects newer unsupported formatVersion', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const z = buildValidApfZipBytes({ tables })
    const parsed = parseApfArchiveBytes(z)
    const hackedManifest = { ...parsed.normalized.manifest, formatVersion: 999 }
    const hackedData = { ...parsed.normalized.data, formatVersion: 999 }
    const bytes = zipSync({
      [APF_MANIFEST_ENTRY_PATH]: strToU8(`${JSON.stringify(hackedManifest, null, 2)}\n`),
      [APF_V1_DATA_ENTRY_PATH]: strToU8(`${JSON.stringify(hackedData, null, 2)}\n`),
    })
    expect(() => parseApfArchiveBytes(bytes)).toThrow(ApfUnsupportedFormatVersionError)
  })

  it('accepts misnamed entry paths in zip when normalized paths match', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const { manifest, data: dataFile } = (() => {
      const z = buildValidApfZipBytes({ tables })
      return parseApfArchiveBytes(z).normalized
    })()
    const bytes = zipSync({
      './manifest.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
      'data\\production.json': strToU8(`${JSON.stringify(dataFile, null, 2)}\n`),
    })
    const { normalized } = parseApfArchiveBytes(bytes)
    expect(normalized.manifest.production.id).toBe(tables.productions[0]!.id)
  })
})

describe('parseApfManifestJson', () => {
  it('parses a valid v1 manifest object', () => {
    const tables = emptyApfTables()
    tables.productions = [minimalProductionRow()]
    const z = buildValidApfZipBytes({ tables })
    const { normalized } = parseApfArchiveBytes(z)
    const again = parseApfManifestJson(JSON.parse(JSON.stringify(normalized.manifest)))
    expect(again.production.id).toBe(normalized.manifest.production.id)
  })
})
