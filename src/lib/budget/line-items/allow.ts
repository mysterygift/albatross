import { z } from 'zod'

export const ALLOW_LINE_ITEM_STATUSES = ['open', 'resolved'] as const
export type AllowLineItemStatus = (typeof ALLOW_LINE_ITEM_STATUSES)[number]

export const allowLineItemDetailsSchema = z.object({
  allow_description: z.string().nullable().optional().default(null),
  provisional_amount: z.number().finite().nonnegative().nullable().optional().default(null),
  status: z.enum(ALLOW_LINE_ITEM_STATUSES).nullable().optional().default(null),
  notes: z.string().nullable().optional().default(null),
})

export type AllowLineItemDetails = z.infer<typeof allowLineItemDetailsSchema>

export function parseAllowLineItemDetails(
  detailsJson: string
): { ok: true; value: AllowLineItemDetails } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(detailsJson)
    const res = allowLineItemDetailsSchema.safeParse(parsed)
    if (!res.success) return { ok: false, error: res.error.issues.map((i) => i.message).join('; ') }
    return { ok: true, value: res.data }
  } catch {
    return { ok: false, error: 'Invalid JSON' }
  }
}

export function allowLineItemDetailsToJson(details: AllowLineItemDetails): string {
  const res = allowLineItemDetailsSchema.safeParse(details)
  if (!res.success) throw new Error(res.error.issues.map((i) => i.message).join('; '))
  return JSON.stringify(res.data)
}
