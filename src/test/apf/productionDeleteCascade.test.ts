/**
 * Permanently deleting a production is a single DELETE that relies on ON DELETE CASCADE (see
 * hardDeleteProduction), with foreign keys enforced as in the app. crew_availability (0074) shipped
 * without cascades, so deleting a production with crew availability failed until migration 0105.
 */
import initSqlJs, { type Database } from 'sql.js'
import { describe, expect, it } from 'vitest'

import { applyAlbatrossMigrationsSqlJs } from '@/test/apf/applyMigrationsSqlJs'

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAlbatrossMigrationsSqlJs(db)
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

function count(db: Database, sql: string): number {
  return Number(db.exec(sql)[0]!.values[0]![0])
}

describe('deleting productions and people with foreign keys on', () => {
  it('removes a production together with its crew availability', async () => {
    const db = await makeDb()
    db.exec(`
      INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'P', 't', 't');
      INSERT INTO people (id, production_id, name, is_cast, created_at, updated_at) VALUES ('pe1', 'p1', 'Gaffer', 0, 't', 't');
      INSERT INTO crew_availability (id, production_id, person_id, start_date, end_date, created_at, updated_at)
        VALUES ('ca1', 'p1', 'pe1', '2026-01-01', '2026-01-02', 't', 't');
    `)
    db.exec(`DELETE FROM productions WHERE id = 'p1'`)
    expect(count(db, 'SELECT COUNT(*) FROM crew_availability')).toBe(0)
    expect(count(db, 'SELECT COUNT(*) FROM people')).toBe(0)
    expect(db.exec('PRAGMA foreign_key_check')).toEqual([])
  })

  it('gives every foreign key to productions and people a delete action', async () => {
    const db = await makeDb()
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]!.values.map((r) => String(r[0]))
    const missing: string[] = []
    for (const table of tables) {
      for (const fk of db.exec(`PRAGMA foreign_key_list("${table}")`)[0]?.values ?? []) {
        const [, , parent, from, , , onDelete] = fk
        if ((parent === 'productions' || parent === 'people') && onDelete === 'NO ACTION') {
          missing.push(`${table}.${String(from)} -> ${String(parent)}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})
