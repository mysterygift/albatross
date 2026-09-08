import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'

import { setDbAdapterForTests } from '@/lib/db/client'
import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'
import { sqlJsQueryExec } from '@/test/apf/sqlJsQueryExec'
import { createSqlJsTauriAdapter } from '@/test/apf/sqlJsTauriAdapter'

import { createShot } from './schedule'

let raw: Database

function scalar(sql: string): unknown {
  return sqlJsQueryExec(raw, sql)[0]?.values[0]?.[0]
}

function seedProductionGraph(mode: 'local_only' | 'collaborative'): void {
  raw.exec(`
    INSERT INTO productions
      (id, name, slug, currency_code, created_at, updated_at)
    VALUES
      ('production-1', 'Pilot', 'pilot', 'GBP', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z');
    INSERT INTO scenes
      (id, production_id, scene_number, created_at, updated_at)
    VALUES
      ('scene-0001', 'production-1', '1', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z');
    INSERT INTO sync_client_identity
      (id, device_label, created_at, updated_at)
    VALUES
      ('client-0001', 'Test device', '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z');
    INSERT INTO sync_project_state
      (production_id, mode, epoch, applied_cursor, head_cursor,
       protocol_version, schema_version, registry_hash, created_at, updated_at)
    VALUES
      ('production-1', '${mode}', ${mode === 'collaborative' ? "'epoch-0001'" : 'NULL'}, 0, 0,
       ${mode === 'collaborative' ? "'2.0'" : 'NULL'},
       ${mode === 'collaborative' ? '87' : 'NULL'},
       ${mode === 'collaborative' ? "'sha256:test'" : 'NULL'},
       '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z');
  `)
}

beforeEach(async () => {
  const SQL = await initSqlJs()
  raw = new SQL.Database()
  applyAlbatrossMigrationsSqlJs(raw)
  setDbAdapterForTests(createSqlJsTauriAdapter(raw))
})

afterEach(() => {
  setDbAdapterForTests(null)
  raw.close()
})

describe('createShot sync-v2 repository adoption', () => {
  it('commits the SQLite shot and its immutable create mutation together', async () => {
    seedProductionGraph('collaborative')

    const result = await createShot({
      scene_id: 'scene-0001',
      shot_number: ' 1A ',
      shot_description: 'Arrival',
    })

    expect(result.shot.shot_number).toBe('1A')
    expect(scalar('SELECT COUNT(*) FROM shots')).toBe(1)
    expect(scalar("SELECT COUNT(*) FROM outbox WHERE entity = 'shots'")).toBe(0)
    expect(scalar("SELECT COUNT(*) FROM sync_mutation_batches WHERE operation_name = 'create shot'")).toBe(1)
    expect(scalar("SELECT entity_table FROM sync_mutations WHERE operation_index = 0")).toBe('shots')

    const fullRowJson = String(scalar('SELECT full_row_json FROM sync_mutations'))
    expect(JSON.parse(fullRowJson)).toMatchObject({
      id: result.shot.id,
      scene_id: 'scene-0001',
      shot_number: '1A',
      shot_description: 'Arrival',
      deleted_at: null,
    })
    expect(fullRowJson).not.toContain('person_id')
  })

  it('rolls back the domain row and mutation batch if journalling fails', async () => {
    seedProductionGraph('collaborative')
    raw.exec(`
      CREATE TRIGGER reject_test_sync_mutation
      BEFORE INSERT ON sync_mutations
      BEGIN
        SELECT RAISE(ABORT, 'forced journal failure');
      END;
    `)

    await expect(createShot({ scene_id: 'scene-0001', shot_number: '1' }))
      .rejects.toThrow('forced journal failure')

    expect(scalar('SELECT COUNT(*) FROM shots')).toBe(0)
    expect(scalar('SELECT COUNT(*) FROM outbox')).toBe(0)
    expect(scalar('SELECT COUNT(*) FROM sync_mutation_batches')).toBe(0)
  })

  it('keeps local-only productions on the existing non-sync write path', async () => {
    seedProductionGraph('local_only')

    await createShot({ scene_id: 'scene-0001', shot_number: '1' })

    expect(scalar('SELECT COUNT(*) FROM shots')).toBe(1)
    expect(scalar("SELECT COUNT(*) FROM outbox WHERE entity = 'shots'")).toBe(1)
    expect(scalar('SELECT COUNT(*) FROM sync_mutation_batches')).toBe(0)
  })

  it('continues journalling while network delivery is paused', async () => {
    seedProductionGraph('collaborative')
    raw.exec("UPDATE sync_project_state SET mode = 'paused' WHERE production_id = 'production-1'")

    await createShot({ scene_id: 'scene-0001', shot_number: '1' })

    expect(scalar('SELECT COUNT(*) FROM shots')).toBe(1)
    expect(scalar('SELECT COUNT(*) FROM sync_mutation_batches')).toBe(1)
  })

  it('fails closed before the domain write when collaborative metadata is incomplete', async () => {
    seedProductionGraph('collaborative')
    raw.exec('DELETE FROM sync_client_identity')

    await expect(createShot({ scene_id: 'scene-0001', shot_number: '1' }))
      .rejects.toThrow('has incomplete sync metadata')

    expect(scalar('SELECT COUNT(*) FROM shots')).toBe(0)
    expect(scalar('SELECT COUNT(*) FROM outbox')).toBe(0)
  })

  it('blocks writes while a linked production requires re-bootstrap', async () => {
    seedProductionGraph('collaborative')
    raw.exec("UPDATE sync_project_state SET mode = 'needs_rebootstrap' WHERE production_id = 'production-1'")

    await expect(createShot({ scene_id: 'scene-0001', shot_number: '1' }))
      .rejects.toThrow('Collaborative writes are unavailable while production production-1 is needs_rebootstrap')

    expect(scalar('SELECT COUNT(*) FROM shots')).toBe(0)
    expect(scalar('SELECT COUNT(*) FROM sync_mutation_batches')).toBe(0)
  })

  it('rejects cast-linked creates until the PII dependency ring is supported', async () => {
    seedProductionGraph('collaborative')
    raw.exec(`
      INSERT INTO people
        (id, production_id, name, is_cast, created_at, updated_at)
      VALUES
        ('person-0001', 'production-1', 'Cast member', 1,
         '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z');
    `)

    await expect(createShot({
      scene_id: 'scene-0001',
      shot_number: '1',
      person_ids: ['person-0001'],
    })).rejects.toThrow('Shot cast collaboration is not available in the row-sync pilot')

    expect(scalar('SELECT COUNT(*) FROM shots')).toBe(0)
    expect(scalar('SELECT COUNT(*) FROM shot_cast')).toBe(0)
    expect(scalar('SELECT COUNT(*) FROM sync_mutation_batches')).toBe(0)
  })
})
