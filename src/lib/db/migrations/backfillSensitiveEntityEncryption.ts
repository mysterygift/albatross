import type { DatabaseAdapter } from '@/lib/db/databaseAdapter'
import { getDb, now, runInSerializedTransaction } from '@/lib/db/client'
import { hasDataEncryptionKey, isClientEncryptionEnabled } from '@/lib/security/dataEncryptionContext'
import {
  encryptLocationFields,
  encryptPersonFields,
  encryptVendorFields,
  LOCATION_PROTECTED_FIELDS,
  PERSON_PROTECTED_FIELDS,
  rowNeedsProtectedFieldEncryption,
  VENDOR_PROTECTED_FIELDS,
} from '@/lib/security/sensitiveEntityFieldCrypto'

type EntitySpec = {
  table: 'people' | 'locations' | 'vendors'
  identityField: 'name' | 'company_name'
  sortKey: 'name_sort_key' | 'company_name_sort_key'
  fields: readonly string[]
  encrypt: (row: Record<string, unknown>) => Promise<Record<string, unknown>>
}

const SPECS: readonly EntitySpec[] = [
  { table: 'people', identityField: 'name', sortKey: 'name_sort_key', fields: PERSON_PROTECTED_FIELDS, encrypt: encryptPersonFields },
  { table: 'locations', identityField: 'name', sortKey: 'name_sort_key', fields: LOCATION_PROTECTED_FIELDS, encrypt: encryptLocationFields },
  { table: 'vendors', identityField: 'company_name', sortKey: 'company_name_sort_key', fields: VENDOR_PROTECTED_FIELDS, encrypt: encryptVendorFields },
]

/** Encrypts legacy plaintext entity rows after login has established the DEK. */
export async function backfillSensitiveEntityEncryptionIfNeeded(db?: DatabaseAdapter): Promise<number> {
  const conn = db ?? (await getDb())
  if (!(await isClientEncryptionEnabled(conn)) || !hasDataEncryptionKey()) return 0

  let updated = 0
  const ts = now()
  await runInSerializedTransaction(async () => {
    const batchDb = await getDb()
    for (const spec of SPECS) {
      const rows = await batchDb.select<Record<string, unknown>[]>(
        `SELECT id, ${spec.fields.join(', ')} FROM ${spec.table} WHERE ${spec.identityField} IS NOT NULL AND ${spec.identityField} NOT LIKE 'v1:%'`,
        []
      )
      for (const row of rows) {
        if (!rowNeedsProtectedFieldEncryption(row, spec.identityField)) continue
        const stored = await spec.encrypt(row)
        const assignments = [...spec.fields, spec.sortKey, 'updated_at']
          .map((field, index) => `${field} = $${index + 1}`)
        await batchDb.execute(
          `UPDATE ${spec.table} SET ${assignments.join(', ')} WHERE id = $${assignments.length + 1}`,
          [...spec.fields.map((field) => stored[field] ?? null), stored[spec.sortKey] ?? null, ts, row.id]
        )
        updated++
      }
    }
  })
  return updated
}
