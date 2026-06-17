import { z } from 'zod'
import { hasMaxTwoDecimalPlaces } from '@/lib/budget/fieldValidation'

const intBool = z
  .union([z.boolean(), z.number().int()])
  .transform((v) => {
    if (typeof v === 'boolean') return v
    return v === 1
  })

export const purchaseDetailsSchema = z.object({
  purchase_category: z.string().min(1).nullable().optional().default(null),
  is_service_purchase: intBool.default(false),
  service_description: z.string().nullable().optional().default(null),
  location_id: z.string().min(1).nullable().optional().default(null),
  purchase_description: z.string().min(1, 'Purchase description is required'),
  vendor_id: z.string().min(1).nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
  /** Spend amount; required for creation. expenses.amount is source of truth for actuals. */
  amount: z
    .number()
    .finite()
    .positive('Purchase amount must be greater than 0')
    .refine(hasMaxTwoDecimalPlaces, { message: 'Amount must have at most 2 decimal places' })
    .optional()
    .default(0),
})

export type PurchaseDetails = z.infer<typeof purchaseDetailsSchema>

export function parsePurchaseDetails(
  detailsJson: string
): { ok: true; value: PurchaseDetails } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(detailsJson)
    const res = purchaseDetailsSchema.safeParse(parsed)
    if (!res.success) return { ok: false, error: res.error.issues.map((i) => i.message).join('; ') }
    return { ok: true, value: res.data }
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }
}

export function purchaseDetailsToJson(details: PurchaseDetails): string {
  const res = purchaseDetailsSchema.safeParse(details)
  if (!res.success) throw new Error(res.error.issues.map((i) => i.message).join('; '))
  const out = {
    ...res.data,
    is_service_purchase: res.data.is_service_purchase ? 1 : 0,
  }
  return JSON.stringify(out)
}

