import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { getDb, now, runInSerializedTransaction } from '@/lib/db/client'
import {
  computeClientNameSortKey,
  decryptClientField,
  encryptClientField,
} from '@/lib/security/clientFieldCrypto'

const TABLE = 'clients'

export type ReencryptClientFieldsArgs = {
  fromDek: Uint8Array
  toDek: Uint8Array
}

/**
 * Re-encrypt all encrypted client rows from one DEK to another (password recovery).
 */
export async function reencryptAllClientFields(
  db: DatabaseAdapter,
  args: ReencryptClientFieldsArgs
): Promise<number> {
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT id, name, email, phone FROM ${TABLE} WHERE deleted_at IS NULL AND name LIKE 'v1:%'`,
    []
  )
  if (rows.length === 0) return 0

  const ts = now()
  let updated = 0

  await runInSerializedTransaction(async () => {
    const batchDb = await getDb()
    for (const row of rows) {
      const id = String(row.id)
      const nameStored = row.name == null ? '' : String(row.name)
      const emailStored = row.email == null ? null : String(row.email)
      const phoneStored = row.phone == null ? null : String(row.phone)

      const [namePlain, emailPlain, phonePlain] = await Promise.all([
        decryptClientField(nameStored, args.fromDek),
        decryptClientField(emailStored, args.fromDek),
        decryptClientField(phoneStored, args.fromDek),
      ])
      const name = namePlain ?? ''
      const [nameEnc, emailEnc, phoneEnc, nameSortKey] = await Promise.all([
        encryptClientField(name, args.toDek),
        encryptClientField(emailPlain, args.toDek),
        encryptClientField(phonePlain, args.toDek),
        computeClientNameSortKey(name, args.toDek),
      ])
      await batchDb.execute(
        `UPDATE ${TABLE} SET name = $1, email = $2, phone = $3, name_sort_key = $4, updated_at = $5 WHERE id = $6`,
        [nameEnc, emailEnc, phoneEnc, nameSortKey, ts, id]
      )
      updated++
    }
  })

  return updated
}
