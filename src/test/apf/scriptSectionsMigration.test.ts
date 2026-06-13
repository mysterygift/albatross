import initSqlJs, { type Database } from 'sql.js'
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { sqlJsQueryExec } from '@/test/apf/sqlJsQueryExec'

function applyAllMigrations(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(dir, file), 'utf8'))
  }
}

async function makeDb(): Promise<Database> {
  const SQL = await initSqlJs({})
  const db = new SQL.Database()
  applyAllMigrations(db)
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

/** Seeds production -> episode -> scene -> shot -> script version + page + section + range + character + link + sides export. */
function seedScriptData(db: Database): void {
  db.exec(`
    INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'Prod 1', 't', 't');
    INSERT INTO episodes (id, production_id, name, sort_order, created_at, updated_at) VALUES ('ep1', 'p1', 'Ep 1', 0, 't', 't');
    INSERT INTO scenes (id, production_id, scene_number, created_at, updated_at) VALUES ('sc1', 'p1', '1', 't', 't');
    INSERT INTO shots (id, scene_id, shot_number, created_at, updated_at) VALUES ('sh1', 'sc1', '1A', 't', 't');
    INSERT INTO people (id, production_id, name, is_cast, created_at, updated_at) VALUES ('pe1', 'p1', 'Actor', 1, 't', 't');
    INSERT INTO shoot_days (id, production_id, shoot_date, created_at, updated_at) VALUES ('sd1', 'p1', '2026-06-01', 't', 't');

    INSERT INTO script_versions (id, production_id, episode_id, title, version_label, revision_colour, is_locked, created_at, updated_at)
    VALUES ('sv1', 'p1', 'ep1', 'Shooting Script', 'v1', 'White', 0, 't', 't');

    INSERT INTO script_pages (id, script_version_id, scene_id, page_number, page_index, content, eighths, created_at, updated_at)
    VALUES ('pg1', 'sv1', 'sc1', '1', 0, 'INT. ROOM - DAY', 8, 't', 't');

    INSERT INTO script_sections (id, production_id, script_version_id, scene_id, episode_id, label, section_type, status, is_manual, created_at, updated_at)
    VALUES ('ss1', 'p1', 'sv1', 'sc1', 'ep1', 'Opening', 'dialogue', 'unplanned', 0, 't', 't');

    INSERT INTO script_section_ranges (id, section_id, start_page, start_eighth, end_page, end_eighth, created_at, updated_at)
    VALUES ('r1', 'ss1', '1', 0, '1', 4, 't', 't');

    INSERT INTO script_section_characters (id, section_id, person_id, character_name, created_at, updated_at)
    VALUES ('ch1', 'ss1', 'pe1', 'JANE', 't', 't');

    INSERT INTO shot_script_sections (id, shot_id, script_section_id, sort_index, created_at, updated_at)
    VALUES ('lk1', 'sh1', 'ss1', 0, 't', 't');

    INSERT INTO shoot_day_sides_exports (id, production_id, shoot_day_id, script_version_id, export_label, metadata_json, created_at, updated_at)
    VALUES ('ex1', 'p1', 'sd1', 'sv1', 'Sides v1', '{}', 't', 't');

    INSERT INTO documents (id, production_id, entity_type, entity_id, file_name, file_path, mime_type, created_at, updated_at)
    VALUES ('doc1', 'p1', 'sides_export', 'sd1', 'sides.pdf', 'attachments/p1/doc1-sides.pdf', 'application/pdf', 't', 't');

    UPDATE shoot_day_sides_exports SET document_id = 'doc1' WHERE id = 'ex1';
  `)
}

function count(db: Database, table: string, where: string): number {
  const res = sqlJsQueryExec(db, `SELECT COUNT(*) FROM ${table} WHERE ${where}`)
  return Number(res[0]?.values[0]?.[0] ?? 0)
}

describe('0075_script_sections_and_sides migration', () => {
  it('applies all migrations and creates the new tables', async () => {
    const db = await makeDb()
    for (const table of [
      'script_versions',
      'script_pages',
      'script_sections',
      'script_section_ranges',
      'script_section_characters',
      'shot_script_sections',
      'shoot_day_sides_exports',
    ]) {
      expect(() => sqlJsQueryExec(db, `SELECT COUNT(*) FROM ${table}`)).not.toThrow()
    }
  })

  it('enforces foreign keys on new tables', async () => {
    const db = await makeDb()
    db.exec(`INSERT INTO productions (id, name, created_at, updated_at) VALUES ('p1', 'Prod 1', 't', 't')`)
    expect(() =>
      db.exec(`
        INSERT INTO script_sections (id, production_id, script_version_id, scene_id, section_type, status, created_at, updated_at)
        VALUES ('ss-bad', 'p1', 'missing-version', 'missing-scene', 'action', 'unplanned', 't', 't')
      `)
    ).toThrow()
  })

  it('enforces the section_type and status CHECK constraints', async () => {
    const db = await makeDb()
    seedScriptData(db)
    expect(() =>
      db.exec(`
        INSERT INTO script_sections (id, production_id, script_version_id, scene_id, section_type, status, created_at, updated_at)
        VALUES ('ss-bad', 'p1', 'sv1', 'sc1', 'not-a-type', 'unplanned', 't', 't')
      `)
    ).toThrow()
    expect(() =>
      db.exec(`
        INSERT INTO script_sections (id, production_id, script_version_id, scene_id, section_type, status, created_at, updated_at)
        VALUES ('ss-bad2', 'p1', 'sv1', 'sc1', 'action', 'not-a-status', 't', 't')
      `)
    ).toThrow()
  })

  it('deleting a production removes all related script section data', async () => {
    const db = await makeDb()
    seedScriptData(db)

    db.exec(`DELETE FROM productions WHERE id = 'p1'`)

    expect(count(db, 'script_versions', `id = 'sv1'`)).toBe(0)
    expect(count(db, 'script_pages', `id = 'pg1'`)).toBe(0)
    expect(count(db, 'script_sections', `id = 'ss1'`)).toBe(0)
    expect(count(db, 'script_section_ranges', `id = 'r1'`)).toBe(0)
    expect(count(db, 'script_section_characters', `id = 'ch1'`)).toBe(0)
    expect(count(db, 'shot_script_sections', `id = 'lk1'`)).toBe(0)
    expect(count(db, 'shoot_day_sides_exports', `id = 'ex1'`)).toBe(0)
    expect(count(db, 'documents', `id = 'doc1'`)).toBe(0)
  })

  it('deleting a script version removes its pages, sections, and ranges', async () => {
    const db = await makeDb()
    seedScriptData(db)

    db.exec(`DELETE FROM script_versions WHERE id = 'sv1'`)

    expect(count(db, 'script_pages', `id = 'pg1'`)).toBe(0)
    expect(count(db, 'script_sections', `id = 'ss1'`)).toBe(0)
    expect(count(db, 'script_section_ranges', `id = 'r1'`)).toBe(0)
    expect(count(db, 'script_section_characters', `id = 'ch1'`)).toBe(0)
    // Production and scene survive.
    expect(count(db, 'productions', `id = 'p1'`)).toBe(1)
    expect(count(db, 'scenes', `id = 'sc1'`)).toBe(1)
  })

  it('deleting a shot removes its shot-section links but keeps the section', async () => {
    const db = await makeDb()
    seedScriptData(db)

    db.exec(`DELETE FROM shots WHERE id = 'sh1'`)

    expect(count(db, 'shot_script_sections', `id = 'lk1'`)).toBe(0)
    expect(count(db, 'script_sections', `id = 'ss1'`)).toBe(1)
  })

  it('nulls optional references on parent delete (scene SET NULL, person SET NULL)', async () => {
    const db = await makeDb()
    seedScriptData(db)

    db.exec(`DELETE FROM people WHERE id = 'pe1'`)
    const personRef = sqlJsQueryExec(db, `SELECT person_id FROM script_section_characters WHERE id = 'ch1'`)
    expect(personRef[0]?.values[0]?.[0]).toBeNull()
    expect(count(db, 'script_section_characters', `id = 'ch1'`)).toBe(1)
  })
})

describe('0076_script_version_previous_revision migration', () => {
  it('adds previous_script_version_id column with self-referential FK', async () => {
    const db = await makeDb()
    seedScriptData(db)

    db.exec(`
      INSERT INTO script_versions (id, production_id, episode_id, title, version_label, revision_colour, is_locked, previous_script_version_id, created_at, updated_at)
      VALUES ('sv2', 'p1', 'ep1', 'Rev 2', 'v2', 'Blue', 0, 'sv1', 't2', 't2')
    `)

    const prev = sqlJsQueryExec(db, `SELECT previous_script_version_id FROM script_versions WHERE id = 'sv2'`)
    expect(prev[0]?.values[0]?.[0]).toBe('sv1')
    expect(count(db, 'script_versions', `id = 'sv1'`)).toBe(1)
  })

  it('nulls previous_script_version_id when predecessor is deleted', async () => {
    const db = await makeDb()
    seedScriptData(db)

    db.exec(`
      INSERT INTO script_versions (id, production_id, episode_id, title, is_locked, previous_script_version_id, created_at, updated_at)
      VALUES ('sv2', 'p1', 'ep1', 'Rev 2', 0, 'sv1', 't2', 't2')
    `)
    db.exec(`DELETE FROM script_versions WHERE id = 'sv1'`)

    const prev = sqlJsQueryExec(db, `SELECT previous_script_version_id FROM script_versions WHERE id = 'sv2'`)
    expect(prev[0]?.values[0]?.[0]).toBeNull()
    expect(count(db, 'script_versions', `id = 'sv2'`)).toBe(1)
  })

  it('rejects invalid previous_script_version_id references', async () => {
    const db = await makeDb()
    seedScriptData(db)

    expect(() =>
      db.exec(`
        INSERT INTO script_versions (id, production_id, episode_id, title, is_locked, previous_script_version_id, created_at, updated_at)
        VALUES ('sv-bad', 'p1', 'ep1', 'Bad', 0, 'missing', 't', 't')
      `)
    ).toThrow()
  })
})
