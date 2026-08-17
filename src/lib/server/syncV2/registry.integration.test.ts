import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'

import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'
import { sqlJsQueryExec } from '@/test/apf/sqlJsQueryExec'

import {
  COLLABORATION_REGISTRY_DESCRIPTOR,
  getCollaborationTable,
  getDeferredForeignKeyColumns,
} from './registry'

describe('sync-v2 pilot registry against the real SQLite schema', () => {
  it('registers or explicitly defers every outbound foreign-key dependency', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    applyAlbatrossMigrationsSqlJs(db)

    for (const descriptor of COLLABORATION_REGISTRY_DESCRIPTOR.tables) {
      const result = sqlJsQueryExec(db, `PRAGMA foreign_key_list(${descriptor.table})`)[0]
      if (!result) continue
      const tableIndex = result.columns.indexOf('table')
      const fromIndex = result.columns.indexOf('from')
      for (const row of result.values) {
        const referencedTable = String(row[tableIndex])
        const fromColumn = String(row[fromIndex])
        const dependencyIsRegistered = getCollaborationTable(referencedTable) != null
        const dependencyIsDeferred = getDeferredForeignKeyColumns(descriptor.table).includes(fromColumn)
        expect(
          dependencyIsRegistered || dependencyIsDeferred,
          `${descriptor.table}.${fromColumn} references unregistered ${referencedTable}`,
        ).toBe(true)
      }
    }
    db.close()
  })
})
