import { z } from 'zod'

const intBool = z
  .union([z.boolean(), z.number().int()])
  .transform((v) => {
    if (typeof v === 'boolean') return v
    return v === 1
  })
  .optional()
  .default(false)

export const purchaseLineItemDetailsSchema = z.object({
  purchase_description: z.string().nullable().optional().default(null),
  purchase_category: z.string().nullable().optional().default(null),
  is_service_purchase: intBool,
  service_description: z.string().nullable().optional().default(null),
  location_id: z.string().nullable().optional().default(null),
  vendor_id: z.string().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
  /** Optional planning amount; estimated_cost on budget_items remains source of truth. */
  amount: z.number().finite().nonnegative().nullable().optional().default(null),
})

export type PurchaseLineItemDetails = z.infer<typeof purchaseLineItemDetailsSchema>

export function parsePurchaseLineItemDetails(
  detailsJson: string
): { ok: true; value: PurchaseLineItemDetails } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(detailsJson)
    const res = purchaseLineItemDetailsSchema.safeParse(parsed)
    if (!res.success) return { ok: false, error: res.error.issues.map((i) => i.message).join('; ') }
    return { ok: true, value: res.data }
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }
}

export function purchaseLineItemDetailsToJson(details: PurchaseLineItemDetails): string {
  const res = purchaseLineItemDetailsSchema.safeParse(details)
  if (!res.success) throw new Error(res.error.issues.map((i) => i.message).join('; '))
  const out = {
    ...res.data,
    is_service_purchase: res.data.is_service_purchase ? 1 : 0,
  }
  return JSON.stringify(out)
}
