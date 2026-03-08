/**
 * Equipment list CSV import/export.
 * Operates on the list layer: export from list + registry; import into a list with registry matching by item_uuid.
 * New equipment is never created here — that is done in the UI after user confirmation.
 */

import type { Equipment, EquipmentListItem } from '@/lib/db/types'
import { EQUIPMENT_CATEGORY_LEGACY_MAP, EQUIPMENT_CATEGORY_VALUES, EQUIPMENT_STATUS_VALUES } from '@/lib/db/types'
import type { EquipmentCategory, EquipmentStatus } from '@/lib/db/types'

/** Stable CSV column headers for equipment list export. Order is fixed for round-trip. */
export const EQUIPMENT_LIST_CSV_HEADERS = [
  'item_uuid',
  'name',
  'category',
  'department',
  'source_type',
  'vendor',
  'rental_start_date',
  'return_due_date',
  'serial_number',
  'notes',
  'status',
  'replacement_value',
] as const

const REQUIRED_IMPORT_HEADERS = [
  'item_uuid',
  'name',
  'category',
  'department',
  'source_type',
  'vendor',
  'rental_start_date',
  'return_due_date',
  'serial_number',
  'notes',
] as const

/** One parsed row from CSV. All values trimmed; empty string becomes null. */
export type EquipmentListCsvRow = {
  item_uuid: string | null
  name: string | null
  category: string | null
  department: string | null
  source_type: string | null
  vendor: string | null
  rental_start_date: string | null
  return_due_date: string | null
  serial_number: string | null
  notes: string | null
  status: string | null
  replacement_value: string | null
}

export type MatchResult = {
  /** Rows that matched an existing equipment record by item_uuid (production-scoped). */
  matched: Array<{ row: EquipmentListCsvRow; equipment: Equipment }>
  /** Rows with no item_uuid or unknown item_uuid — candidate new equipment. */
  new: EquipmentListCsvRow[]
}

/** Quote a CSV field if it contains comma, quote, or newline; double internal quotes. */
function escapeCsvField(value: string): string {
  const needsQuotes = /[,"\n\r]/.test(value)
  const escaped = value.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}

/**
 * Export an equipment list to CSV. Uses registry data for each list item.
 * Notes: list-item notes if present, otherwise equipment notes (operational preference).
 * Dates in ISO date format (YYYY-MM-DD).
 */
export function exportEquipmentListToCsv(
  listItems: EquipmentListItem[],
  equipmentById: Map<string, Equipment>
): string {
  const headerLine = EQUIPMENT_LIST_CSV_HEADERS.join(',')
  const lines: string[] = [headerLine]

  for (const item of listItems) {
    const eq = equipmentById.get(item.equipment_id)
    if (!eq) continue
    const notes = (item.notes?.trim() ?? eq.notes?.trim() ?? '') || ''
    const row = [
      eq.item_uuid,
      eq.name,
      eq.category,
      eq.department ?? '',
      eq.source_type,
      eq.vendor ?? '',
      eq.rental_start_date ?? '',
      eq.return_due_date ?? '',
      eq.serial_number ?? '',
      notes,
      eq.status,
      eq.replacement_value != null ? String(eq.replacement_value) : '',
    ]
    lines.push(row.map((v) => escapeCsvField(v)).join(','))
  }

  return lines.join('\n')
}

/**
 * Parse a single CSV line respecting quoted fields (RFC 4180 style).
 * Returns array of field values.
 */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      let field = ''
      i += 1
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            field += '"'
            i += 2
          } else {
            i += 1
            break
          }
        } else {
          field += line[i]
          i += 1
        }
      }
      out.push(field)
    } else {
      let field = ''
      while (i < line.length && line[i] !== ',') {
        field += line[i]
        i += 1
      }
      out.push(field)
      if (line[i] === ',') i += 1
    }
  }
  return out
}

function trimToNull(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t
}

/**
 * Parse CSV text into rows. Validates header; missing optional columns are filled with null.
 * Returns rows in file order and any parse/validation errors.
 */
export function parseEquipmentListCsv(csvText: string): {
  rows: EquipmentListCsvRow[]
  errors: string[]
} {
  const errors: string[] = []
  const lines = csvText.split(/\r?\n/).map((l) => l.trimEnd())
  if (lines.length === 0) {
    return { rows: [], errors: ['CSV is empty.'] }
  }

  const headerLine = lines[0]!
  const headerNames = parseCsvLine(headerLine).map((h) => h.trim().toLowerCase())
  const headerMap = new Map<string, number>()
  headerNames.forEach((name, index) => {
    if (name && !headerMap.has(name)) headerMap.set(name, index)
  })

  for (const required of REQUIRED_IMPORT_HEADERS) {
    if (!headerMap.has(required)) {
      errors.push(`Missing required column: ${required}`)
    }
  }
  if (errors.length > 0) return { rows: [], errors }

  const rows: EquipmentListCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!
    if (line.trim() === '') continue
    const values = parseCsvLine(line)
    const get = (key: string): string | null => {
      const idx = headerMap.get(key.toLowerCase())
      return idx !== undefined && values[idx] !== undefined ? trimToNull(values[idx]) : null
    }
    rows.push({
      item_uuid: get('item_uuid'),
      name: get('name'),
      category: get('category'),
      department: get('department'),
      source_type: get('source_type'),
      vendor: get('vendor'),
      rental_start_date: get('rental_start_date'),
      return_due_date: get('return_due_date'),
      serial_number: get('serial_number'),
      notes: get('notes'),
      status: get('status'),
      replacement_value: get('replacement_value'),
    })
  }

  return { rows, errors }
}

/**
 * Match parsed CSV rows to the production's equipment registry by item_uuid only.
 * - item_uuid present and matches a registry item in production → matched
 * - item_uuid empty or not found in production → new (candidate for user to create)
 * Does not match by name. Production-scoped.
 */
export function matchParsedRowsToRegistry(
  parsedRows: EquipmentListCsvRow[],
  productionEquipment: Equipment[]
): MatchResult {
  const byUuid = new Map<string, Equipment>()
  for (const e of productionEquipment) {
    const u = e.item_uuid?.trim()
    if (u) byUuid.set(u, e)
  }

  const matched: MatchResult['matched'] = []
  const newRows: EquipmentListCsvRow[] = []

  for (const row of parsedRows) {
    const u = row.item_uuid?.trim()
    if (u && byUuid.has(u)) {
      matched.push({ row, equipment: byUuid.get(u)! })
    } else {
      newRows.push(row)
    }
  }

  return { matched, new: newRows }
}

/** Normalize category from CSV string to canonical EquipmentCategory. Uses legacy map for old values, then exact/fuzzy match on canonical list. */
export function normalizeCategory(value: string | null): EquipmentCategory {
  if (!value?.trim()) return 'other'
  const v = value.trim().toLowerCase().replace(/\s+/g, '_')
  const legacy = EQUIPMENT_CATEGORY_LEGACY_MAP[v]
  if (legacy) return legacy
  const found = EQUIPMENT_CATEGORY_VALUES.find((c) => c === v || c.replace(/_/g, '') === v.replace(/_/g, ''))
  return found ?? 'other'
}

/** Normalize source_type from CSV string. */
export function normalizeSourceType(value: string | null): Equipment['source_type'] {
  if (!value?.trim()) return 'owned'
  const v = value.trim().toLowerCase()
  if (v === 'rented' || v === 'purchased' || v === 'owned') return v
  return 'owned'
}

/** Normalize status from CSV string. */
export function normalizeStatus(value: string | null): EquipmentStatus {
  if (!value?.trim()) return 'planned'
  const v = value.trim().toLowerCase()
  return EQUIPMENT_STATUS_VALUES.includes(v as EquipmentStatus) ? (v as EquipmentStatus) : 'planned'
}

/**
 * Map legacy/task-style department labels to default crew hierarchy department names.
 * Used for CSV import so imported rows default to crew-aligned departments.
 */
const LEGACY_DEPARTMENT_TO_CREW: Record<string, string> = {
  electrical: 'Lighting',
  'art department': 'Art',
  'post production': 'Post-Production',
  accounts: 'Finance',
  'dit / video': 'Camera',
  'dit / video village': 'Camera',
  development: 'Development',
  production: 'Production',
  finance: 'Finance',
  locations: 'Locations',
  art: 'Art',
  camera: 'Camera',
  lighting: 'Lighting',
  grip: 'Grip',
  sound: 'Sound',
  'post-production': 'Post-Production',
}

/** Normalize department from CSV string to crew hierarchy name, or null if empty. */
export function normalizeDepartment(value: string | null): string | null {
  const v = value?.trim()
  if (!v) return null
  const key = v.toLowerCase()
  return LEGACY_DEPARTMENT_TO_CREW[key] ?? v
}

/** Build CreateEquipmentData from a parsed CSV row for new equipment. New item_uuid is generated by repo/service. */
export function csvRowToCreateEquipmentData(
  row: EquipmentListCsvRow,
  productionId: string
): {
  production_id: string
  name: string
  category: EquipmentCategory
  status: EquipmentStatus
  source_type: Equipment['source_type']
  department: string | null
  vendor: string | null
  rental_start_date: string | null
  return_due_date: string | null
  serial_number: string | null
  notes: string | null
  replacement_value: number | null
} {
  const name = row.name?.trim() || 'Unnamed item'
  return {
    production_id: productionId,
    name,
    category: normalizeCategory(row.category),
    status: normalizeStatus(row.status),
    source_type: normalizeSourceType(row.source_type),
    department: normalizeDepartment(row.department),
    vendor: row.vendor?.trim() || null,
    rental_start_date: row.rental_start_date?.trim() || null,
    return_due_date: row.return_due_date?.trim() || null,
    serial_number: row.serial_number?.trim() || null,
    notes: row.notes?.trim() || null,
    replacement_value: (() => {
      const v = row.replacement_value?.trim()
      if (!v) return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    })(),
  }
}
