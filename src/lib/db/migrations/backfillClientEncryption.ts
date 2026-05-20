import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { getDb, now, runInSerializedTransaction } from '@/lib/db/client'
import {
  encryptClientFieldsForStorage,
  readLegacyClientRowFields,
  rowNeedsClientEncryption,
} from '@/lib/security/clientFieldCrypto'
import { getDataEncryptionKey, hasDataEncryptionKey, isClientEncryptionEnabled } from '@/lib/security/dataEncryptionContext'

const TABLE = 'clients'

export async function countLegacyClientRows(db: DatabaseAdapter): Promise<number> {
  const rows = await db.select<Array<{ cnt: number | string }>>(
    `SELECT COUNT(*) AS cnt FROM ${TABLE} WHERE deleted_at IS NULL AND (name IS NULL OR name NOT LIKE 'v1:%')`,
    []
  )
  return Number(rows[0]?.cnt ?? 0)
}

/**
 * Encrypt plaintext client rows in place. Requires an active DEK (post-login).
 */
export async function backfillClientEncryptionIfNeeded(db?: DatabaseAdapter): Promise<number> {
  const conn = db ?? (await getDb())
  if (!(await isClientEncryptionEnabled(conn))) return 0
  if (!hasDataEncryptionKey()) return 0

  const legacy = await conn.select<Record<string, unknown>[]>(
    `SELECT id, name, email, phone FROM ${TABLE} WHERE deleted_at IS NULL AND (name IS NULL OR name NOT LIKE 'v1:%')`,
    []
  )
  if (legacy.length === 0) return 0

  getDataEncryptionKey()
  const ts = now()
  let updated = 0

  await runInSerializedTransaction(async () => {
    const batchDb = await getDb()
    for (const row of legacy) {
      if (!rowNeedsClientEncryption(row)) continue
      const plain = readLegacyClientRowFields(row)
      const stored = await encryptClientFieldsForStorage(plain)
      await batchDb.execute(
        `UPDATE ${TABLE} SET name = $1, email = $2, phone = $3, name_sort_key = $4, updated_at = $5 WHERE id = $6`,
        [stored.name, stored.email, stored.phone, stored.name_sort_key, ts, row.id]
      )
      updated++
    }
  })

  return updated
}
