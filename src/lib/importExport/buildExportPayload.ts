import { CURRENT_APF_FORMAT_VERSION } from '@/lib/importExport/constants'
import type { ApfTableRow, ApfV1DataFile, ApfV1Tables } from '@/lib/importExport/payload'
import { APF_V1_TABLE_KEYS } from '@/lib/importExport/tableKeys'

function sortRowsById(rows: ApfTableRow[]): ApfTableRow[] {
  return [...rows].sort((a, b) => {
    const ia = a.id != null ? String(a.id) : ''
    const ib = b.id != null ? String(b.id) : ''
    return ia.localeCompare(ib)
  })
}

function sortObjectKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sortObjectKeysDeep)
  const o = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(o).sort()) {
    out[k] = sortObjectKeysDeep(o[k])
  }
  return out
}

/**
 * Deterministic v1 data file: tables in canonical key order, rows sorted by `id`, object keys sorted.
 */
export function buildApfV1ExportDataFile(tables: ApfV1Tables): ApfV1DataFile {
  const next: ApfV1Tables = {} as ApfV1Tables
  for (const key of APF_V1_TABLE_KEYS) {
    next[key] = sortRowsById(tables[key]).map((row) => sortObjectKeysDeep(row) as ApfTableRow)
  }
  return {
    formatVersion: CURRENT_APF_FORMAT_VERSION,
    tables: next,
  }
}

export function countTableRows(tables: ApfV1Tables): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const key of APF_V1_TABLE_KEYS) {
    counts[key] = tables[key].length
  }
  return counts
}
