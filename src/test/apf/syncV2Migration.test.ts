import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'

import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'
import { sqlJsQueryExec } from '@/test/apf/sqlJsQueryExec'

describe('0087 sync-v2 foundation migration', () => {
  it('applies to the real migration chain and enforces durable wire mutation shapes', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    db.exec('PRAGMA foreign_keys = ON')
    applyAlbatrossMigrationsSqlJs(db)

    db.exec(`
      INSERT INTO productions (id, name, created_at, updated_at)
      VALUES ('production-1', 'Pilot', 't', 't');
      INSERT INTO sync_client_identity (id, device_label)
      VALUES ('client-install-1', 'Editing Mac');
      INSERT INTO sync_project_state
        (production_id, server_project_id, mode, epoch, applied_cursor, head_cursor,
         protocol_version, schema_version, registry_hash)
      VALUES
        ('production-1', 'server-project-9', 'collaborative', 'epoch-1', 4, 4,
         '2.0', 87, 'sha256:registry');
      INSERT INTO sync_apply_guard (production_id, guarded_cursor)
      VALUES ('production-1', 4);
      INSERT INTO sync_mutation_batches
        (id, production_id, client_id, local_sequence, operation_name, base_epoch, base_cursor,
         protocol_version, schema_version, registry_hash)
      VALUES
        ('mutation-1', 'production-1', 'client-install-1', 0, 'rename scene', 'epoch-1', 4,
         '2.0', 87, 'sha256:registry');
      INSERT INTO sync_mutations
        (batch_id, operation_index, entity_table, entity_id, operation, base_server_version,
         base_values_json, patch_json)
      VALUES
        ('mutation-1', 0, 'scenes', 'scene-1', 'patch', 1,
         '{"title":"Old"}', '{"title":"New"}');
    `)

    const batch = sqlJsQueryExec(db, `
      SELECT base_epoch, base_cursor, protocol_version, schema_version, registry_hash
      FROM sync_mutation_batches WHERE id = 'mutation-1'
    `)[0]?.values[0]
    expect(batch).toEqual(['epoch-1', 4, '2.0', 87, 'sha256:registry'])

    expect(() => db.exec(`
      INSERT INTO sync_mutations
        (batch_id, operation_index, entity_table, entity_id, operation, full_row_json)
      VALUES ('mutation-1', 1, 'scenes', 'scene-2', 'patch', '{"id":"scene-2"}')
    `)).toThrow()

    db.exec(`DELETE FROM productions WHERE id = 'production-1'`)
    for (const table of ['sync_project_state', 'sync_apply_guard', 'sync_mutation_batches', 'sync_mutations']) {
      expect(sqlJsQueryExec(db, `SELECT COUNT(*) FROM ${table}`)[0]?.values[0]?.[0]).toBe(0)
    }
    db.close()
  })
})
