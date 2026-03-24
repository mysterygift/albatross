import { APF_V1_TABLE_KEYS, type ApfV1TableKey } from '@/lib/importExport/tableKeys'
import { ApfInvalidDataError } from '@/lib/importExport/errors'

/** One logical row as stored in SQLite / JSON (column names = keys). */
export type ApfTableRow = Record<string, unknown>

/**
 * v1 project payload inside `data/production.json`.
 * Table-oriented shape: deterministic key set aligned with Phase 1 audit INCLUDE list.
 */
export type ApfV1Tables = Record<ApfV1TableKey, ApfTableRow[]>

export type ApfV1DataFile = {
  formatVersion: number
  tables: ApfV1Tables
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * v1 `.apf` files lack `episodes`, `shooting_blocs`, and `is_episodic` on productions.
 * Inject empty episodic tables and default flag so `parseApfV1DataFileJson` matches current key set.
 */
export function coerceLegacyApfDataRawForV2TableKeys(dataRaw: unknown): unknown {
  if (!isPlainObject(dataRaw)) return dataRaw
  const formatVersion = dataRaw.formatVersion
  const tablesRaw = dataRaw.tables
  if (typeof formatVersion !== 'number' || formatVersion > 1 || !isPlainObject(tablesRaw)) {
    return dataRaw
  }
  const tables = { ...tablesRaw } as Record<string, unknown>
  if (!('episodes' in tables)) tables.episodes = []
  if (!('shooting_blocs' in tables)) tables.shooting_blocs = []
  const prows = tables.productions
  if (Array.isArray(prows) && prows.length > 0 && isPlainObject(prows[0]) && !('is_episodic' in prows[0])) {
    const p0 = { ...prows[0], is_episodic: 0 }
    tables.productions = [p0, ...prows.slice(1)]
  }
  return { ...dataRaw, tables }
}

/**
 * Validates envelope + `tables` contains exactly the v1 key set, each an array.
 * Does not validate per-table columns (DB import phase will use repositories / SQL).
 */
export function parseApfV1DataFileJson(raw: unknown): ApfV1DataFile {
  if (!isPlainObject(raw)) {
    throw new ApfInvalidDataError('data/production.json must be a JSON object')
  }
  const formatVersion = raw.formatVersion
  if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion) || formatVersion < 1) {
    throw new ApfInvalidDataError('data/production.json requires positive integer formatVersion')
  }
  const tablesRaw = raw.tables
  if (!isPlainObject(tablesRaw)) {
    throw new ApfInvalidDataError('data/production.json requires object "tables"')
  }

  const tables = {} as ApfV1Tables
  for (const key of APF_V1_TABLE_KEYS) {
    const col = tablesRaw[key]
    if (col === undefined) {
      throw new ApfInvalidDataError(`data/production.json tables missing required key "${key}"`)
    }
    if (!Array.isArray(col)) {
      throw new ApfInvalidDataError(`data/production.json tables."${key}" must be an array`)
    }
    for (let i = 0; i < col.length; i++) {
      if (!isPlainObject(col[i])) {
        throw new ApfInvalidDataError(`data/production.json tables."${key}"[${i}] must be an object`)
      }
    }
    tables[key] = col as ApfTableRow[]
  }

  const extraKeys = Object.keys(tablesRaw).filter((k) => !(APF_V1_TABLE_KEYS as readonly string[]).includes(k))
  if (extraKeys.length > 0) {
    throw new ApfInvalidDataError(
      `data/production.json tables has unknown keys (not in v1 contract): ${extraKeys.sort().join(', ')}`
    )
  }

  return { formatVersion, tables }
}

/** Ensures manifest and data file agree on formatVersion (after migrations, both should be CURRENT). */
export function assertApfManifestDataFormatVersionAligned(
  manifestVersion: number,
  dataVersion: number
): void {
  if (manifestVersion !== dataVersion) {
    throw new ApfInvalidDataError(
      `manifest formatVersion (${manifestVersion}) does not match data/production.json formatVersion (${dataVersion})`
    )
  }
}
