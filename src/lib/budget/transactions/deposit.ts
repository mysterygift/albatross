import { z } from 'zod'
import { DEPOSIT_REFUNDABLE_STATUSES } from '@/lib/budget/line-items/deposit'

export { DEPOSIT_REFUNDABLE_STATUSES }
export type { DepositRefundableStatus } from '@/lib/budget/line-items/deposit'

export const depositDetailsSchema = z.object({
  deposit_description: z.string().min(1, 'Deposit description is required'),
  refundable_status: z.enum(DEPOSIT_REFUNDABLE_STATUSES, {
    message: 'Select refundable or non-refundable',
  }),
  amount: z.number().finite().positive('Deposit amount must be greater than 0'),
  vendor_id: z.string().nullable().optional().default(null),
  location_id: z.string().nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
})

export type DepositDetails = z.infer<typeof depositDetailsSchema>

export function parseDepositDetails(
  detailsJson: string
): { ok: true; value: DepositDetails } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(detailsJson)
    const res = depositDetailsSchema.safeParse(parsed)
    if (!res.success) {
      return {
        ok: false,
        error: res.error.issues.map((i) => i.message).join('; '),
      }
    }
    return { ok: true, value: res.data }
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }
}

export function depositDetailsToJson(details: DepositDetails): string {
  const res = depositDetailsSchema.safeParse(details)
  if (!res.success) {
    throw new Error(res.error.issues.map((i) => i.message).join('; '))
  }
  return JSON.stringify(res.data)
}
