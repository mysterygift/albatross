import initSqlJs, { type Database } from 'sql.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'
import { sqlJsQueryExec } from '@/test/apf/sqlJsQueryExec'

import { applyPilotChangeBatch } from './inboundApplier'
import type { ChangeBatch } from './types'

let raw: Database
let db: ReturnType<typeof createSqlJsTauriAdapter>

beforeEach(async () => {
  const SQL = await initSqlJs()
  raw = new SQL.Database()
  raw.exec('PRAGMA foreign_keys = ON')
  applyAlbatrossMigrationsSqlJs(raw)
  raw.exec(`
    INSERT INTO productions (id, name, client_id, currency_code, created_at, updated_at)
    VALUES ('production-1', 'Local', NULL, 'GBP', 't', 't');
    INSERT INTO sync_project_state
      (production_id, server_project_id, mode, epoch, applied_cursor, head_cursor,
       protocol_version, schema_version, registry_hash)
    VALUES ('production-1', 'server-project-1', 'collaborative', 'epoch-1', 0, 0,
            '2.0', 87, 'sha256:test');
  `)
  db = createSqlJsTauriAdapter(raw)
})

afterEach(() => raw.close())

function batch(changes: ChangeBatch['changes']): ChangeBatch {
  return {
    cursor: { epoch: 'epoch-1', sequence: 1 },
    transactionId: 'transaction-0001',
    actorUserId: null,
    clientId: 'client-0001',
    mutationId: 'mutation-0001',
    committedAt: '2026-09-08T12:00:00.000Z',
    changes,
  }
}

describe('sync-v2 pilot inbound applier', () => {
  it('applies a parent-first graph and advances row metadata and cursor atomically', async () => {
    await applyPilotChangeBatch(db, {
      productionId: 'production-1',
      observedHead: { epoch: 'epoch-1', sequence: 1 },
      batch: batch([
        {
          ordinal: 0,
          table: 'scenes',
          rowId: 'scene-0001',
          operation: 'upsert',
          rowVersion: 1,
          row: {
            id: 'scene-0001', production_id: 'production-1', scene_number: '1',
            title: 'Office arrival', created_at: 't', updated_at: 't', deleted_at: null,
          },
        },
        {
          ordinal: 1,
          table: 'shots',
          rowId: 'shot-0001',
          operation: 'upsert',
          rowVersion: 1,
          row: {
            id: 'shot-0001', scene_id: 'scene-0001', shot_number: '1A',
            created_at: 't', updated_at: 't', deleted_at: null,
          },
        },
      ]),
    })

    expect(sqlJsQueryExec(raw, "SELECT title FROM scenes WHERE id = 'scene-0001'")[0]?.values[0]?.[0])
      .toBe('Office arrival')
    expect(sqlJsQueryExec(raw, 'SELECT COUNT(*) FROM shots')[0]?.values[0]?.[0]).toBe(1)
    expect(sqlJsQueryExec(raw, 'SELECT COUNT(*) FROM sync_row_state')[0]?.values[0]?.[0]).toBe(2)
    expect(sqlJsQueryExec(raw, 'SELECT applied_cursor, head_cursor FROM sync_project_state')[0]?.values[0])
      .toEqual([1, 1])
    expect(sqlJsQueryExec(raw, 'SELECT COUNT(*) FROM outbox')[0]?.values[0]?.[0]).toBe(0)
  })

  it('preserves a deferred local scene location when applying a server echo', async () => {
    raw.exec(`
      INSERT INTO locations (id, production_id, name, booked_status, created_at, updated_at)
      VALUES ('location-1', 'production-1', 'Local location', 'unbooked', 't', 't');
      INSERT INTO scenes
        (id, production_id, scene_number, location_id, created_at, updated_at)
      VALUES ('scene-0001', 'production-1', '1', 'location-1', 't', 't');
    `)

    await applyPilotChangeBatch(db, {
      productionId: 'production-1',
      observedHead: { epoch: 'epoch-1', sequence: 1 },
      batch: batch([{
        ordinal: 0,
        table: 'scenes',
        rowId: 'scene-0001',
        operation: 'upsert',
        rowVersion: 2,
        row: {
          id: 'scene-0001', production_id: 'production-1', scene_number: '2',
          created_at: 't', updated_at: 't2', deleted_at: null,
        },
      }]),
    })

    expect(sqlJsQueryExec(raw, "SELECT scene_number, location_id FROM scenes WHERE id = 'scene-0001'")[0]?.values[0])
      .toEqual(['2', 'location-1'])
  })

  it('rolls back the whole batch and cursor when a child row is invalid', async () => {
    await expect(applyPilotChangeBatch(db, {
      productionId: 'production-1',
      observedHead: { epoch: 'epoch-1', sequence: 1 },
      batch: batch([{
        ordinal: 0,
        table: 'shots',
        rowId: 'shot-0001',
        operation: 'upsert',
        rowVersion: 1,
        row: {
          id: 'shot-0001', scene_id: 'missing-scene', shot_number: '1',
          created_at: 't', updated_at: 't', deleted_at: null,
        },
      }]),
    })).rejects.toThrow('does not belong to the local production')

    expect(sqlJsQueryExec(raw, 'SELECT COUNT(*) FROM shots')[0]?.values[0]?.[0]).toBe(0)
    expect(sqlJsQueryExec(raw, 'SELECT applied_cursor FROM sync_project_state')[0]?.values[0]?.[0]).toBe(0)
  })
})
