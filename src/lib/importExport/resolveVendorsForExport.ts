import { getDb } from '@/lib/db/client'
import type { ApfTableRow } from '@/lib/importExport/payload'
import { isClientEncryptionEnabled } from '@/lib/security/dataEncryptionContext'
import { requireSensitiveDataAccess } from '@/lib/security/sensitiveDataAccess'
import { decryptVendorFields } from '@/lib/security/sensitiveEntityFieldCrypto'

function asRow(r: Record<string, unknown>): ApfTableRow {
  return r as ApfTableRow
}

/**
 * Loads vendor rows for APF export: production-owned vendors plus portable copies of
 * referenced global vendors (materialized as local rows for self-contained packages).
 */
export async function resolveVendorsForExport(productionId: string): Promise<ApfTableRow[]> {
  await requireSensitiveDataAccess()
  const db = await getDb()
  const encryptionEnabled = await isClientEncryptionEnabled(db)

  const productionVendors = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM vendors WHERE production_id = $1 AND deleted_at IS NULL`,
    [productionId]
  )

  const byId = new Map<string, ApfTableRow>()
  for (const row of productionVendors) {
    byId.set(String(row.id), asRow(encryptionEnabled ? await decryptVendorFields(row) : { ...row }))
  }

  const referencedGlobal = await db.select<Record<string, unknown>[]>(
    `SELECT v.* FROM vendors v
     WHERE v.is_global = 1 AND v.deleted_at IS NULL
       AND v.id IN (
         SELECT vendor_id FROM expenses
         WHERE production_id = $1 AND vendor_id IS NOT NULL AND deleted_at IS NULL
         UNION
         SELECT vendor_id FROM vendor_invoices
         WHERE production_id = $1 AND deleted_at IS NULL
         UNION
         SELECT vendor_id FROM vendor_purchase_orders
         WHERE production_id = $1 AND deleted_at IS NULL
         UNION
         SELECT vendor_id FROM equipment
         WHERE production_id = $1 AND vendor_id IS NOT NULL AND deleted_at IS NULL
       )`,
    [productionId]
  )

  for (const row of referencedGlobal) {
    const id = String(row.id)
    if (byId.has(id)) continue
    byId.set(
      id,
      asRow({
        ...(encryptionEnabled ? await decryptVendorFields(row) : row),
        production_id: productionId,
        is_global: 0,
      })
    )
  }

  return [...byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)))
}
