import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { getDb, now, runInSerializedTransaction } from '@/lib/db/client'
import {
  computeClientNameSortKey,
  decryptClientField,
  encryptClientField,
} from '@/lib/security/clientFieldCrypto'
import {
  LOCATION_PROTECTED_FIELDS,
  PERSON_PROTECTED_FIELDS,
  VENDOR_PROTECTED_FIELDS,
} from '@/lib/security/sensitiveEntityFieldCrypto'

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
  const ts = now()
  let updated = 0

  await runInSerializedTransaction(async () => {
    const batchDb = (await getDb()) ?? db
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

    const entitySpecs = [
      { table: 'people', identity: 'name', sortKey: 'name_sort_key', fields: PERSON_PROTECTED_FIELDS },
      { table: 'locations', identity: 'name', sortKey: 'name_sort_key', fields: LOCATION_PROTECTED_FIELDS },
      { table: 'vendors', identity: 'company_name', sortKey: 'company_name_sort_key', fields: VENDOR_PROTECTED_FIELDS },
    ] as const
    for (const spec of entitySpecs) {
      const entityRows = await batchDb.select<Record<string, unknown>[]>(
        `SELECT id, ${spec.fields.join(', ')} FROM ${spec.table} WHERE ${spec.identity} LIKE 'v1:%'`,
        []
      )
      for (const row of entityRows) {
        const plaintext = await Promise.all(spec.fields.map((field) =>
          decryptClientField(row[field] == null ? null : String(row[field]), args.fromDek)
        ))
        const ciphertext = await Promise.all(plaintext.map((value) => encryptClientField(value, args.toDek)))
        const identityIndex = spec.fields.indexOf(spec.identity as never)
        const sortKey = await computeClientNameSortKey(plaintext[identityIndex] ?? '', args.toDek)
        const assignments = [...spec.fields, spec.sortKey, 'updated_at']
          .map((field, index) => `${field} = $${index + 1}`)
        await batchDb.execute(
          `UPDATE ${spec.table} SET ${assignments.join(', ')} WHERE id = $${assignments.length + 1}`,
          [...ciphertext, sortKey, ts, row.id]
        )
        updated++
      }
    }
  })

  return updated
}
