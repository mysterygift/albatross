import { describe, expect, it, vi } from 'vitest'
import type { QueryResult } from '@tauri-apps/plugin-sql'

import type { DatabaseAdapter, SqlStatement } from '@/lib/db/databaseAdapter'

import {
  applyPulledBatchTransaction,
  buildMutationJournalStatements,
  ensureSyncClientIdentity,
  executeSyncMutationTransaction,
  upsertSyncProjectState,
  type SyncProjectState,
} from './localStore'
import { SYNC_V2_PROTOCOL_VERSION } from './types'

const wireBasis = {
  baseCursor: { epoch: 'epoch-1', sequence: 4 },
  protocolVersion: SYNC_V2_PROTOCOL_VERSION,
  schemaVersion: 87,
  registryHash: 'sha256:test',
} as const

function createDb(state: SyncProjectState | null = null): DatabaseAdapter & {
  batches: SqlStatement[][]
} {
  const batches: SqlStatement[][] = []
  return {
    dialect: 'sqlite',
    batches,
    execute: vi.fn(async (): Promise<QueryResult> => ({ rowsAffected: 1, lastInsertId: 1 })),
    select: vi.fn(async () => (state ? [state] : [])) as DatabaseAdapter['select'],
    executeBatch: vi.fn(async (statements: SqlStatement[]) => {
      batches.push(statements)
    }),
    runInSerializedTransaction: async <T>(fn: () => Promise<T>) => fn(),
  }
}

const linkedState: SyncProjectState = {
  production_id: 'production-1',
  connection_id: 'connection-1',
  server_project_id: 'server-project-9',
  mode: 'collaborative',
  epoch: 'epoch-1',
  applied_cursor: 4,
  head_cursor: 4,
  protocol_version: '2.0',
  schema_version: 87,
  registry_hash: 'sha256:test',
  credential_ref: 'credential-1',
  rebootstrap_reason: null,
  last_sync_started_at: null,
  last_synced_at: null,
  created_at: '2026-08-17T00:00:00.000Z',
  updated_at: '2026-08-17T00:00:00.000Z',
}

describe('sync v2 local store', () => {
  it('persists a stable client identity before mutation batches reference it', async () => {
    const db = createDb()
    await ensureSyncClientIdentity(db, {
      clientId: 'client-install-1',
      deviceLabel: 'Editing Mac',
      updatedAt: '2026-08-17T00:00:00.000Z',
    })

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sync_client_identity'),
      ['client-install-1', 'Editing Mac', '2026-08-17T00:00:00.000Z'],
    )
  })

  it('builds one ordered logical journal batch for registered tables', () => {
    const result = buildMutationJournalStatements({
      productionId: 'production-1',
      clientId: 'client-1',
      operationName: 'create scene and shot',
      ...wireBasis,
      batchId: 'batch-0001',
      createdAt: '2026-08-17T00:00:00.000Z',
      operations: [
        {
          table: 'scenes',
          rowId: 'scene-1',
          operation: 'create',
          baseVersion: null,
          fullRow: { id: 'scene-1' },
          localResult: { optimistic: true },
        },
        { table: 'shots', rowId: 'shot-1', operation: 'create', baseVersion: null, fullRow: { id: 'shot-1' } },
      ],
    })

    expect(result.batchId).toBe('batch-0001')
    expect(result.statements).toHaveLength(3)
    expect(result.statements[0]?.bindValues.slice(4, 10)).toEqual([
      'epoch-1',
      4,
      '2.0',
      87,
      'sha256:test',
      '2026-08-17T00:00:00.000Z',
    ])
    expect(result.statements[1]?.bindValues.slice(0, 5)).toEqual([
      'batch-0001',
      0,
      'scenes',
      'scene-1',
      'create',
    ])
    expect(result.statements[2]?.bindValues[1]).toBe(1)
    expect(result.statements[1]?.bindValues[9]).toBe('{"optimistic":true}')
  })

  it('refuses to journal an unregistered table', () => {
    expect(() =>
      buildMutationJournalStatements({
        productionId: 'production-1',
      clientId: 'client-1',
      operationName: 'unsafe write',
      ...wireBasis,
      operations: [{
        table: 'people',
        rowId: 'person-1',
        operation: 'patch',
        baseVersion: 1,
        baseValues: { name: 'Grace' },
        patch: { name: 'Ada' },
      }],
      }),
    ).toThrow('Table is not in the active collaboration registry: people')
  })

  it('refuses pilot mutations that reference deferred dependency rings', () => {
    expect(() =>
      buildMutationJournalStatements({
        productionId: 'production-1',
        clientId: 'client-1',
        operationName: 'assign location',
        ...wireBasis,
        operations: [{
          table: 'scenes',
          rowId: 'scene-1',
          operation: 'patch',
          baseVersion: 1,
          baseValues: { location_id: null },
          patch: { location_id: 'location-1' },
        }],
      }),
    ).toThrow('Pilot sync defers foreign key scenes.location_id')
  })

  it('commits domain writes and mutation journal in one transaction batch', async () => {
    const db = createDb()
    const batchId = await executeSyncMutationTransaction(db, {
      productionId: 'production-1',
      clientId: 'client-1',
      operationName: 'rename scene',
      ...wireBasis,
      batchId: 'batch-0001',
      createdAt: '2026-08-17T00:00:00.000Z',
      domainStatements: [{ sql: 'UPDATE scenes SET name = $1 WHERE id = $2', bindValues: ['New', 'scene-1'] }],
      operations: [{
        table: 'scenes',
        rowId: 'scene-1',
        operation: 'patch',
        baseVersion: 1,
        baseValues: { name: 'Old' },
        patch: { name: 'New' },
      }],
    })

    expect(batchId).toBe('batch-0001')
    expect(db.batches).toHaveLength(1)
    expect(db.batches[0]?.map(({ sql }) => sql.trim().split(/\s+/)[0])).toEqual([
      'BEGIN',
      'UPDATE',
      'INSERT',
      'INSERT',
      'COMMIT',
    ])
  })

  it('applies domain rows, row versions, and cursor in one transaction batch', async () => {
    const db = createDb(linkedState)
    await applyPulledBatchTransaction(db, {
      productionId: 'production-1',
      epoch: 'epoch-1',
      appliedCursor: 5,
      headCursor: 7,
      appliedAt: '2026-08-17T01:00:00.000Z',
      domainStatements: [{ sql: 'UPDATE scenes SET name = $1 WHERE id = $2', bindValues: ['Remote', 'scene-1'] }],
      rows: [{ table: 'scenes', entityId: 'scene-1', serverVersion: 2, cursor: 5, tombstone: false }],
    })

    expect(db.batches[0]?.map(({ sql }) => sql.trim().split(/\s+/)[0])).toEqual([
      'BEGIN',
      'INSERT',
      'UPDATE',
      'INSERT',
      'UPDATE',
      'COMMIT',
    ])
    expect(db.batches[0]?.[4]?.bindValues).toEqual([
      5,
      7,
      '2026-08-17T01:00:00.000Z',
      'production-1',
      'epoch-1',
    ])
    expect(db.batches[0]?.[1]?.sql).toContain('sync_apply_guard')
    expect(db.batches[0]?.[1]?.sql).toContain('ELSE -1')
    expect(db.batches[0]?.[4]?.sql).toContain('applied_cursor = MAX(applied_cursor, $1)')
  })

  it('rejects a pulled batch from another server epoch before writing', async () => {
    const db = createDb(linkedState)
    await expect(
      applyPulledBatchTransaction(db, {
        productionId: 'production-1',
        epoch: 'epoch-restored',
        appliedCursor: 5,
        headCursor: 5,
        domainStatements: [],
        rows: [],
      }),
    ).rejects.toThrow('Sync epoch changed; re-bootstrap is required')
    expect(db.batches).toEqual([])
  })

  it('rejects row metadata from outside the applied batch cursor', async () => {
    const db = createDb(linkedState)
    await expect(
      applyPulledBatchTransaction(db, {
        productionId: 'production-1',
        epoch: 'epoch-1',
        appliedCursor: 6,
        headCursor: 6,
        domainStatements: [],
        rows: [
          { table: 'scenes', entityId: 'scene-1', serverVersion: 3, cursor: 6, tombstone: false },
          { table: 'shots', entityId: 'shot-1', serverVersion: 2, cursor: 5, tombstone: false },
        ],
      }),
    ).rejects.toThrow('Every pulled row must use the applied batch cursor')
    expect(db.batches).toEqual([])
  })

  it.each([
    ['short mutation id', { batchId: 'short' }],
    ['invalid epoch', { baseCursor: { epoch: 'bad:epoch', sequence: 4 } }],
    ['unsafe cursor', { baseCursor: { epoch: 'epoch-1', sequence: Number.MAX_SAFE_INTEGER + 1 } }],
  ])('validates the immutable wire request before writing: %s', (_label, overrides) => {
    expect(() => buildMutationJournalStatements({
      productionId: 'production-1',
      clientId: 'client-1',
      operationName: 'create scene',
      ...wireBasis,
      batchId: 'batch-0001',
      operations: [{
        table: 'scenes',
        rowId: 'scene-1',
        operation: 'create',
        baseVersion: null,
        fullRow: { id: 'scene-1' },
      }],
      ...overrides,
    })).toThrow()
  })

  it('rejects non-finite JSON before writing', () => {
    expect(() => buildMutationJournalStatements({
      productionId: 'production-1',
      clientId: 'client-1',
      operationName: 'create scene',
      ...wireBasis,
      batchId: 'batch-0001',
      operations: [{
        table: 'scenes',
        rowId: 'scene-1',
        operation: 'create',
        baseVersion: null,
        fullRow: { id: 'scene-1', sort_order: Number.NaN },
      }],
    })).toThrow()
  })

  it('stores local and server project ids independently', async () => {
    const db = createDb()
    await upsertSyncProjectState(db, {
      productionId: 'production-1',
      connectionId: 'connection-1',
      serverProjectId: 'server-project-9',
      mode: 'collaborative',
      epoch: 'epoch-1',
      appliedCursor: 3,
      headCursor: 3,
      protocolVersion: '2.0',
      schemaVersion: 87,
      registryHash: 'sha256:test',
      credentialRef: 'credential-1',
      updatedAt: '2026-08-17T00:00:00.000Z',
    })

    expect(db.execute).toHaveBeenCalledOnce()
    expect(vi.mocked(db.execute).mock.calls[0]?.[1]?.slice(0, 3)).toEqual([
      'production-1',
      'connection-1',
      'server-project-9',
    ])
  })
})
