/**
 * Fails when a table that belongs to a single production exists in the schema but is neither in the `.apf`
 * table list nor on the reviewed exclusion list below. Add new tables to `tableKeys.ts` (and the exporter)
 * or, if they must not travel with a package, list them here with the reason.
 */
import { join } from 'node:path'
import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'

import { APF_V1_TABLE_KEYS } from '@/lib/importExport/tableKeys'
import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'

/** Production-scoped tables deliberately left out of `.apf` packages. */
const EXCLUDED_PRODUCTION_TABLES: Record<string, string> = {
  project_memberships: 'Local user access grants; users differ per installation',
  linked_projects: 'Links a production to a server on this machine',
  publish_jobs: 'Server publish history for this machine',
  server_outbox_pending: 'Server sync queue for this machine',
  sync_project_state: 'Sync-v2 cursor state for this machine',
  sync_apply_guard: 'Sync-v2 internal guard row',
  sync_mutation_batches: 'Sync-v2 journal for this machine',
  sync_row_state: 'Sync-v2 per-row versions for this machine',
  sync_conflicts: 'Sync-v2 conflicts for this machine',
}

describe('apf export coverage', () => {
  it('covers every table with a production_id column', async () => {
    const SQL = await initSqlJs({
      locateFile: (file: string) => join(process.cwd(), 'node_modules/sql.js/dist', file),
    })
    const db = new SQL.Database()
    applyAlbatrossMigrationsSqlJs(db)
    // The local sql.js typings are loose; narrow to the one call shape used here.
    const q = (sql: string) => (db as unknown as { exec(s: string): { values: unknown[][] }[] }).exec(sql)[0]!.values
    const tables = q(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).map((r) => String(r[0]))
    const scoped = tables.filter((name) => {
      const cols = q(`PRAGMA table_info(${name})`).map((r) => String(r[1]))
      return cols.includes('production_id')
    })
    db.close()

    const covered = new Set<string>([...APF_V1_TABLE_KEYS, ...Object.keys(EXCLUDED_PRODUCTION_TABLES)])
    const missing = scoped.filter((name) => !covered.has(name))
    expect(missing).toEqual([])
  })
})
