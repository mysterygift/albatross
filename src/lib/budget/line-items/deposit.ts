import { z } from 'zod'

export const DEPOSIT_REFUNDABLE_STATUSES = ['refundable', 'non_refundable'] as const
export type DepositRefundableStatus = (typeof DEPOSIT_REFUNDABLE_STATUSES)[number]

export const depositLineItemDetailsSchema = z.object({
  deposit_description: z.string().nullable().optional().default(null),
  refundable_status: z.enum(DEPOSIT_REFUNDABLE_STATUSES).nullable().optional().default(null),
  vendor_id: z.string().nullable().optional().default(null),
  location_id: z.string().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
})

export type DepositLineItemDetails = z.infer<typeof depositLineItemDetailsSchema>

export function parseDepositLineItemDetails(
  detailsJson: string
): { ok: true; value: DepositLineItemDetails } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(detailsJson)
    const res = depositLineItemDetailsSchema.safeParse(parsed)
    if (!res.success) return { ok: false, error: res.error.issues.map((i) => i.message).join('; ') }
    return { ok: true, value: res.data }
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }
}

export function depositLineItemDetailsToJson(details: DepositLineItemDetails): string {
  const res = depositLineItemDetailsSchema.safeParse(details)
  if (!res.success) throw new Error(res.error.issues.map((i) => i.message).join('; '))
  return JSON.stringify(res.data)
}
