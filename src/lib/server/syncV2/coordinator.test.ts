import type { QueryResult } from '@tauri-apps/plugin-sql'
import { describe, expect, it, vi } from 'vitest'

import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'

import { SyncV2RequestError, type SyncV2Client } from './client'
import { SyncV2ProjectCoordinator } from './coordinator'
import type { SyncProjectState } from './localStore'
import { SYNC_V2_PROTOCOL_VERSION, type ChangeBatch, type PullChangesResponse } from './types'

const timestamp = '2026-09-08T10:00:00.000Z'

function state(): SyncProjectState {
  return {
    production_id: 'production-1',
    connection_id: 'connection-1',
    server_project_id: 'server-project-1',
    mode: 'collaborative',
    epoch: 'epoch-1',
    applied_cursor: 0,
    head_cursor: 0,
    protocol_version: SYNC_V2_PROTOCOL_VERSION,
    schema_version: 87,
    registry_hash: 'sha256:test',
    credential_ref: 'credential-1',
    rebootstrap_reason: null,
    last_sync_started_at: null,
    last_synced_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  }
}

function batch(sequence: number): ChangeBatch {
  return {
    cursor: { epoch: 'epoch-1', sequence },
    transactionId: `transaction-${sequence}`,
    actorUserId: null,
    clientId: 'client-0001',
    mutationId: 'mutation-0001',
    committedAt: timestamp,
    changes: [{
      ordinal: 0,
      table: 'scenes',
      rowId: 'scene-0001',
      operation: 'upsert',
      rowVersion: 1,
      row: { id: 'scene-0001', production_id: 'production-1' },
    }],
  }
}

function pull(after: number, head: number, batches: ChangeBatch[] = []): PullChangesResponse {
  return {
    projectId: 'server-project-1',
    after: { epoch: 'epoch-1', sequence: after },
    head: { epoch: 'epoch-1', sequence: head },
    batches,
    hasMore: false,
  }
}

function fakeDb(projectState: SyncProjectState, withPending = true): DatabaseAdapter & {
  executed: Array<{ sql: string; bindValues: unknown[] }>
} {
  let pending = withPending
  const executed: Array<{ sql: string; bindValues: unknown[] }> = []
  return {
    dialect: 'sqlite',
    executed,
    execute: vi.fn(async (sql: string, bindValues: unknown[] = []): Promise<QueryResult> => {
      executed.push({ sql, bindValues })
      if (sql.includes("SET state = 'accepted'")) pending = false
      if (sql.includes("mode = $1")) projectState.mode = bindValues[0] as SyncProjectState['mode']
      return { rowsAffected: 1, lastInsertId: 0 }
    }),
    select: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM sync_project_state')) return [projectState]
      if (sql.includes('SELECT id, attempt_count')) {
        return pending ? [{ id: 'mutation-0001', attempt_count: 0 }] : []
      }
      if (sql.includes('SELECT id, client_id')) {
        return [{
          id: 'mutation-0001', client_id: 'client-0001', base_epoch: 'epoch-1', base_cursor: 0,
          protocol_version: SYNC_V2_PROTOCOL_VERSION, schema_version: 87, registry_hash: 'sha256:test',
        }]
      }
      if (sql.includes('SELECT entity_table')) {
        return [{
          entity_table: 'scenes', entity_id: 'scene-0001', operation: 'create',
          base_server_version: null, base_values_json: null, patch_json: null,
          full_row_json: '{"id":"scene-0001","production_id":"production-1"}',
        }]
      }
      return []
    }) as DatabaseAdapter['select'],
    executeBatch: vi.fn(async () => undefined),
    runInSerializedTransaction: async <T>(fn: () => Promise<T>) => fn(),
  }
}

function fakeClient(overrides: Partial<SyncV2Client> = {}): SyncV2Client {
  return {
    pull: vi.fn(async (_projectId: string, after: { sequence: number }) => pull(after.sequence, after.sequence)),
    push: vi.fn(async () => ({
      mutationId: 'mutation-0001', replayed: false,
      committedCursor: { epoch: 'epoch-1', sequence: 1 }, batch: batch(1),
    })),
    acknowledge: vi.fn(async (_projectId: string, request: { appliedCursor: { sequence: number } }) => ({
      acknowledgedCursor: request.appliedCursor,
      serverHead: request.appliedCursor,
    })),
    ...overrides,
  } as unknown as SyncV2Client
}

describe('SyncV2ProjectCoordinator', () => {
  it('pulls before push, consumes the accepted mutation from the feed, then acknowledges', async () => {
    const projectState = state()
    const db = fakeDb(projectState)
    const calls: string[] = []
    const client = fakeClient({
      pull: vi.fn(async (_projectId, after) => {
        calls.push(`pull:${after.sequence}`)
        return after.sequence === 0 && calls.includes('push') ? pull(0, 1, [batch(1)]) : pull(after.sequence, after.sequence)
      }),
      push: vi.fn(async () => {
        calls.push('push')
        return {
          mutationId: 'mutation-0001', replayed: false,
          committedCursor: { epoch: 'epoch-1', sequence: 1 }, batch: batch(1),
        }
      }),
      acknowledge: vi.fn(async (_projectId, request) => {
        calls.push(`ack:${request.appliedCursor.sequence}`)
        return { acknowledgedCursor: request.appliedCursor, serverHead: request.appliedCursor }
      }),
    })
    const onTablesApplied = vi.fn()

    const result = await new SyncV2ProjectCoordinator({
      db, productionId: 'production-1', clientId: 'client-0001', client,
      now: () => new Date(timestamp), random: () => 0.5,
      applyBatch: async ({ batch: pulled }) => {
        calls.push(`apply:${pulled.cursor.sequence}`)
        projectState.applied_cursor = pulled.cursor.sequence
        projectState.head_cursor = pulled.cursor.sequence
      },
      onTablesApplied,
    }).runOnce()

    expect(result).toEqual({
      status: 'caught_up', pulledBatches: 1, pushedBatches: 1, appliedTables: ['scenes'],
    })
    expect(calls).toEqual(['pull:0', 'push', 'pull:0', 'apply:1', 'pull:1', 'ack:1'])
    expect(onTablesApplied).toHaveBeenCalledWith('production-1', ['scenes'])
  })

  it('moves a conflicting mutation to blocked and exposes the project conflict state', async () => {
    const projectState = state()
    const db = fakeDb(projectState)
    const client = fakeClient({
      push: vi.fn(async () => {
        throw new SyncV2RequestError({
          message: 'Scene changed elsewhere', status: 409, code: 'conflict', retryable: false,
        })
      }),
    })

    const result = await new SyncV2ProjectCoordinator({
      db, productionId: 'production-1', clientId: 'client-0001', client,
      applyBatch: vi.fn(), now: () => new Date(timestamp),
    }).runOnce()

    expect(result.status).toBe('conflicts')
    expect(projectState.mode).toBe('conflicts')
    expect(db.executed.some(({ sql, bindValues }) =>
      sql.includes('last_error_code') && bindValues.includes('blocked') && bindValues.includes('conflict'),
    )).toBe(true)
  })

  it('returns retryable sends to pending with bounded backoff and marks the project offline', async () => {
    const projectState = state()
    const db = fakeDb(projectState)
    const client = fakeClient({
      push: vi.fn(async () => {
        throw new SyncV2RequestError({
          message: 'Host unavailable', status: null, code: 'network_error', retryable: true,
        })
      }),
    })

    const result = await new SyncV2ProjectCoordinator({
      db, productionId: 'production-1', clientId: 'client-0001', client,
      applyBatch: vi.fn(), now: () => new Date(timestamp), random: () => 0.5,
    }).runOnce()

    expect(result.status).toBe('offline')
    expect(projectState.mode).toBe('offline')
    expect(db.executed.some(({ sql, bindValues }) =>
      sql.includes('last_error_code')
      && bindValues.includes('pending')
      && bindValues.includes('2026-09-08T10:00:01.000Z'),
    )).toBe(true)
  })

  it('does not perform network work while paused', async () => {
    const projectState = state()
    projectState.mode = 'paused'
    const client = fakeClient()
    const result = await new SyncV2ProjectCoordinator({
      db: fakeDb(projectState), productionId: 'production-1', clientId: 'client-0001', client,
      applyBatch: vi.fn(),
    }).runOnce()

    expect(result.status).toBe('paused')
    expect(client.pull).not.toHaveBeenCalled()
    expect(client.push).not.toHaveBeenCalled()
  })
})
