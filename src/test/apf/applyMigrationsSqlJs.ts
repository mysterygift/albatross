import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Database } from 'sql.js'

/**
 * Applies `src-tauri/migrations/*.sql` in lexical order to an empty sql.js database.
 */
export function applyAlbatrossMigrationsSqlJs(db: Database): void {
  const dir = join(process.cwd(), 'src-tauri/migrations')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8')
    try {
      db.exec(sql)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`Migration ${file} failed: ${msg}`)
    }
  }
}
