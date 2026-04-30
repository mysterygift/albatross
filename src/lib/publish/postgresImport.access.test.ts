import { describe, expect, it, vi } from 'vitest'

const fakeProductionId = '11111111-1111-1111-1111-111111111111'

vi.mock('@/lib/publish/packageCodec', () => ({
  parsePublishPackageBytes: () => ({
    manifest: {
      production: { id: fakeProductionId, name: 'Imported Production' },
      assets: { entries: [] },
    },
    dataFile: {
      tableOrder: ['productions'],
      tables: {
        productions: [
          {
            id: fakeProductionId,
            name: 'Imported Production',
            slug: 'imported-production',
            notes: null,
            currency_code: 'GBP',
            is_episodic: false,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            deleted_at: null,
            archived_at: null,
            wrapped_at: null,
            created_from_template: null,
          },
        ],
      },
    },
    fileIndex: new Map<string, Uint8Array>(),
  }),
}))

import type { DatabaseAdapter, SqlStatement } from '@/lib/db/databaseAdapter'
import { importPublishPackageToPostgres } from '@/lib/publish/postgresImport'

class MockAdapter implements DatabaseAdapter {
  readonly dialect = 'postgres' as const
  public statements: SqlStatement[] = []

  async execute(): Promise<{ rowsAffected: number; lastInsertId: number }> {
    return { rowsAffected: 1, lastInsertId: 0 }
  }

  async select<T>(query: string): Promise<T> {
    if (query.includes('SELECT id FROM productions')) return [] as T
    if (query.includes('SELECT id, disabled_at FROM users')) {
      return [{ id: 'user-1', disabled_at: null }] as T
    }
    if (query.includes('FROM information_schema.columns')) {
      return [
        { column_name: 'id', data_type: 'uuid', udt_name: 'uuid' },
        { column_name: 'name', data_type: 'text', udt_name: 'text' },
        { column_name: 'slug', data_type: 'text', udt_name: 'text' },
        { column_name: 'notes', data_type: 'text', udt_name: 'text' },
        { column_name: 'currency_code', data_type: 'text', udt_name: 'text' },
        { column_name: 'is_episodic', data_type: 'boolean', udt_name: 'bool' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', udt_name: 'timestamptz' },
        { column_name: 'updated_at', data_type: 'timestamp with time zone', udt_name: 'timestamptz' },
        { column_name: 'deleted_at', data_type: 'timestamp with time zone', udt_name: 'timestamptz' },
        { column_name: 'archived_at', data_type: 'timestamp with time zone', udt_name: 'timestamptz' },
        { column_name: 'wrapped_at', data_type: 'timestamp with time zone', udt_name: 'timestamptz' },
        { column_name: 'created_from_template', data_type: 'text', udt_name: 'text' },
      ] as T
    }
    return [] as T
  }

  async executeBatch(statements: SqlStatement[]): Promise<void> {
    this.statements = statements
  }

  async runInSerializedTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn()
  }
}

describe('postgres publish import access assignment', () => {
  it('rejects import when importing user is missing', async () => {
    const adapter = new MockAdapter()
    await expect(
      importPublishPackageToPostgres({
        packageBytes: new Uint8Array([1, 2, 3]),
        adapter,
        assetStorage: {
          writeAsset: async () => undefined,
          deleteAsset: async () => undefined,
        },
      })
    ).rejects.toThrow('Importing user is required')
  })

  it('rejects import when importing user mismatches authenticated session user', async () => {
    const adapter = new MockAdapter()
    await expect(
      importPublishPackageToPostgres({
        packageBytes: new Uint8Array([1, 2, 3]),
        adapter,
        assetStorage: {
          writeAsset: async () => undefined,
          deleteAsset: async () => undefined,
        },
        importingUserId: 'user-1',
        authenticatedUserId: 'user-2',
      })
    ).rejects.toThrow('does not match authenticated session user')
  })

  it('assigns importing user as project administrator in same import transaction', async () => {
    const adapter = new MockAdapter()
    await importPublishPackageToPostgres({
      packageBytes: new Uint8Array([1, 2, 3]),
      adapter,
      assetStorage: {
        writeAsset: async () => undefined,
        deleteAsset: async () => undefined,
      },
      importingUserId: 'user-1',
    })

    const sqlStatements = adapter.statements.map((statement) => statement.sql)
    expect(sqlStatements[0]).toContain('BEGIN')
    expect(sqlStatements.at(-1)).toContain('COMMIT')
    expect(
      sqlStatements.some(
        (sql) => sql.includes('INSERT INTO project_memberships') && sql.includes("'administrator'")
      )
    ).toBe(true)
  })
})
