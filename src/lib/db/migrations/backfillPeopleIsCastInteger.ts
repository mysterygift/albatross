import { getDb, now, runInSerializedTransaction } from '@/lib/db/client'
import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { coerceBoolean } from '@/lib/db/sqlValueCoercion'

const TABLE = 'people'

function normalizeIsCastSqlite(isCast: unknown): 0 | 1 {
  return coerceBoolean(isCast, false) ? 1 : 0
}

/**
 * Repair people.is_cast rows stored as non-integer values (e.g. boolean binds from createPerson bug).
 * Ensures listCrew / listCast filters (`is_cast = 0` / `is_cast = 1`) match Bookings' listPeopleByProduction.
 */
export async function backfillPeopleIsCastIntegerIfNeeded(db?: DatabaseAdapter): Promise<number> {
  const conn = db ?? (await getDb())
  if (conn.dialect !== 'sqlite') return 0

  const rows = await conn.select<Record<string, unknown>[]>(
    `SELECT id, is_cast FROM ${TABLE}
     WHERE deleted_at IS NULL
       AND (is_cast IS NULL OR (is_cast != 0 AND is_cast != 1))`,
    []
  )
  if (rows.length === 0) return 0

  const ts = now()
  let updated = 0

  await runInSerializedTransaction(async () => {
    const batchDb = await getDb()
    for (const row of rows) {
      const normalized = normalizeIsCastSqlite(row.is_cast)
      await batchDb.execute(
        `UPDATE ${TABLE} SET is_cast = $1, updated_at = $2 WHERE id = $3`,
        [normalized, ts, row.id]
      )
      updated++
    }
  })

  return updated
}
