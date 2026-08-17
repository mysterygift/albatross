import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('sensitive entity encryption migration parity', () => {
  it('adds equivalent blind-index columns and indexes on SQLite and PostgreSQL', () => {
    const sqlite = readFileSync(
      join(process.cwd(), 'src-tauri/migrations/0086_sensitive_entity_field_encryption.sql'),
      'utf8'
    )
    const postgres = readFileSync(
      join(process.cwd(), 'postgres/migrations/0020_sensitive_entity_field_encryption.sql'),
      'utf8'
    )
    for (const fragment of [
      'people ADD COLUMN name_sort_key TEXT',
      'vendors ADD COLUMN company_name_sort_key TEXT',
      'locations ADD COLUMN name_sort_key TEXT',
      'idx_people_name_sort_key',
      'idx_vendors_company_name_sort_key',
      'idx_locations_name_sort_key',
    ]) {
      expect(sqlite).toContain(fragment)
      expect(postgres).toContain(fragment)
    }
  })
})
