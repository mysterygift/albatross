import initSqlJs, { type Database } from 'sql.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { sqlJsQueryExec } from '@/test/apf/sqlJsQueryExec'

import {
  applyPulledBatchTransaction,
  ensureSyncClientIdentity,
  executeSyncMutationTransaction,
  loadMutationBatchForPush,
} from './localStore'
import { SYNC_V2_PROTOCOL_VERSION } from './types'

let raw: Database
let db: ReturnType<typeof createSqlJsTauriAdapter>

beforeEach(async () => {
  const SQL = await initSqlJs()
  raw = new SQL.Database()
  raw.exec('PRAGMA foreign_keys = ON')
  applyAlbatrossMigrationsSqlJs(raw)
  raw.exec(`
    INSERT INTO productions (id, name, created_at, updated_at)
    VALUES ('production-1', 'Pilot', 't', 't');
    INSERT INTO sync_project_state
      (production_id, server_project_id, mode, epoch, applied_cursor, head_cursor,
       protocol_version, schema_version, registry_hash)
    VALUES
      ('production-1', 'server-project-9', 'collaborative', 'epoch-1', 4, 4,
       '2.0', 87, 'sha256:test');
  `)
  db = createSqlJsTauriAdapter(raw)
})

afterEach(() => raw.close())

function count(table: string): number {
  return Number(sqlJsQueryExec(raw, `SELECT COUNT(*) FROM ${table}`)[0]?.values[0]?.[0] ?? 0)
}

describe('sync-v2 SQLite transaction boundaries', () => {
  it('round-trips an immutable durable batch into the strict wire request', async () => {
    await ensureSyncClientIdentity(db, { clientId: 'client-install-1', deviceLabel: 'Editing Mac' })
    await executeSyncMutationTransaction(db, {
      productionId: 'production-1',
      clientId: 'client-install-1',
      operationName: 'create scene',
      batchId: 'mutation-0001',
      baseCursor: { epoch: 'epoch-1', sequence: 4 },
      protocolVersion: SYNC_V2_PROTOCOL_VERSION,
      schemaVersion: 87,
      registryHash: 'sha256:test',
      domainStatements: [{
        sql: `INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $4)`,
        bindValues: ['scene-1', 'production-1', '1', 't'],
      }],
      operations: [{
        table: 'scenes',
        rowId: 'scene-1',
        operation: 'create',
        baseVersion: null,
        fullRow: { id: 'scene-1', production_id: 'production-1', scene_number: '1' },
      }],
    })

    await expect(loadMutationBatchForPush(db, 'mutation-0001')).resolves.toEqual({
      protocolVersion: '2.0',
      schemaVersion: 87,
      registryHash: 'sha256:test',
      mutationId: 'mutation-0001',
      clientId: 'client-install-1',
      baseCursor: { epoch: 'epoch-1', sequence: 4 },
      operations: [{
        table: 'scenes',
        rowId: 'scene-1',
        operation: 'create',
        baseVersion: null,
        fullRow: { id: 'scene-1', production_id: 'production-1', scene_number: '1' },
      }],
    })
  })

  it('rolls back a domain write when durable journal insertion fails', async () => {
    await expect(executeSyncMutationTransaction(db, {
      productionId: 'production-1',
      clientId: 'missing-client',
      operationName: 'create scene',
      baseCursor: { epoch: 'epoch-1', sequence: 4 },
      protocolVersion: SYNC_V2_PROTOCOL_VERSION,
      schemaVersion: 87,
      registryHash: 'sha256:test',
      domainStatements: [{
        sql: `INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $4)`,
        bindValues: ['scene-1', 'production-1', '1', 't'],
      }],
      operations: [{
        table: 'scenes',
        rowId: 'scene-1',
        operation: 'create',
        baseVersion: null,
        fullRow: { id: 'scene-1', production_id: 'production-1', scene_number: '1' },
      }],
    })).rejects.toThrow()

    expect(count('scenes')).toBe(0)
    expect(count('sync_mutation_batches')).toBe(0)
  })

  it('rolls back pulled domain writes without advancing row state or cursor', async () => {
    await expect(applyPulledBatchTransaction(db, {
      productionId: 'production-1',
      epoch: 'epoch-1',
      appliedCursor: 5,
      headCursor: 5,
      domainStatements: [
        {
          sql: `INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $4)`,
          bindValues: ['scene-1', 'production-1', '1', 't'],
        },
        {
          sql: 'INSERT INTO shots (id, scene_id, shot_number, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)',
          bindValues: ['shot-1', 'missing-scene', '1A', 't'],
        },
      ],
      rows: [{ table: 'scenes', entityId: 'scene-1', serverVersion: 1, cursor: 5, tombstone: false }],
    })).rejects.toThrow()

    expect(count('scenes')).toBe(0)
    expect(count('sync_row_state')).toBe(0)
    expect(sqlJsQueryExec(raw, `SELECT applied_cursor FROM sync_project_state`)[0]?.values[0]?.[0]).toBe(4)
  })

  it('atomically rejects a stale pull when another applier advances first', async () => {
    const racingDb = {
      ...db,
      async executeBatch(statements: Parameters<typeof db.executeBatch>[0]) {
        raw.exec(`UPDATE sync_project_state SET applied_cursor = 6, head_cursor = 6 WHERE production_id = 'production-1'`)
        await db.executeBatch(statements)
      },
    }

    await expect(applyPulledBatchTransaction(racingDb, {
      productionId: 'production-1',
      epoch: 'epoch-1',
      appliedCursor: 5,
      headCursor: 5,
      domainStatements: [],
      rows: [],
    })).rejects.toThrow()

    expect(sqlJsQueryExec(raw, `SELECT applied_cursor FROM sync_project_state`)[0]?.values[0]?.[0]).toBe(6)
  })

  it('atomically rejects a pull when project sync state is detached concurrently', async () => {
    const racingDb = {
      ...db,
      async executeBatch(statements: Parameters<typeof db.executeBatch>[0]) {
        raw.exec(`DELETE FROM sync_project_state WHERE production_id = 'production-1'`)
        await db.executeBatch(statements)
      },
    }

    await expect(applyPulledBatchTransaction(racingDb, {
      productionId: 'production-1',
      epoch: 'epoch-1',
      appliedCursor: 5,
      headCursor: 5,
      domainStatements: [{
        sql: `INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $4)`,
        bindValues: ['scene-race', 'production-1', '1', 't'],
      }],
      rows: [],
    })).rejects.toThrow()

    expect(count('scenes')).toBe(0)
    expect(count('sync_apply_guard')).toBe(0)
  })
})
