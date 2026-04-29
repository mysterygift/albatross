import { describe, expect, it } from 'vitest'

import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { planApfImportStatements, resetApfImportPragmaCache } from '@/lib/importExport/planImportStatements'
import type { ApfV1DataFile } from '@/lib/importExport/payload'
import { APF_V1_TABLE_KEYS } from '@/lib/importExport/tableKeys'

const EMPTY_TABLES = Object.fromEntries(APF_V1_TABLE_KEYS.map((key) => [key, []])) as unknown as ApfV1DataFile['tables']

const TEST_DATA: ApfV1DataFile = {
  formatVersion: 1,
  tables: {
    ...EMPTY_TABLES,
    productions: [{ id: 'p1', name: 'Prod' }],
  },
}

describe('planApfImportStatements postgres compatibility', () => {
  it('uses information_schema columns when dialect is postgres', async () => {
    resetApfImportPragmaCache()
    const select: DatabaseAdapter['select'] = async <T>(sql: string, bind?: unknown[]) => {
      if (sql.includes('FROM information_schema.columns')) {
        if (bind?.[0] === 'productions') {
          return [
            { ordinal_position: 1, column_name: 'id', data_type: 'uuid' },
            { ordinal_position: 2, column_name: 'name', data_type: 'text' },
          ] as T
        }
        return [] as T
      }
      throw new Error(`unexpected sql ${sql}`)
    }
    const db: Pick<DatabaseAdapter, 'select' | 'dialect'> = {
      dialect: 'postgres' as const,
      select,
    }
    const statements = await planApfImportStatements(db, TEST_DATA)
    expect(statements[0]?.sql).toContain('INSERT INTO productions (id, name)')
    expect(statements[0]?.bindValues).toEqual(['p1', 'Prod'])
  })

  it('uses PRAGMA table_info when dialect is sqlite', async () => {
    resetApfImportPragmaCache()
    const calls: string[] = []
    const select: DatabaseAdapter['select'] = async <T>(sql: string) => {
      calls.push(sql)
      if (sql.includes('PRAGMA table_info(productions)')) {
        return [
          { cid: 0, name: 'id', type: 'TEXT', notnull: 1, dflt_value: null, pk: 1 },
          { cid: 1, name: 'name', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
        ] as T
      }
      if (sql.includes('PRAGMA table_info(')) {
        return [] as T
      }
      throw new Error(`unexpected sql ${sql}`)
    }
    const db: Pick<DatabaseAdapter, 'select' | 'dialect'> = {
      dialect: 'sqlite' as const,
      select,
    }
    const statements = await planApfImportStatements(db, TEST_DATA)
    expect(statements[0]?.sql).toContain('INSERT INTO productions (id, name)')
    expect(statements[0]?.bindValues).toEqual(['p1', 'Prod'])
    expect(calls.some((sql) => sql.includes('PRAGMA table_info(productions)'))).toBe(true)
    expect(calls.some((sql) => sql.includes('information_schema.columns'))).toBe(false)
  })
})
