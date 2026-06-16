import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Ensures every `src-tauri/migrations/*.sql` file is registered in `lib.rs`.
 * Unregistered migrations never run at app startup (see docs/ADDING_A_PROPERTY.md).
 */
describe('Tauri SQLite migration registration (lib.rs)', () => {
  it('registers every migration file with sequential version numbers', () => {
    const migrationsDir = join(process.cwd(), 'src-tauri/migrations')
    const sqlFiles = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const libRs = readFileSync(join(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8')

    const registeredFiles = [...libRs.matchAll(/include_str!\("\.\.\/migrations\/(\d{4}_[^"]+\.sql)"\)/g)].map(
      (m) => m[1]!
    )
    registeredFiles.sort()

    expect(registeredFiles).toEqual(sqlFiles)
    expect(registeredFiles.length).toBeGreaterThan(0)

    const versions = [...libRs.matchAll(/version: (\d+),/g)].map((m) => Number(m[1]))
    const expectedVersions = sqlFiles.map((_, i) => i + 1)
    expect(versions).toEqual(expectedVersions)
  })

  it('uses matching numeric prefixes between filenames and registration order', () => {
    const libRs = readFileSync(join(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8')
    const registeredFiles = [...libRs.matchAll(/include_str!\("\.\.\/migrations\/(\d{4}_[^"]+\.sql)"\)/g)].map(
      (m) => m[1]!
    )

    registeredFiles.forEach((file, index) => {
      const prefix = file.slice(0, 4)
      expect(Number(prefix), `${file} prefix should match registration index ${index + 1}`).toBe(index + 1)
    })
  })
})
