import type { ApfTableRow } from '@/lib/importExport/payload'

type PragmaColumn = {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: unknown
  pk: number
}

function pragmaColumnsFromSampleRow(row: ApfTableRow): PragmaColumn[] {
  const keys = Object.keys(row).sort()
  return keys.map((name, cid) => ({
    cid,
    name,
    type: 'TEXT',
    notnull: 0,
    dflt_value: null,
    pk: name === 'id' ? 1 : 0,
  }))
}

export type MockApfImportDbOptions = {
  /** Production ids that already exist (preflight id conflict). */
  existingProductionIds?: string[]
  /** Active slug already taken by another production. */
  existingSlug?: { slug: string; id: string }
  /**
   * For each table that appears in the import payload, provide a sample row whose keys define
   * `PRAGMA table_info` for the mock (empty tables need no entry).
   */
  tableSamples?: Record<string, ApfTableRow>
}

/**
 * Minimal `Database.select`-shaped mock for `preflightApfImportDb` + `planApfImportStatements`.
 */
export function createMockApfImportDb(opts: MockApfImportDbOptions = {}) {
  return {
    async select<T>(sql: string, bind?: unknown[]): Promise<T> {
      const s = sql.trim()

      if (s.startsWith('PRAGMA table_info(')) {
        const m = /^PRAGMA table_info\((\w+)\)/.exec(s)
        const table = m?.[1] ?? ''
        const sample = opts.tableSamples?.[table]
        if (!sample) {
          return [] as T
        }
        return pragmaColumnsFromSampleRow(sample) as T
      }

      if (s.includes('FROM productions WHERE id =') && s.includes('LIMIT 1')) {
        const id = bind?.[0]
        if (typeof id === 'string' && opts.existingProductionIds?.includes(id)) {
          return [{ id }] as T
        }
        return [] as T
      }

      if (s.includes('FROM productions WHERE slug =') && s.includes('deleted_at IS NULL')) {
        const slug = bind?.[0]
        if (opts.existingSlug && slug === opts.existingSlug.slug) {
          return [{ id: opts.existingSlug.id }] as T
        }
        return [] as T
      }

      return [] as T
    },
  }
}
